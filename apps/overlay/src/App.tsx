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
const interimTranslationDelayMs = 450;
const recognitionRestartDelayMs = 180;

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

function extractRealtimeClientSecret(body: unknown): string | undefined {
  if (body && typeof body === "object" && "value" in body && typeof body.value === "string") {
    return body.value;
  }

  if (
    body &&
    typeof body === "object" &&
    "client_secret" in body &&
    body.client_secret &&
    typeof body.client_secret === "object" &&
    "value" in body.client_secret &&
    typeof body.client_secret.value === "string"
  ) {
    return body.client_secret.value;
  }

  return undefined;
}

async function createRealtimeTranslationSession(
  runtimeBaseUrl: string,
  targetLanguage: LanguageCode
): Promise<string> {
  const response = await fetch(`${runtimeBaseUrl}/api/runtime/realtime-translation/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetLanguage })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Realtime translation session failed with HTTP ${response.status}`
    );
  }

  const clientSecret = extractRealtimeClientSecret(body);
  if (!clientSecret) {
    throw new Error("Realtime translation session returned no client secret");
  }
  return clientSecret;
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
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const requestSeqRef = useRef(0);
  const activeSeqRef = useRef(0);
  const shouldListenRef = useRef(false);
  const interimTranslationTimerRef = useRef<number | null>(null);
  const recognitionRestartTimerRef = useRef<number | null>(null);
  const lastSpokenSeqRef = useRef(0);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeTranscriptRef = useRef("");

  function logHost(event: string, details: Record<string, unknown> = {}) {
    const message = `${new Date().toLocaleTimeString()} ${event} ${JSON.stringify(details)}`;
    console.log(`[overlay:${event}]`, details);
    setLogs((previous) => [message, ...previous].slice(0, 6));
  }

  function cancelInterimTranslation() {
    if (interimTranslationTimerRef.current !== null) {
      window.clearTimeout(interimTranslationTimerRef.current);
      interimTranslationTimerRef.current = null;
    }
  }

  function cancelRecognitionRestart() {
    if (recognitionRestartTimerRef.current !== null) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
  }

  function stopRealtimeTranslation() {
    realtimePeerRef.current?.close();
    realtimePeerRef.current = null;
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeStreamRef.current = null;
    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current = null;
    }
    realtimeTranscriptRef.current = "";
  }

  function applyRealtimeTranscriptDelta(delta: string) {
    realtimeTranscriptRef.current += delta;
    const translatedText = realtimeTranscriptRef.current.trim();
    if (!translatedText) {
      return;
    }

    onState((previous) => ({
      ...previous,
      caption: {
        text: "Realtime translation active",
        language: sourceLanguage,
        visible: true
      },
      translatedCaptions: [
        {
          language: targetLanguage,
          text: translatedText
        }
      ],
      updatedAt: new Date().toISOString()
    }));
  }

  function targetSpeechCode() {
    return languageOptions.find((language) => language.code === targetLanguage)?.speechCode ?? "en-SG";
  }

  function speakTranslatedAudio(nextState: OverlayState, requestSeq: number, phase: "interim" | "final" | "manual") {
    if (!audioEnabled || requestSeq <= lastSpokenSeqRef.current || typeof window.speechSynthesis === "undefined") {
      return;
    }

    const translatedCaption = nextState.translatedCaptions.find(
      (caption) => caption.language === targetLanguage
    );
    if (!translatedCaption?.text.trim() || typeof SpeechSynthesisUtterance === "undefined") {
      logHost("audio.unavailable", { requestSeq, phase });
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(translatedCaption.text.trim());
    utterance.lang = targetSpeechCode();
    utterance.rate = 1.04;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    lastSpokenSeqRef.current = requestSeq;
    logHost("audio.speak", {
      requestSeq,
      phase,
      targetLanguage,
      textLength: translatedCaption.text.length
    });
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
    cancelInterimTranslation();
    clearLocalCaptions();
    try {
      onState(await clearRuntimeCaptions(runtimeBaseUrl));
      logHost("captions.clear");
    } catch {
      logHost("captions.clear_failed");
      setStatus("Ready");
    }
  }

  async function sendTranscript(text: string, phase: "interim" | "final" | "manual" = "final") {
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
    setStatus(phase === "interim" ? "Translating partial" : "Translating");
    logHost("transcript.request", {
      requestSeq,
      phase,
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
    speakTranslatedAudio(nextState, requestSeq, phase);
    setStatus("Live");
    logHost("transcript.response", {
      requestSeq,
      phase,
      ms: Math.round(performance.now() - startedAt),
      translations: nextState.translatedCaptions.map((caption) => caption.language)
    });
  }

  function showInterimTranscript(transcript: string) {
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
  }

  function queueInterimTranslation(transcript: string) {
    cancelInterimTranslation();
    interimTranslationTimerRef.current = window.setTimeout(() => {
      interimTranslationTimerRef.current = null;
      void sendTranscript(transcript, "interim").catch(() => setStatus("Runtime error"));
    }, interimTranslationDelayMs);
  }

  useEffect(() => {
    if (sourceLanguage === targetLanguage) {
      setTargetLanguage(languageOptions.find((language) => language.code !== sourceLanguage)?.code ?? "en");
    }
  }, [sourceLanguage, targetLanguage]);

  useEffect(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopRealtimeTranslation();
    setIsListening(false);
    shouldListenRef.current = false;
    cancelRecognitionRestart();
    onActiveChange(false);
    setManualText("");
    void clearCaptions();
  }, [sourceLanguage, targetLanguage]);

  function createRecognition(sessionSeq: number) {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Speech recognition unavailable");
      return null;
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
          cancelInterimTranslation();
          logHost("speech.final", { textLength: transcript.length });
          void sendTranscript(transcript, "final").catch(() => setStatus("Runtime error"));
        } else {
          showInterimTranscript(transcript);
          queueInterimTranslation(transcript);
          setStatus("Listening");
          logHost("speech.interim", { textLength: transcript.length });
        }
      }
    };
    recognition.onerror = () => {
      logHost("speech.error");
      setStatus("Mic error");
    };
    recognition.onend = () => {
      if (activeSeqRef.current !== sessionSeq) {
        return;
      }
      if (shouldListenRef.current) {
        setStatus("Restarting mic");
        cancelRecognitionRestart();
        recognitionRestartTimerRef.current = window.setTimeout(() => {
          if (shouldListenRef.current && activeSeqRef.current === sessionSeq) {
            const nextRecognition = createRecognition(sessionSeq);
            if (!nextRecognition) {
              setIsListening(false);
              onActiveChange(false);
              return;
            }
            recognitionRef.current = nextRecognition;
            nextRecognition.start();
            setStatus("Listening");
            logHost("speech.restart", { sessionSeq });
          }
        }, recognitionRestartDelayMs);
        return;
      }
      setIsListening(false);
      onActiveChange(false);
      cancelInterimTranslation();
      logHost("speech.end", { sessionSeq });
    };
    return recognition;
  }

  async function startListening() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setStatus("Realtime audio unavailable");
      logHost("realtime.unavailable");
      return;
    }

    cancelRecognitionRestart();
    shouldListenRef.current = true;
    const sessionSeq = activeSeqRef.current + 1;
    activeSeqRef.current = sessionSeq;
    void clearCaptions();
    setIsListening(true);
    onActiveChange(true);
    setStatus("Connecting realtime");
    logHost("realtime.start", {
      sourceLanguage,
      targetLanguage,
      sessionSeq
    });

    try {
      const clientSecret = await createRealtimeTranslationSession(runtimeBaseUrl, targetLanguage);
      if (!shouldListenRef.current || activeSeqRef.current !== sessionSeq) {
        return;
      }

      const sourceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeStreamRef.current = sourceStream;

      const peer = new RTCPeerConnection();
      realtimePeerRef.current = peer;
      const audioTrack = sourceStream.getAudioTracks()[0];
      if (audioTrack) {
        peer.addTrack(audioTrack, sourceStream);
      }

      const translatedAudio = new Audio();
      translatedAudio.autoplay = true;
      translatedAudio.muted = !audioEnabled;
      realtimeAudioRef.current = translatedAudio;
      peer.ontrack = ({ streams }) => {
        translatedAudio.srcObject = streams[0] ?? null;
        void translatedAudio.play().catch(() => {
          logHost("realtime.audio_play_blocked");
        });
        logHost("realtime.audio_track");
      };

      const events = peer.createDataChannel("oai-events");
      events.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(String(data)) as { type?: string; delta?: unknown };
          if (event.type === "session.output_transcript.delta" && typeof event.delta === "string") {
            applyRealtimeTranscriptDelta(event.delta);
          }
        } catch {
          logHost("realtime.event_parse_failed");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/translations/calls", {
        method: "POST",
        headers: {
          authorization: `Bearer ${clientSecret}`,
          "content-type": "application/sdp"
        },
        body: offer.sdp
      });
      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }
      await peer.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text()
      });
      setStatus("Realtime live");
      logHost("realtime.connected", { targetLanguage });
    } catch (error) {
      stopRealtimeTranslation();
      shouldListenRef.current = false;
      setIsListening(false);
      onActiveChange(false);
      setStatus("Realtime error");
      logHost("realtime.error", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function stopListening() {
    activeSeqRef.current += 1;
    requestSeqRef.current += 1;
    shouldListenRef.current = false;
    cancelInterimTranslation();
    cancelRecognitionRestart();
    stopRealtimeTranslation();
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    onActiveChange(false);
    void clearCaptions();
    setStatus("Ready");
    logHost("speech.stop");
  }

  function submitManualTranscript() {
    void sendTranscript(manualText, "manual").catch(() => setStatus("Runtime error"));
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
      <label className="audio-toggle">
        <input
          aria-label="Translated audio"
          checked={audioEnabled}
          type="checkbox"
          onChange={(event) => {
            setAudioEnabled(event.target.checked);
            if (realtimeAudioRef.current) {
              realtimeAudioRef.current.muted = !event.target.checked;
            }
            if (!event.target.checked) {
              window.speechSynthesis?.cancel();
            }
          }}
        />
        Audio
      </label>
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
