import { useEffect, useMemo, useState } from "react";
import type { LanguageCode, LiveSessionSpec, OverlayState, RuntimeEvent } from "@liveseller/contracts";
import { LiveSessionSpecSchema, OverlayStateSchema, vintageJewelryLiveSessionSpec } from "@liveseller/contracts";
import { fetchOverlayState } from "./App";

type SellerConsoleProps = {
  runtimeOrigin?: string;
  sessionId?: string;
  fetchImpl?: typeof fetch;
};

type ConsoleStatus = "connecting" | "live" | "error";

type SellerAction = {
  actionId: string;
  type: string;
  risk: string;
  requiresApproval: boolean;
  reason: string;
  payload?: {
    kind?: string;
    text?: string;
    prompt?: string;
    proposedPublicText?: string;
    sellerMessage?: string;
    suggestedScript?: string;
    productId?: string;
  };
};

type RuntimeRouteResponse = {
  overlayState: OverlayState;
  actions: SellerAction[];
};

type SellerMemorySnapshot = {
  sessionMemory?: {
    topQuestions?: string[];
    productInterest?: Record<string, number>;
    escalations?: string[];
    recommendations?: string[];
  };
  viewerMemory?: Array<{
    viewerId: string;
    displayName?: string;
    knownQuestions?: string[];
    productAffinity?: Record<string, number>;
    riskFlags?: string[];
    lastSeenAt?: string;
  }>;
};

type RollingSummarySnapshot = {
  eventCount?: number;
  publicReplies?: number;
  escalations?: number;
  approvalsRequested?: number;
  orders?: number;
  viewerPeak?: number;
  recommendations?: string[];
};

type RealtimeToolCallResult = {
  status: "applied";
  tool: string;
  overlayState?: OverlayState;
  routed?: RuntimeRouteResponse;
  scriptSuggestion?: {
    productId: string;
    title: string;
    script: string;
  };
};

const hostTranscriptSamples = [
  "这枚金色葡萄叶胸针今天只有一枚，适合搭配黑色外套。",
  "This brooch is from our vintage jewelry showcase, ships from Singapore.",
  "这款蓝色石胸针线条比较优雅，库存只有一件。"
];

function eventId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

async function fetchSessionSpec(
  runtimeOrigin: string,
  sessionId: string,
  fetchImpl: typeof fetch
): Promise<LiveSessionSpec> {
  const response = await fetchImpl(`${runtimeOrigin}/api/live-sessions/${sessionId}/spec`);
  if (!response.ok) {
    throw new Error(`Runtime session spec returned ${response.status}`);
  }
  return LiveSessionSpecSchema.parse(await response.json());
}

