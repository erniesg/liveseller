import {
  type AuditEvent,
  type LanguageCode,
  type LiveAction,
  type LiveSessionSpec,
  type RuntimeEvent,
  type SessionMemory,
  SessionMemorySchema
} from "@liveseller/contracts";

const now = () => new Date().toISOString();

type MutableMemory = Omit<SessionMemory, "topQuestions" | "escalations" | "recommendations"> & {
  topQuestions: string[];
  escalations: string[];
  recommendations: string[];
};

export function createInitialSessionMemory(
  session: LiveSessionSpec,
  updatedAt: string = now()
): SessionMemory {
  return SessionMemorySchema.parse({
    sessionId: session.sessionId,
    topQuestions: [],
    languageCounts: {},
    productInterest: {},
    escalations: [],
    recommendations: [],
    updatedAt
  });
}

export function buildSessionMemoryFromAudit(
  session: LiveSessionSpec,
  auditEvents: AuditEvent[],
  updatedAt: string = now()
): SessionMemory {
  const memory: MutableMemory = {
    ...createInitialSessionMemory(session, updatedAt)
  };

  for (const auditEvent of auditEvents) {
    if (auditEvent.event) {
      updateFromEvent(memory, session, auditEvent.event);
    }
    if (auditEvent.action) {
      updateFromAction(memory, auditEvent.action);
    }
  }

  memory.topQuestions = topEntries(memory.topQuestions);
  memory.escalations = [...new Set(memory.escalations)].slice(0, 5);
  memory.recommendations = buildRecommendations(session, memory);

  return SessionMemorySchema.parse(memory);
}

function updateFromEvent(
  memory: MutableMemory,
  session: LiveSessionSpec,
  event: RuntimeEvent
): void {
  if (event.type !== "viewer_chat") {
    return;
  }

  const text = event.payload.text.trim();
  if (text) {
    memory.topQuestions.push(text);
  }

  const language = event.payload.language;
  if (language) {
    incrementLanguage(memory, language);
  }

  const productId = resolveProductId(text, session);
  if (productId) {
    incrementProductInterest(memory, productId);
  }
}

function updateFromAction(memory: MutableMemory, action: LiveAction): void {
  const payload = action.payload;

  if (
    (payload.kind === "send_reply" || payload.kind === "draft_reply") &&
    payload.productId
  ) {
    incrementProductInterest(memory, payload.productId);
    incrementLanguage(memory, payload.language);
  }

  if (payload.kind === "record_memory") {
    memory.topQuestions.push(payload.note);
    if (payload.productId) {
      incrementProductInterest(memory, payload.productId);
    }
  }

  if (payload.kind === "escalate") {
    memory.escalations.push(payload.sellerMessage);
  }

  if (action.requiresApproval || action.risk === "high" || action.risk === "blocked") {
    memory.escalations.push(action.reason);
  }
}

function resolveProductId(text: string, session: LiveSessionSpec): string | undefined {
  const normalized = text.toLowerCase();
  return session.products.find((product) => {
    const names = [product.title, product.sku, ...product.aliases].map((value) =>
      value.toLowerCase()
    );
    return names.some((name) => normalized.includes(name));
  })?.id;
}

function incrementLanguage(memory: MutableMemory, language: LanguageCode): void {
  memory.languageCounts[language] = (memory.languageCounts[language] ?? 0) + 1;
}

function incrementProductInterest(memory: MutableMemory, productId: string): void {
  memory.productInterest[productId] = (memory.productInterest[productId] ?? 0) + 1;
}

function topEntries(values: string[]): string[] {
  const counts = values.reduce<Map<string, number>>((acc, value) => {
    acc.set(value, (acc.get(value) ?? 0) + 1);
    return acc;
  }, new Map());

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value]) => value)
    .slice(0, 5);
}

function buildRecommendations(session: LiveSessionSpec, memory: MutableMemory): string[] {
  const recommendations: string[] = [];
  const topProductId = Object.entries(memory.productInterest).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0]?.[0];
  const topProduct =
    session.products.find((product) => product.id === topProductId) ?? session.products[0];

  if (topProduct) {
    recommendations.push(
      `Start the next stream with ${topProduct.title}; it drew the strongest viewer interest.`
    );
  }

  const topLanguage = Object.entries(memory.languageCounts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0]?.[0];
  if (topLanguage && topLanguage !== "en") {
    recommendations.push(`Prepare ${topLanguage} captions and reply snippets before going live again.`);
  }

  if (session.promos.some((promo) => promo.source !== "shopee")) {
    recommendations.push("Verify overlay-only promos in Shopee Seller Centre before promising them publicly.");
  }

  if (memory.escalations.length > 0) {
    recommendations.push("Keep refund, fake-product, legal, fraud, and discount-negotiation replies behind seller approval.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Review viewer questions and pin the clearest structured product facts for the next stream.");
  }

  return recommendations;
}
