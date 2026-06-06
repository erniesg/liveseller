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

type RuntimeRouteResponse = {
  overlayState: OverlayState;
  actions: Array<{ actionId: string; type: string; risk: string; requiresApproval: boolean; reason: string }>;
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
  const [lastActions, setLastActions] = useState<RuntimeRouteResponse["actions"]>([]);
  const [lastResult, setLastResult] = useState("Ready");

  const publicOverlayUrl = useMemo(() => {
    const params = new URLSearchParams({
      runtimeOrigin,
      sessionId
    });
    return `/?${params.toString()}`;
  }, [runtimeOrigin, sessionId]);

  async function syncOverlay() {
    const nextState = await fetchOverlayState(runtimeOrigin, sessionId, fetchImpl);
    setOverlayState(nextState);
    return nextState;
  }

  async function sendEvent(event: RuntimeEvent, label: string) {
    const routed = await postRuntimeEvent(runtimeOrigin, event, fetchImpl);
    setOverlayState(routed.overlayState);
    setLastActions(routed.actions);
    setLastResult(label);
  }

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const [nextSession, nextOverlay] = await Promise.all([
          fetchSessionSpec(runtimeOrigin, sessionId, fetchImpl),
          fetchOverlayState(runtimeOrigin, sessionId, fetchImpl)
        ]);
        if (!cancelled) {
          setSession(nextSession);
          setOverlayState(nextOverlay);
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

  return (
    <main className="seller-console-shell" aria-label="LiveSeller seller console">
      <header className="seller-console-header">
        <div>
          <p className="seller-console-kicker">Seller test console</p>
          <h1>{session.title}</h1>
          <p>{session.sessionId}</p>
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
            <a href={publicOverlayUrl} target="_blank" rel="noreferrer">Open overlay</a>
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
              </article>
            ))}
          </div>
        </section>

        <section className="seller-panel" aria-label="Video overlay test controls">
          <div className="seller-panel-heading">
            <h2>Video overlay</h2>
            <button type="button" onClick={() => void syncOverlay().then(() => setStatus("live")).catch(() => setStatus("error"))}>
              Sync
            </button>
          </div>
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
            {lastActions.map((action) => (
              <p key={action.actionId}>{action.type} · {action.risk} · {action.requiresApproval ? "approval" : "auto"}</p>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
