import { useEffect, useRef, useState } from "react";
import type { LanguageCode, OverlayState } from "@liveseller/contracts";
import { validOverlayState } from "@liveseller/contracts";

type AppProps = {
  state?: OverlayState;
  now?: Date;
  enableLiveControls?: boolean;
  runtimeBaseUrl?: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: {
    readonly transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const languageOptions: Array<{ code: LanguageCode; label: string; speechCode: string }> = [
  { code: "en", label: "English", speechCode: "en-SG" },
  { code: "zh", label: "Chinese", speechCode: "zh-CN" },
  { code: "ms", label: "Malay", speechCode: "ms-MY" },
  { code: "ta", label: "Tamil", speechCode: "ta-IN" }
];

export function formatCountdown(endsAt: string, now = new Date()): string {
  const remainingMs = Math.max(0, new Date(endsAt).getTime() - now.getTime());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function postHostTranscript(
  runtimeBaseUrl: string,
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Promise<OverlayState> {
  const response = await fetch(`${runtimeBaseUrl}/api/runtime/host-transcripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, sourceLanguage, targetLanguage })
  });

  if (!response.ok) {
    throw new Error(`Runtime rejected host transcript with HTTP ${response.status}`);
  }

  const routed = (await response.json()) as { overlayState: OverlayState };
  return routed.overlayState;
}

function HostLiveControls({
  runtimeBaseUrl,
  onState
}: {
  runtimeBaseUrl: string;
  onState: (state: OverlayState) => void;
}) {
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("ms");
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function sendTranscript(text: string) {
    if (!text.trim()) {
      return;
    }
    setStatus("Translating");
    const nextState = await postHostTranscript(
      runtimeBaseUrl,
      text.trim(),
      sourceLanguage,
      targetLanguage
    );
    onState(nextState);
    setStatus("Live");
  }

  useEffect(() => {
    if (sourceLanguage === targetLanguage) {
      setTargetLanguage(languageOptions.find((language) => language.code !== sourceLanguage)?.code ?? "en");
    }
  }, [sourceLanguage, targetLanguage]);

  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Speech recognition unavailable");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang =
      languageOptions.find((language) => language.code === sourceLanguage)?.speechCode ?? "en-SG";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript;
      if (result?.isFinal && transcript) {
        void sendTranscript(transcript).catch(() => setStatus("Runtime error"));
      }
    };
    recognition.onerror = () => setStatus("Mic error");
    recognition.onend = () => setIsListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setStatus("Listening");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setStatus("Ready");
  }

  return (
    <aside className="host-controls" aria-label="Host live translator">
      <select
        aria-label="Source language"
        value={sourceLanguage}
        onChange={(event) => setSourceLanguage(event.target.value as LanguageCode)}
      >
        {languageOptions.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Translation language"
        value={targetLanguage}
        onChange={(event) => setTargetLanguage(event.target.value as LanguageCode)}
      >
        {languageOptions
          .filter((language) => language.code !== sourceLanguage)
          .map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
      </select>
      <button type="button" onClick={isListening ? stopListening : startListening}>
        {isListening ? "Stop" : "Start"}
      </button>
      <span>{status}</span>
    </aside>
  );
}

export function App({
  state,
  now,
  enableLiveControls = false,
  runtimeBaseUrl = "http://127.0.0.1:8787"
}: AppProps) {
  const [liveState, setLiveState] = useState<OverlayState>(state ?? validOverlayState);
  const displayState = state ?? liveState;
  const backingLabel =
    displayState.promoBanner?.backing === "shopee" ? "Shopee-backed" : "Overlay-only";

  useEffect(() => {
    if (state) {
      return;
    }

    let cancelled = false;
    const loadState = async () => {
      const response = await fetch(`${runtimeBaseUrl}/api/runtime/overlay-state`);
      if (!response.ok || cancelled) {
        return;
      }
      setLiveState((await response.json()) as OverlayState);
    };
    void loadState();
    const interval = window.setInterval(() => void loadState(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runtimeBaseUrl, state]);

  return (
    <main className="overlay-shell" aria-label="LiveSeller livestream overlay">
      <section className="top-band" aria-label="Current product and promotion">
        {displayState.productCard ? (
          <article className="product-card">
            <img src={displayState.productCard.imageUri} alt="" className="product-image" />
            <div className="product-copy">
              <p className="product-label">Now showing</p>
              <h1>{displayState.productCard.title}</h1>
              <p className="product-meta">
                {displayState.productCard.currency} {displayState.productCard.price.toFixed(2)}
                <span aria-hidden="true"> · </span>
                {displayState.productCard.stock} left
              </p>
            </div>
          </article>
        ) : null}

        {displayState.promoBanner ? (
          <aside className="promo-banner" aria-label="Live promotion">
            <span className="promo-source">{backingLabel}</span>
            <strong>{displayState.promoBanner.title}</strong>
            <span>{displayState.promoBanner.remainingQuantity} claims left</span>
            <span className="countdown">{formatCountdown(displayState.promoBanner.endsAt, now)}</span>
          </aside>
        ) : null}
      </section>

      {enableLiveControls ? (
        <HostLiveControls runtimeBaseUrl={runtimeBaseUrl} onState={setLiveState} />
      ) : null}

      <section className="caption-band" aria-label="Live captions">
        {displayState.caption.visible ? (
          <p className="source-caption" lang={displayState.caption.language}>
            {displayState.caption.text}
          </p>
        ) : null}
        <div className="translation-row">
          {displayState.translatedCaptions.map((caption) => (
            <p key={caption.language} className="translated-caption" lang={caption.language}>
              {caption.text}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
