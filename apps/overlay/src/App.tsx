import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { OverlayState } from "@liveseller/contracts";
import { OverlayStateSchema, validLiveSessionSpec, validOverlayState } from "@liveseller/contracts";

export type OverlayConnectionStatus = "fixture" | "connecting" | "live" | "error";

type AppProps = {
  state?: OverlayState;
  now?: Date;
  connectionStatus?: OverlayConnectionStatus;
  transparent?: boolean;
  cameraEnabled?: boolean;
};

type RuntimeOverlayProps = {
  runtimeOrigin?: string;
  sessionId?: string;
  pollMs?: number;
  fetchImpl?: typeof fetch;
  transparent?: boolean;
  cameraEnabled?: boolean;
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
  fetchImpl = fetch,
  transparent = false,
  cameraEnabled = true
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

  return <App state={state} connectionStatus={connectionStatus} transparent={transparent} cameraEnabled={cameraEnabled} />;
}

function SellerCameraFeed() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraState, setCameraState] = useState<"starting" | "live" | "unavailable">("starting");

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraState("unavailable");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraState("live");
        }
      } catch {
        if (!cancelled) {
          setCameraState("unavailable");
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="overlay-camera-plane" data-camera-state={cameraState}>
      <video
        ref={videoRef}
        aria-label="Seller camera feed"
        className="overlay-camera-video"
        autoPlay
        muted
        playsInline
      />
    </div>
  );
}

export function App({
  state = validOverlayState,
  now,
  connectionStatus = "fixture",
  transparent = false,
  cameraEnabled = true
}: AppProps) {
  const productCardVisible = state.productCard && state.productCard.visible !== false;
  const captionsVisible = (state.caption.visible && state.caption.text.length > 0) || state.translatedCaptions.length > 0;
  const backgroundStyle = state.background?.mode === "solid"
    ? { "--liveseller-overlay-background": state.background.value } as CSSProperties
    : undefined;
  const backgroundMode = state.background?.mode ?? "default";
  const backgroundVisible = backgroundMode !== "off";
  const shellClasses = [
    "overlay-shell",
    transparent ? "overlay-shell-transparent" : "",
    `overlay-bg-${backgroundMode}`,
    productCardVisible ? "overlay-has-product" : "",
    captionsVisible ? "overlay-has-captions" : ""
  ].filter(Boolean).join(" ");

  return (
    <main
      className={shellClasses}
      style={backgroundStyle}
      aria-label="LiveSeller livestream overlay"
    >
      <section className="overlay-stage" aria-label="Livestream display stage">
        {backgroundVisible ? (
          <div className="overlay-bg-layer" aria-hidden="true">
            <div className="overlay-bg-preset overlay-bg-preset-default">
              <div className="overlay-bg-gradient" />
              <div className="overlay-bg-sale-text">FLASH SALE</div>
            </div>
            <div className="overlay-bg-preset overlay-bg-preset-kinetic">
              <div className="overlay-kinetic-row overlay-kinetic-row-top">FLASH SALE | LIVE NOW | FLASH SALE | LIVE NOW | FLASH SALE | LIVE NOW |</div>
              <div className="overlay-kinetic-row overlay-kinetic-row-mid">LIMITED DROP | LIMITED DROP | LIMITED DROP | LIMITED DROP |</div>
              <div className="overlay-kinetic-row overlay-kinetic-row-bottom">SHOP THE LIVE | ASK THE SELLER | SHOP THE LIVE | ASK THE SELLER |</div>
            </div>
          </div>
        ) : null}
        {cameraEnabled ? <SellerCameraFeed /> : null}

        <div className="overlay-slot" aria-live="polite">
          {state.promoBanner ? (
            <aside className="overlay-panel overlay-panel-promo" aria-label="Live promotion">
              <div className="overlay-panel-copy">
                <p>Live offer</p>
                <h2>{state.promoBanner.title}</h2>
                <span>{state.promoBanner.remainingQuantity} claims left</span>
              </div>
              <strong className="countdown">{formatCountdown(state.promoBanner.endsAt, now)}</strong>
            </aside>
          ) : null}

          {productCardVisible ? (
            <article className="overlay-panel overlay-panel-lower-third" aria-label="Current product overlay">
              <img src={state.productCard!.imageUri} alt="" className="product-image" />
              <div className="overlay-panel-copy">
                <p>Now showing</p>
                <h1>{state.productCard!.title}</h1>
                <span>
                  {state.productCard!.currency} {state.productCard!.price.toFixed(2)}
                  <span aria-hidden="true"> · </span>
                  {state.productCard!.stock} left
                </span>
              </div>
            </article>
          ) : null}
        </div>

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
      </section>
    </main>
  );
}
