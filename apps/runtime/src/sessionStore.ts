import {
  type AuditEvent,
  type LiveAction,
  type LiveSessionSpec,
  type OverlayState,
  type ProductRecord,
  type RuntimeEvent,
  type SessionMemory,
  type ViewerMemory,
  OverlayStateSchema,
  SessionMemorySchema,
  ViewerMemorySchema,
  validSessionMemory
} from "@liveseller/contracts";
import { routeRuntimeEvent } from "./runtime";
import { createStreamAccumulator } from "./streamWatcher";
import { createInitialOverlayState } from "./overlay";

type RuntimeRouteResult = ReturnType<typeof routeRuntimeEvent>;

export type RuntimeSessionStoreSnapshot = {
  sessionId: string;
  session: LiveSessionSpec;
  products: ProductRecord[];
  currentProductId?: string;
  currentPromoId?: string;
  sessionMemory: SessionMemory;
  viewerMemory: ViewerMemory[];
  auditEvents: AuditEvent[];
  overlayState: OverlayState;
};

export type RuntimeSessionStore = {
  route(event: RuntimeEvent): RuntimeRouteResult & {
    rollingSummary: ReturnType<ReturnType<typeof createStreamAccumulator>["snapshot"]> | undefined;
  };
  getProduct(productId: string): ProductRecord | undefined;
  snapshot(): RuntimeSessionStoreSnapshot;
  summary(): ReturnType<ReturnType<typeof createStreamAccumulator>["snapshot"]>;
  overlay(): OverlayState;
  updateOverlayBackground(background: NonNullable<OverlayState["background"]>): OverlayState;
};

function now(): string {
  return new Date().toISOString();
}

function uniquePush(values: string[], value: string, limit: number): string[] {
  const next = values.filter((existing) => existing !== value);
  next.unshift(value);
  return next.slice(0, limit);
}

function actionProductId(action: LiveAction): string | undefined {
  return "productId" in action.payload ? action.payload.productId : undefined;
}

function buildInitialSessionMemory(session: LiveSessionSpec): SessionMemory {
  return SessionMemorySchema.parse({
    ...validSessionMemory,
    sessionId: session.sessionId,
    topQuestions: [],
    languageCounts: {},
    productInterest: Object.fromEntries(session.products.map((product) => [product.id, 0])),
    escalations: [],
    recommendations: [],
    updatedAt: now()
  });
}

export function createRuntimeSessionStore(session: LiveSessionSpec): RuntimeSessionStore {
  const productDb = new Map(session.products.map((product) => [product.id, product]));
  const viewerMemory = new Map<string, ViewerMemory>();
  const auditEvents: AuditEvent[] = [];
  const accumulator = createStreamAccumulator(session);
  let overlayState = createInitialOverlayState(session);
  let sessionMemory = buildInitialSessionMemory(session);
  let currentProductId = session.products[0]?.id;
  let currentPromoId = session.promos[0]?.id;

  function upsertViewerMemory(event: RuntimeEvent, actions: LiveAction[]) {
    if (event.type !== "viewer_chat") {
      return;
    }

    const productId = actions.map(actionProductId).find(Boolean) ?? currentProductId;
    const existing = viewerMemory.get(event.payload.viewerId);
    viewerMemory.set(
      event.payload.viewerId,
      ViewerMemorySchema.parse({
        viewerId: event.payload.viewerId,
        displayName: event.payload.viewerName,
        preferredLanguage: event.payload.language ?? existing?.preferredLanguage,
        knownQuestions: uniquePush(existing?.knownQuestions ?? [], event.payload.text, 10),
        productAffinity: {
          ...(existing?.productAffinity ?? {}),
          ...(productId
            ? { [productId]: (existing?.productAffinity[productId] ?? 0) + 1 }
            : {})
        },
        riskFlags: existing?.riskFlags ?? [],
        lastSeenAt: event.timestamp
      })
    );
  }

  function updateSessionMemory(event: RuntimeEvent, actions: LiveAction[]) {
    const languageCounts = { ...sessionMemory.languageCounts };
    const productInterest = { ...sessionMemory.productInterest };
    let topQuestions = sessionMemory.topQuestions;
    let escalations = sessionMemory.escalations;

    if (event.type === "viewer_chat") {
      topQuestions = uniquePush(topQuestions, event.payload.text, 10);
      const language = event.payload.language ?? "en";
      languageCounts[language] = (languageCounts[language] ?? 0) + 1;
    }

    for (const action of actions) {
      const productId = actionProductId(action);
      if (productId) {
        productInterest[productId] = (productInterest[productId] ?? 0) + 1;
      }
      if (action.type === "escalate" || action.type === "request_approval") {
        escalations = uniquePush(escalations, action.reason, 10);
      }
    }

    sessionMemory = SessionMemorySchema.parse({
      ...sessionMemory,
      topQuestions,
      languageCounts,
      productInterest,
      escalations,
      updatedAt: event.timestamp
    });
  }

  return {
    route(event) {
      if (event.sessionId !== session.sessionId) {
        throw new Error(`Runtime event sessionId ${event.sessionId} does not match ${session.sessionId}`);
      }
      if (event.type === "product_switch" && !productDb.has(event.payload.productId)) {
        throw new Error(`Runtime product_switch references unknown productId ${event.payload.productId}`);
      }
      if (
        event.type === "promo_update" &&
        !session.promos.some((promo) => promo.id === event.payload.promoId)
      ) {
        throw new Error(`Runtime promo_update references unknown promoId ${event.payload.promoId}`);
      }

      const result = routeRuntimeEvent(event, session, {
        viewerMemory: event.type === "viewer_chat" ? viewerMemory.get(event.payload.viewerId) : undefined,
        sessionMemory,
        currentProductId,
        currentPromoId,
        overlayState
      });

      auditEvents.push(...result.auditEvents);
      overlayState = result.overlayState;
      upsertViewerMemory(event, result.actions);
      updateSessionMemory(event, result.actions);

      if (event.type === "product_switch") {
        currentProductId = event.payload.productId;
      } else if (event.type === "promo_update") {
        currentPromoId = event.payload.promoId;
      }

      const rollingSummary = accumulator.observe(event, {
        actions: result.actions,
        auditEvents: result.auditEvents
      });

      return {
        ...result,
        rollingSummary
      };
    },

    getProduct(productId) {
      return productDb.get(productId);
    },

    snapshot() {
      return {
        sessionId: session.sessionId,
        session,
        products: [...productDb.values()],
        currentProductId,
        currentPromoId,
        sessionMemory,
        viewerMemory: [...viewerMemory.values()],
        auditEvents,
        overlayState
      };
    },

    summary() {
      return accumulator.snapshot();
    },

    overlay() {
      return overlayState;
    },

    updateOverlayBackground(background) {
      overlayState = OverlayStateSchema.parse({
        ...overlayState,
        background,
        updatedAt: now()
      });
      return overlayState;
    }
  };
}
