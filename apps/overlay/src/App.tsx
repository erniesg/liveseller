import type { OverlayState } from "@liveseller/contracts";
import { validOverlayState } from "@liveseller/contracts";

type AppProps = {
  state?: OverlayState;
  now?: Date;
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

export function App({ state = validOverlayState, now }: AppProps) {
  const backingLabel = state.promoBanner?.backing === "shopee" ? "Shopee-backed" : "Overlay-only";

  return (
    <main className="overlay-shell" aria-label="LiveSeller livestream overlay">
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
