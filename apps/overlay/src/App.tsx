import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  readonly resultIndex: number;
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

async function clearRuntimeCaptions(runtimeBaseUrl: string): Promise<OverlayState> {
  const response = await fetch(`${runtimeBaseUrl}/api/runtime/captions/clear`, {
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Runtime rejected caption clear with HTTP ${response.status}`);
  }

  return (await response.json()) as OverlayState;
}

function HostLiveControls({
  runtimeBaseUrl,
  onState,
  onActiveChange
}: {
  runtimeBaseUrl: string;
  onState: Dispatch<SetStateAction<OverlayState>>;
  onActiveChange: (active: boolean) => void;
}) {
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("ms");
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [manualText, setManualText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const requestSeqRef = useRef(0);
  const activeSeqRef = useRef(0);

  function logHost(event: string, details: Record<string, unknown> = {}) {
    const message = `${new Date().toLocaleTimeString()} ${event} ${JSON.stringify(details)}`;
    console.log(`[overlay:${event}]`, details);
    setLogs((previous) => [message, ...previous].slice(0, 6));
  }

  function clearLocalCaptions() {
    onState((previous) => ({
      ...previous,
      caption: {
        ...previous.caption,
        text: "",
        language: sourceLanguage,
        visible: false
      },
      translatedCaptions: [],
      updatedAt: new Date().toISOString()
    }));
  }

  async function clearCaptions() {
    requestSeqRef.current += 1;
    clearLocalCaptions();
    try {
      onState(await clearRuntimeCaptions(runtimeBaseUrl));
      logHost("captions.clear");
    } catch {
      logHost("captions.clear_failed");
      setStatus("Ready");
    }
  }

  async function sendTranscript(text: string) {
    if (!text.trim()) {
      return;
    }
    const transcript = text.trim();
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const startedAt = performance.now();
    onState((previous) => ({
      ...previous,
      caption: {
        text: transcript,
        language: sourceLanguage,
        visible: true
      },
      translatedCaptions: [],
      updatedAt: new Date().toISOString()
    }));
    setStatus("Translating");
    logHost("transcript.request", {
      requestSeq,
      sourceLanguage,
      targetLanguage,
      textLength: transcript.length
    });
    const nextState = await postHostTranscript(
      runtimeBaseUrl,
      transcript,
      sourceLanguage,
      targetLanguage
    );
    if (requestSeq !== requestSeqRef.current) {
      logHost("transcript.stale_ignored", {
        requestSeq,
        activeRequestSeq: requestSeqRef.current
      });
      return;
    }
    onState(nextState);
    setStatus("Live");
    logHost("transcript.response", {
      requestSeq,
      ms: Math.round(performance.now() - startedAt),
      translations: nextState.translatedCaptions.map((caption) => caption.language)
    });
  }

  useEffect(() => {
    if (sourceLanguage === targetLanguage) {
      setTargetLanguage(languageOptions.find((language) => language.code !== sourceLanguage)?.code ?? "en");
    }
  }, [sourceLanguage, targetLanguage]);

  useEffect(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    onActiveChange(false);
    setManualText("");
    void clearCaptions();
  }, [sourceLanguage, targetLanguage]);

  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Speech recognition unavailable");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang =
      languageOptions.find((language) => language.code === sourceLanguage)?.speechCode ?? "en-SG";
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) {
          continue;
        }
        const transcript = result[0]?.transcript.trim();
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          logHost("speech.final", { textLength: transcript.length });
          void sendTranscript(transcript).catch(() => setStatus("Runtime error"));
        } else {
          onState((previous) => ({
            ...previous,
            caption: {
              text: transcript,
              language: sourceLanguage,
              visible: true
            },
            translatedCaptions: [],
            updatedAt: new Date().toISOString()
          }));
          logHost("speech.interim", { textLength: transcript.length });
        }
      }
    };
    recognition.onerror = () => {
      logHost("speech.error");
      setStatus("Mic error");
    };
    const sessionSeq = activeSeqRef.current + 1;
    activeSeqRef.current = sessionSeq;
    recognition.onend = () => {
      if (activeSeqRef.current === sessionSeq) {
        setIsListening(false);
        onActiveChange(false);
        logHost("speech.end", { sessionSeq });
      }
    };
    void clearCaptions();
    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    onActiveChange(true);
    setStatus("Listening");
    logHost("speech.start", {
      sourceLanguage,
      targetLanguage,
      speechCode: recognition.lang,
      sessionSeq
    });
  }

  function stopListening() {
    activeSeqRef.current += 1;
    requestSeqRef.current += 1;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    onActiveChange(false);
    void clearCaptions();
    setStatus("Ready");
    logHost("speech.stop");
  }

  function submitManualTranscript() {
    void sendTranscript(manualText).catch(() => setStatus("Runtime error"));
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
      <input
        aria-label="Manual transcript"
        placeholder="Type transcript"
        value={manualText}
        onChange={(event) => setManualText(event.target.value)}
      />
      <button type="button" onClick={submitManualTranscript}>
        Send
      </button>
      <ol className="host-log" aria-label="Host translator logs">
        {logs.map((log, index) => (
          <li key={`${index}-${log}`}>{log}</li>
        ))}
      </ol>
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
  const [liveControlsActive, setLiveControlsActive] = useState(false);
  const displayState = state ?? liveState;
  const backingLabel =
    displayState.promoBanner?.backing === "shopee" ? "Shopee-backed" : "Overlay-only";

  useEffect(() => {
    if (state) {
      return;
    }

    let cancelled = false;
    const loadState = async () => {
      if (liveControlsActive) {
        return;
      }
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
  }, [liveControlsActive, runtimeBaseUrl, state]);

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
        <HostLiveControls
          runtimeBaseUrl={runtimeBaseUrl}
          onActiveChange={setLiveControlsActive}
          onState={setLiveState}
        />
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
