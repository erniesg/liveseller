import { createServer } from "node:http";
import {
  type LanguageCode,
  type LiveSessionSpec,
  type RuntimeEvent,
  LanguageCodeSchema,
  RuntimeEventSchema,
  validLiveSessionSpec
} from "@liveseller/contracts";
import { createInitialOverlayState } from "./overlay";
import { routeRuntimeEventAsync } from "./runtime";
import { translateCaptionForRuntime } from "./translation";

const auditLog: unknown[] = [];
let overlayState = createInitialOverlayState(validLiveSessionSpec);
let captionEpoch = 0;

const runtimeHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
  "content-type": "application/json"
};

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, runtimeHeaders);
  res.end(JSON.stringify(body));
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function hostTranscriptEvent(body: {
  text?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
}): Extract<RuntimeEvent, { type: "host_transcript" }> {
  const sourceLanguage = typeof body.sourceLanguage === "string" ? body.sourceLanguage : "en";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  return RuntimeEventSchema.parse({
    eventId: `host-live-${Date.now()}`,
    sessionId: validLiveSessionSpec.sessionId,
    timestamp: new Date().toISOString(),
    source: "host",
    type: "host_transcript",
    payload: {
      text,
      language: sourceLanguage,
      confidence: 0.9
    }
  }) as Extract<RuntimeEvent, { type: "host_transcript" }>;
}

async function routeAndRemember(event: RuntimeEvent) {
  const routed = await routeRuntimeEventAsync(event, validLiveSessionSpec, {
    previousOverlayState: overlayState,
    translateCaptionText: async ({ text, sourceLanguage, targetLanguage }) => {
      const result = await translateCaptionForRuntime(
        { text, sourceLanguage, targetLanguage },
        {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_TRANSLATION_MODEL
        }
      );
      return result.text;
    }
  });
  overlayState = routed.overlayState;
  auditLog.push(...routed.auditEvents);
  return routed;
}

function sessionForHostTranslation(
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): LiveSessionSpec {
  return {
    ...validLiveSessionSpec,
    targetLanguages: Array.from(new Set([sourceLanguage, targetLanguage]))
  };
}

function logRuntime(event: string, details: Record<string, unknown>) {
  console.log(`[runtime:${event}] ${JSON.stringify(details)}`);
}

async function createRealtimeTranslationClientSecret(sourceLanguage: LanguageCode, targetLanguage: LanguageCode) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      status: 503,
      body: {
        error: "openai_api_key_missing",
        message: "Set OPENAI_API_KEY on the runtime server to use realtime translation."
      }
    };
  }

  const response = await fetch("https://api.openai.com/v1/realtime/translations/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
      "openai-safety-identifier": "liveseller-local-demo"
    },
    body: JSON.stringify({
      session: {
        model: process.env.OPENAI_REALTIME_TRANSLATION_MODEL ?? "gpt-realtime-translate",
        audio: {
          input: {
            transcription: {
              model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-realtime-whisper"
            }
          },
          output: {
            language: targetLanguage
          }
        }
      }
    })
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

export function createRuntimeServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, service: "@liveseller/runtime" });
        return;
      }

      if (req.method === "GET" && req.url === `/api/live-sessions/${validLiveSessionSpec.sessionId}/spec`) {
        sendJson(res, 200, validLiveSessionSpec);
        return;
      }

      if (req.method === "GET" && req.url === "/api/runtime/overlay-state") {
        sendJson(res, 200, overlayState);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/captions/clear") {
        captionEpoch += 1;
        overlayState = {
          ...overlayState,
          caption: {
            ...overlayState.caption,
            text: "",
            visible: false
          },
          translatedCaptions: [],
          updatedAt: new Date().toISOString()
        };
        logRuntime("captions.clear", {
          captionEpoch,
          sessionId: overlayState.sessionId
        });
        sendJson(res, 200, overlayState);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/events") {
        const event = RuntimeEventSchema.parse(await readJson(req));
        sendJson(res, 200, await routeAndRemember(event));
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/host-transcripts") {
        const body = await readJson(req);
        const event = hostTranscriptEvent(body);
        const targetLanguage = LanguageCodeSchema.parse(
          typeof body.targetLanguage === "string" ? body.targetLanguage : "en"
        );
        const sourceLanguage = event.payload.language;
        const session = sessionForHostTranslation(sourceLanguage, targetLanguage);
        const requestEpoch = captionEpoch;
        logRuntime("hostTranscript.received", {
          eventId: event.eventId,
          requestEpoch,
          sourceLanguage,
          targetLanguage,
          textLength: event.payload.text.length
        });
        const routed = await routeRuntimeEventAsync(event, session, {
          previousOverlayState: overlayState,
          translateCaptionText: async ({ text, sourceLanguage, targetLanguage }) => {
            const result = await translateCaptionForRuntime(
              {
                text,
                sourceLanguage,
                targetLanguage
              },
              {
                apiKey: process.env.OPENAI_API_KEY,
                model: process.env.OPENAI_TRANSLATION_MODEL
              }
            );
            return result.text;
          }
        });
        if (requestEpoch !== captionEpoch) {
          logRuntime("hostTranscript.stale", {
            eventId: event.eventId,
            requestEpoch,
            captionEpoch
          });
          sendJson(res, 200, {
            ...routed,
            overlayState,
            stale: true
          });
          return;
        }
        overlayState = routed.overlayState;
        auditLog.push(...routed.auditEvents);
        logRuntime("hostTranscript.applied", {
          eventId: event.eventId,
          requestEpoch,
          captionEpoch,
          actions: routed.actions.map((action) => action.type)
        });
        sendJson(res, 200, routed);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime-translation/session") {
        const body = await readJson(req);
        const sourceLanguage = LanguageCodeSchema.parse(
          typeof body.sourceLanguage === "string" ? body.sourceLanguage : "en"
        );
        const targetLanguage = LanguageCodeSchema.parse(
          typeof body.targetLanguage === "string" ? body.targetLanguage : "en"
        );
        const session = await createRealtimeTranslationClientSecret(sourceLanguage, targetLanguage);
        logRuntime("realtimeTranslation.session", {
          status: session.status,
          targetLanguage,
          model: process.env.OPENAI_REALTIME_TRANSLATION_MODEL ?? "gpt-realtime-translate"
        });
        sendJson(res, session.status, session.body);
        return;
      }

      if (req.method === "GET" && req.url === `/api/audit/${validLiveSessionSpec.sessionId}`) {
        sendJson(res, 200, auditLog);
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      sendJson(res, 400, {
        error: "bad_request",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? 8787);
  createRuntimeServer().listen(port, () => {
    console.log(`LiveSeller runtime listening on http://localhost:${port}`);
  });
}
