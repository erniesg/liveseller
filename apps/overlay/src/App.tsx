import { useEffect, useState } from "react";
import type { OverlayState } from "@liveseller/contracts";
import { OverlayStateSchema, validLiveSessionSpec, validOverlayState } from "@liveseller/contracts";

export type OverlayConnectionStatus = "fixture" | "connecting" | "live" | "error";

type AppProps = {
  state?: OverlayState;
  now?: Date;
  connectionStatus?: OverlayConnectionStatus;
};

type RuntimeOverlayProps = {
  runtimeOrigin?: string;
  sessionId?: string;
  pollMs?: number;
  fetchImpl?: typeof fetch;
};

export function formatCountdown(endsAt: string, now = new Date()): string {
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - now.getTime());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export async function fetchOverlayState(
  runtimeOrigin: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<OverlayState> {
  const response = await fetchImpl(`${runtimeOrigin}/api/overlay/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Runtime overlay endpoint returned ${response.status}`);
  }
  return OverlayStateSchema.parse(await response.json());
}

export function RuntimeOverlay({
  runtimeOrigin = "http://127.0.0.1:8787",
  sessionId = validLiveSessionSpec.sessionId,
  pollMs = 1000,
  fetchImpl = fetch
}: RuntimeOverlayProps) {
  const [state, setState] = useState<OverlayState>(validOverlayState);
  const [connectionStatus, setConnectionStatus] = useState<OverlayConnectionStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function sync() {
      try {
        const nextState = await fetchOverlayState(runtimeOrigin, sessionId, fetchImpl);
        if (!cancelled) {
          setState(nextState);
          setConnectionStatus("live");
        }
      } catch {
        if (!cancelled) {
          setConnectionStatus("error");
        }
      }
    }

    setConnectionStatus("connecting");
    void sync();
    if (pollMs > 0) {
      timer = setInterval(() => {
        void sync();
      }, pollMs);
    }

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [fetchImpl, pollMs, runtimeOrigin, sessionId]);

  return <App state={state} connectionStatus={connectionStatus} />;
}

export function App({ state = validOverlayState, now, connectionStatus = "fixture" }: AppProps) {
  const backingLabel = state.promoBanner?.backing === "shopee" ? "Shopee-backed" : "Overlay-only";
  const statusLabel = connectionStatus === "live"
    ? "Runtime live"
    : connectionStatus === "connecting"
      ? "Runtime syncing"
      : connectionStatus === "error"
        ? "Runtime offline"
        : "Fixture mode";

  return (
    <main className="overlay-shell" aria-label="LiveSeller livestream overlay">
      <div className={`runtime-status runtime-status-${connectionStatus}`} aria-label="Overlay runtime status">
        <span aria-hidden="true" />
        <strong>{statusLabel}</strong>
      </div>

      <section className="top-band" aria-label="Current product and promotion">
        {state.productCard ? (
          <article className="product-card">
            <img src={state.productCard.imageUri} alt="" className="product-image" />
            <div className="product-copy">
              <p className="product-label">Now showing</p>
              <h1>{state.productCard.title}</h1>
              <p className="product-meta">
                {state.productCard.currency} {state.productCard.price.toFixed(2)}
                <span aria-hidden="true"> · </span>
                {state.productCard.stock} left
              </p>
            </div>
          </article>
        ) : null}

        {state.promoBanner ? (
          <aside className="promo-banner" aria-label="Live promotion">
            <span className="promo-source">{backingLabel}</span>
            <strong>{state.promoBanner.title}</strong>
            <span>{state.promoBanner.remainingQuantity} claims left</span>
            <span className="countdown">{formatCountdown(state.promoBanner.endsAt, now)}</span>
          </aside>
        ) : null}
      </section>

      <section className="caption-band" aria-label="Live captions">
        {state.caption.visible ? (
          <p className="source-caption" lang={state.caption.language}>
            {state.caption.text}
          </p>
        ) : null}
        <div className="translation-row">
          {state.translatedCaptions.map((caption) => (
            <p key={caption.language} className="translated-caption" lang={caption.language}>
              {caption.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