async function postRuntimeEvent(
  runtimeOrigin: string,
  event: RuntimeEvent,
  fetchImpl: typeof fetch
): Promise<RuntimeRouteResponse> {
  const response = await fetchImpl(`${runtimeOrigin}/api/runtime/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
  if (!response.ok) {
    throw new Error(`Runtime event returned ${response.status}`);
  }
  const body = await response.json();
  return {
    overlayState: OverlayStateSchema.parse(body.overlayState),
    actions: Array.isArray(body.actions) ? body.actions : []
  };
}

async function fetchSellerMemory(
  runtimeOrigin: string,
  sessionId: string,
  fetchImpl: typeof fetch
): Promise<SellerMemorySnapshot> {
  const response = await fetchImpl(`${runtimeOrigin}/api/live-sessions/${sessionId}/memory`);
  if (!response.ok) {
    return {};
  }
  return await response.json() as SellerMemorySnapshot;
}

async function fetchRollingSummary(
  runtimeOrigin: string,
  sessionId: string,
  fetchImpl: typeof fetch
): Promise<RollingSummarySnapshot> {
  const response = await fetchImpl(`${runtimeOrigin}/api/live-sessions/${sessionId}/summary`);
  if (!response.ok) {
    return {};
  }
  return await response.json() as RollingSummarySnapshot;
}

function actionCueLabel(action: SellerAction): string {
  if (action.type === "send_reply" && action.risk === "low" && !action.requiresApproval) {
    return "Say this";
  }
  if (action.type === "request_approval" || action.requiresApproval) {
    return "Needs approval";
  }
  if (action.type === "escalate") {
    return "Escalate";
  }
  return "Runtime cue";
}

function actionCueText(action: SellerAction): string {
  return (
    action.payload?.text ??
    action.payload?.prompt ??
    action.payload?.sellerMessage ??
    action.payload?.suggestedScript ??
    action.reason
  );
}

export function SellerConsole({
  runtimeOrigin = "http://127.0.0.1:8787",
  sessionId = vintageJewelryLiveSessionSpec.sessionId,
  fetchImpl = fetch
}: SellerConsoleProps) {
  const [session, setSession] = useState<LiveSessionSpec>(vintageJewelryLiveSessionSpec);
  const [overlayState, setOverlayState] = useState<OverlayState | undefined>();
  const [status, setStatus] = useState<ConsoleStatus>("connecting");
  const [hostText, setHostText] = useState(hostTranscriptSamples[0]!);
  const [hostLanguage, setHostLanguage] = useState<LanguageCode>("zh");
  const [viewerText, setViewerText] = useState("How much is the gold grape brooch?");
  const [viewerName, setViewerName] = useState("Test Buyer");
  const [backgroundValue, setBackgroundValue] = useState("#0f766e");
  const [lastActions, setLastActions] = useState<RuntimeRouteResponse["actions"]>([]);
  const [lastResult, setLastResult] = useState("Ready");
  const [voiceAgentStatus, setVoiceAgentStatus] = useState("Realtime 2 voice agent not started");
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [sellerScript, setSellerScript] = useState("");
  const [sellerMemory, setSellerMemory] = useState<SellerMemorySnapshot>();
  const [rollingSummary, setRollingSummary] = useState<RollingSummarySnapshot>();

  const publicOverlayUrl = useMemo(() => {
    const params = new URLSearchParams({
      runtimeOrigin,
      sessionId
    });
    return `/?${params.toString()}`;
  }, [runtimeOrigin, sessionId]);
  const sellerVisibleActions = lastActions.filter((action) =>
    ["send_reply", "draft_reply", "request_approval", "escalate"].includes(action.type)
  );

  async function syncOverlay() {
    const nextState = await fetchOverlayState(runtimeOrigin, sessionId, fetchImpl);
    setOverlayState(nextState);
    return nextState;
  }

  async function syncSellerContext() {
    const [nextMemory, nextSummary] = await Promise.all([
      fetchSellerMemory(runtimeOrigin, sessionId, fetchImpl),
      fetchRollingSummary(runtimeOrigin, sessionId, fetchImpl)
    ]);
    setSellerMemory(nextMemory);
    setRollingSummary(nextSummary);
  }

  async function sendEvent(event: RuntimeEvent, label: string) {
    const routed = await postRuntimeEvent(runtimeOrigin, event, fetchImpl);
    setOverlayState(routed.overlayState);
    setLastActions(routed.actions);
    setLastResult(label);
    await syncSellerContext();
  }

  async function callRealtimeTool(name: string, args: Record<string, unknown>): Promise<RealtimeToolCallResult> {
    const response = await fetchImpl(`${runtimeOrigin}/api/runtime/realtime/tool-call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        callId: `${name}-${Date.now()}`,
        name,
        arguments: args
      })
    });
    if (!response.ok) {
      throw new Error(`Realtime tool returned ${response.status}`);
    }
    const result = await response.json() as RealtimeToolCallResult;
    if (result.overlayState) {
      setOverlayState(OverlayStateSchema.parse(result.overlayState));
    }
    if (result.routed?.actions) {
      setLastActions(result.routed.actions);
    }
    if (result.scriptSuggestion?.script) {
      setSellerScript(result.scriptSuggestion.script);
    }
    setToolLog((entries) => [`${result.tool}: ${result.scriptSuggestion?.script ?? result.overlayState?.background?.label ?? "applied"}`, ...entries].slice(0, 6));
    setLastResult(`${result.tool} applied`);
    await syncSellerContext();
    return result;
  }

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const [nextSession, nextOverlay, nextMemory, nextSummary] = await Promise.all([
          fetchSessionSpec(runtimeOrigin, sessionId, fetchImpl),
          fetchOverlayState(runtimeOrigin, sessionId, fetchImpl),
          fetchSellerMemory(runtimeOrigin, sessionId, fetchImpl),
          fetchRollingSummary(runtimeOrigin, sessionId, fetchImpl)
        ]);
        if (!cancelled) {
          setSession(nextSession);
          setOverlayState(nextOverlay);
          setSellerMemory(nextMemory);
          setRollingSummary(nextSummary);
          setStatus("live");
        }
      } catch {
        if (!cancelled) {
          setSession(vintageJewelryLiveSessionSpec);
          setStatus("error");
        }
      }
    }

    void connect();
    const timer = setInterval(() => {
      void syncOverlay().then(() => setStatus("live")).catch(() => setStatus("error"));
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [fetchImpl, runtimeOrigin, sessionId]);

  async function showProduct(productId: string) {
    await sendEvent(
      {
        eventId: eventId("seller-product-switch"),
        sessionId,
        timestamp: new Date().toISOString(),
        source: "seller",
        type: "product_switch",
        payload: { productId }
      },
      `Showing ${productId}`
    );
  }

  async function showProductWithAi(productId: string) {
    await callRealtimeTool("show_product_card", { productId });
  }

  async function promptSellerScript(productId: string) {
    await callRealtimeTool("prompt_seller_script", { productId });
  }

  async function startRealtimeAgent() {
    const response = await fetchImpl(`${runtimeOrigin}/api/runtime/realtime/agent-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        voice: "marin"
      })
    });
    if (!response.ok) {
      throw new Error(`Realtime agent session returned ${response.status}`);
    }
    await response.json();
    setVoiceAgentStatus("Realtime 2 voice agent ready");
    setToolLog((entries) => ["Realtime 2 voice agent ready: microphone/WebRTC session can call overlay tools.", ...entries].slice(0, 6));
  }

  async function startShow() {
    await sendEvent(
      {
        eventId: eventId("seller-show-start"),
        sessionId,
        timestamp: new Date().toISOString(),
        source: "seller",
        type: "stream_lifecycle",
        payload: {
          status: "started",
          reason: "Seller started the private run-of-show preview. RTMP credentials stay manual or server-side."
        }
      },
      "Show started"
    );

    for (const product of session.products.slice(0, 3)) {
      await showProduct(product.id);
    }
  }

  async function sendHostTranscript() {
    await sendEvent(
      {
        eventId: eventId("seller-host-transcript"),
        sessionId,
        timestamp: new Date().toISOString(),
        source: "host",
        type: "host_transcript",
        payload: {
          text: hostText,
          language: hostLanguage,
          confidence: 0.95
        }
      },
      "Host transcript sent"
    );
  }

  async function sendViewerChat() {
    await sendEvent(
      {
        eventId: eventId("seller-viewer-chat"),
        sessionId,
        timestamp: new Date().toISOString(),
        source: "viewer",
        type: "viewer_chat",
        payload: {
          viewerId: "seller-console-viewer",
          viewerName,
          text: viewerText,
          language: "en"
        }
      },
      "Viewer chat sent"
    );
  }

  async function applyBackground() {
    await callRealtimeTool("show_overlay_background", {
      mode: "solid",
      value: backgroundValue,
      label: "AI generated live background"
    });
  }

  return (
    <main className="seller-console-shell" aria-label="LiveSeller seller console">
      <header className="seller-console-header">
        <div>
          <p className="seller-console-kicker">Seller test console</p>
          <h1>{session.title}</h1>
          <p>{session.sessionId}</p>
          <p aria-label="Public overlay source">{publicOverlayUrl}</p>
        </div>
        <div className={`seller-console-status seller-console-status-${status}`}>
          <span aria-hidden="true" />
          <strong>{status === "live" ? "Runtime live" : status === "connecting" ? "Connecting" : "Runtime offline"}</strong>
        </div>
      </header>

      <section className="seller-console-grid">
        <section className="seller-panel product-context-panel" aria-label="Products to show">
          <div className="seller-panel-heading">
            <h2>Product context</h2>
            <div className="seller-heading-actions">
              <button type="button" onClick={() => void startShow()}>
                Start show
              </button>
              <a href={publicOverlayUrl} target="_blank" rel="noreferrer">Open overlay</a>
            </div>
          </div>
          <div className="seller-product-list">
            {session.products.map((product) => (
              <article
                key={product.id}
                className={overlayState?.currentProductId === product.id ? "seller-product active" : "seller-product"}
              >
                <img src={product.media.images[0]?.uri ?? "/assets/products/placeholder.jpg"} alt="" />
                <div>
                  <h3>{product.title}</h3>
                  <p>{product.currency} {product.price.toFixed(2)} · {product.stock} available</p>
                  <p>{product.sku}</p>
                </div>
                <button type="button" onClick={() => void showProduct(product.id)}>
                  Show
                </button>
                <button type="button" onClick={() => void showProductWithAi(product.id).catch((error) => setLastResult(error.message))}>
                  Show with AI
                </button>
                <button type="button" onClick={() => void promptSellerScript(product.id).catch((error) => setLastResult(error.message))}>
                  Seller script
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="seller-panel" aria-label="Video overlay test controls">
          <div className="seller-panel-heading">
            <h2>Video overlay</h2>
            <div className="seller-heading-actions">
              <button type="button" onClick={() => void startRealtimeAgent().catch((error) => setVoiceAgentStatus(error.message))}>
                Start Realtime 2 voice agent
              </button>
              <button type="button" onClick={() => void syncOverlay().then(() => setStatus("live")).catch(() => setStatus("error"))}>
                Sync
              </button>
            </div>
          </div>
          <p>{voiceAgentStatus}</p>
          <label>
            Host caption
            <textarea value={hostText} onChange={(event) => setHostText(event.target.value)} rows={4} />
          </label>
          <div className="seller-control-row">
            <select value={hostLanguage} onChange={(event) => setHostLanguage(event.target.value as LanguageCode)}>
              <option value="zh">Chinese</option>
              <option value="en">English</option>
              <option value="ms">Malay</option>
              <option value="ta">Tamil</option>
            </select>
            <button type="button" onClick={() => void sendHostTranscript()}>
              Send caption
            </button>
          </div>
          <div className="seller-sample-row">
            {hostTranscriptSamples.map((sample) => (
              <button key={sample} type="button" onClick={() => setHostText(sample)}>
                Sample
              </button>
            ))}
          </div>
          <label>
            Overlay background
            <input value={backgroundValue} onChange={(event) => setBackgroundValue(event.target.value)} />
          </label>
          <button type="button" onClick={() => void applyBackground().catch((error) => setLastResult(error.message))}>
            Generate AI background
          </button>
          <div className="seller-action-log">
            {toolLog.map((entry) => <p key={entry}>{entry}</p>)}
          </div>
        </section>

        <section className="seller-panel" aria-label="Viewer chat test">
          <div className="seller-panel-heading">
            <h2>Viewer chat</h2>
          </div>
          <label>
            Viewer
            <input value={viewerName} onChange={(event) => setViewerName(event.target.value)} />
          </label>
          <label>
            Message
            <input value={viewerText} onChange={(event) => setViewerText(event.target.value)} />
          </label>
          <button type="button" onClick={() => void sendViewerChat()}>
            Send to runtime
          </button>
        </section>

        <section className="seller-panel overlay-preview-panel" aria-label="Current overlay state">
          <div className="seller-panel-heading">
            <h2>Overlay state</h2>
            <span>{lastResult}</span>
          </div>
          <div className="seller-overlay-preview">
            {overlayState?.productCard ? (
              <>
                <img src={overlayState.productCard.imageUri} alt="" />
                <h3>{overlayState.productCard.title}</h3>
                <p>{overlayState.productCard.currency} {overlayState.productCard.price.toFixed(2)} · {overlayState.productCard.stock} left</p>
              </>
            ) : null}
            {overlayState?.caption.visible ? <blockquote>{overlayState.caption.text}</blockquote> : null}
            {overlayState?.translatedCaptions.map((caption) => (
              <p key={caption.language}>{caption.language}: {caption.text}</p>
            ))}
          </div>
          <div className="seller-action-log">
            {sellerVisibleActions.map((action) => (
              <p key={action.actionId}>{action.type} · {action.risk} · {action.requiresApproval ? "approval" : "auto"}</p>
            ))}
            {sellerScript ? <p>{sellerScript}</p> : null}
          </div>
        </section>

        <section className="seller-panel seller-guidance-panel" aria-label="Live guidance">
          <div className="seller-panel-heading">
            <h2>Live guidance</h2>
            <span>{rollingSummary?.eventCount ?? 0} events</span>
          </div>
          <div className="seller-guidance-list">
            {sellerVisibleActions.map((action) => (
              <article key={action.actionId} className={`seller-guidance-cue seller-guidance-${action.risk}`}>
                <span>{actionCueLabel(action)}</span>
                <strong>{actionCueText(action)}</strong>
                {action.payload?.proposedPublicText ? <p>{action.payload.proposedPublicText}</p> : null}
                <p>{action.reason}</p>
              </article>
            ))}
          </div>
          <div className="seller-memory-grid">
            <div>
              <h3>Top questions</h3>
              {(sellerMemory?.sessionMemory?.topQuestions ?? []).slice(0, 3).map((question) => (
                <p key={question}>{question}</p>
              ))}
            </div>
            <div>
              <h3>Buyer context</h3>
              {(sellerMemory?.viewerMemory ?? []).slice(0, 3).map((viewer) => (
                <p key={viewer.viewerId}>
                  {viewer.displayName ?? viewer.viewerId}: {(viewer.knownQuestions ?? [])[0] ?? "watching"}
                </p>
              ))}
            </div>
            <div>
              <h3>Session summary</h3>
              <p>{rollingSummary?.publicReplies ?? 0} public replies · {rollingSummary?.approvalsRequested ?? 0} approvals</p>
              {[...(sellerMemory?.sessionMemory?.recommendations ?? []), ...(rollingSummary?.recommendations ?? [])]
                .slice(0, 3)
                .map((recommendation) => (
                  <p key={recommendation}>{recommendation}</p>
                ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
