import { createServer } from "node:http";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type LiveSessionSpec,
  OverlayStateSchema,
  ProductReviewDecisionSchema,
  ProductReviewPlanSchema,
  RuntimeEventSchema,
  validProductReviewPlan,
  validLiveSessionSpec,
  vintageJewelryLiveSessionSpec
} from "@liveseller/contracts";
import {
  buildShopeeCreateProductCommands,
  buildShopeeStartLivestreamCommands,
  recordProductReviewDecision
} from "./approvals";
import { createRuntimeSessionStore } from "./sessionStore";

const sessionStores = new Map(
  [validLiveSessionSpec, vintageJewelryLiveSessionSpec].map((session) => [
    session.sessionId,
    createRuntimeSessionStore(session)
  ])
);

export function loadRuntimeEnvFile(cwd = process.cwd()): { path?: string; loadedKeys: string[] } {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) {
    return { loadedKeys: [] };
  }
  const loadedKeys: string[] = [];
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = rawValue.replace(/^['"]|['"]$/gu, "");
    loadedKeys.push(key);
  }
  return { path: envPath, loadedKeys };
}

loadRuntimeEnvFile(fileURLToPath(new URL("../../..", import.meta.url)));

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json"
  });
  res.end(JSON.stringify(body));
}

function sessionIdFromUrl(url: string | undefined, pattern: RegExp): string | undefined {
  return pattern.exec(url ?? "")?.[1];
}

export type RealtimeClientSecretResponse = {
  status: number;
  body: unknown;
};

export async function createRealtimeClientSecret(options: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  voice?: string;
} = {}): Promise<RealtimeClientSecretResponse> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      body: {
        error: "openai_api_key_missing",
        message: "Set OPENAI_API_KEY on the runtime server to use realtime voice translation."
      }
    };
  }

  const response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: options.model ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
        instructions:
          "Translate Shopee Live host speech for shoppers. Keep product names, prices, stock counts, and promo terms exact. Do not invent offers.",
        audio: {
          output: {
            voice: options.voice ?? process.env.OPENAI_REALTIME_VOICE ?? "marin"
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

function requireSessionStore(sessionId: string) {
  const store = sessionStores.get(sessionId);
  if (!store) {
    throw new Error(`Runtime session not found: ${sessionId}`);
  }
  return store;
}

export type RealtimeAgentSessionResponse = {
  status: number;
  body: unknown;
};

function realtimeAgentInstructions(session: LiveSessionSpec): string {
  return [
    "You are a LiveSeller RealtimeAgent for a Shopee Live seller.",
    "Listen to the seller's speech in Chinese, English, Malay, or Tamil.",
    "When requested, translate host speech to English audio in real time while preserving exact product names, prices, stock, SKU, variants, and promo terms.",
    "prompt the seller what to say next using only structured product facts and policy facts from this session.",
    "Call tools for overlay/background changes and policy-checked replies; never invent discounts, refund commitments, legal claims, stock, variants, Shopee IDs, or promo eligibility.",
    "Risky viewer messages about refund, fraud, fake products, legal threats, or unclear discounts must be escalated for seller approval instead of auto-sent.",
    `Session ${session.sessionId} products: ${session.products.map((product) =>
      `${product.title} (${product.currency} ${product.price.toFixed(2)}, ${product.stock} left, SKU ${product.sku})`
    ).join("; ")}.`
  ].join(" ");
}

export async function createRealtimeAgentSession(input: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sessionId: string;
  voice?: string;
  model?: string;
}): Promise<RealtimeAgentSessionResponse> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: 503,
      body: {
        error: "openai_api_key_missing",
        message: "Set OPENAI_API_KEY on the runtime server to start the LiveSeller RealtimeAgent."
      }
    };
  }
  const store = requireSessionStore(input.sessionId);
  const session = store.snapshot().session;
  const response = await (input.fetchImpl ?? fetch)("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: input.model ?? process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
        instructions: realtimeAgentInstructions(session),
        audio: {
          output: {
            voice: input.voice ?? process.env.OPENAI_REALTIME_VOICE ?? "marin"
          }
        },
        tools: [
          {
            type: "function",
            name: "show_overlay_background",
            description: "Change the public overlay background after seller approval.",
            parameters: {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["solid", "default"] },
                value: { type: "string" },
                label: { type: "string" }
              },
              required: ["mode", "value", "label"],
              additionalProperties: false
            }
          },
          {
            type: "function",
            name: "send_policy_checked_reply",
            description: "Send only low-risk structured replies; risky replies must ask seller approval first.",
            parameters: {
              type: "object",
              properties: {
                viewerId: { type: "string" },
                text: { type: "string" },
                productId: { type: "string" },
                risk: { type: "string", enum: ["low"] }
              },
              required: ["viewerId", "text", "risk"],
              additionalProperties: false
            }
          }
        ]
      }
    })
  });

  return {
    status: response.status,
    body: {
      ...(await response.json()),
      agent: {
        name: "LiveSeller Realtime Copilot",
        kind: "RealtimeAgent",
        sessionId: input.sessionId,
        responsibilities: [
          "prompt_seller_script",
          "translate_host_speech_to_english_audio",
          "policy_checked_viewer_reply_tools",
          "overlay_background_tools"
        ]
      }
    }
  };
}

export function buildProductScriptSuggestions(session: LiveSessionSpec): ProductScriptSuggestion[] {
  return session.products.map((product) => ({
    productId: product.id,
    title: product.title,
    script:
      `Show ${product.title}. Mention ${product.currency} ${product.price.toFixed(2)}, ${product.stock} left, SKU ${product.sku}. ` +
      "Keep claims tied to the structured listing and invite viewers to ask about size, stock, and shipping.",
    facts: {
      price: `${product.currency} ${product.price.toFixed(2)}`,
      stock: `${product.stock} left`,
      sku: product.sku
    }
  }));
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export type OverlayStreamSmokeResult = {
  status: "sent_overlay_stream_smoke";
  overlayUrl: string;
  rtmpUrl: "present_redacted";
  rtmpKey: "present_redacted";
  durationSeconds: number;
};

export type RuntimeCompositorResult = {
  status: "started_runtime_compositor_stream" | "sent_runtime_compositor_stream";
  overlayUrl: string;
  sellerPreviewUrl: string;
  cameraInputKind: string;
  cameraInput: "present_redacted" | string;
  rtmpUrl: "present_redacted";
  rtmpKey: "present_redacted";
  durationSeconds: number;
  outputOrientation: "vertical";
  outputSize: "720x1280";
};

export type ProductScriptSuggestion = {
  productId: string;
  title: string;
  script: string;
  facts: {
    price: string;
    stock: string;
    sku: string;
  };
};

export type RuntimeCompositorStatus = {
  state: "idle" | "running" | "stopped" | "failed";
  overlayUrl?: string;
  sellerPreviewUrl?: string;
  cameraInputKind?: string;
  cameraInput?: "present_redacted" | string;
  rtmpUrl?: "present_redacted";
  rtmpKey?: "present_redacted";
  durationSeconds?: number;
  outputOrientation?: "vertical";
  outputSize?: "720x1280";
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number | null;
  error?: string;
};

let activeRuntimeCompositor: {
  child: ChildProcess;
  streamSignature: string;
  status: RuntimeCompositorStatus;
} | undefined;

export async function startOverlayStreamSmoke(input: {
  rtmpUrl: string;
  rtmpKey: string;
  overlayUrl: string;
  durationSeconds?: number;
  spawnImpl?: typeof spawn;
}): Promise<OverlayStreamSmokeResult> {
  if (!input.rtmpUrl || !input.rtmpKey) {
    throw new Error("Shopee preview RTMP URL and key are required.");
  }
  const durationSeconds = input.durationSeconds ?? 60;
  const child = (input.spawnImpl ?? spawn)("npm", ["run", "live:stream:overlay-smoke"], {
    cwd: new URL("../../..", import.meta.url),
    env: {
      ...process.env,
      LIVESELLER_OVERLAY_URL: input.overlayUrl,
      LIVESELLER_STREAM_SECONDS: String(durationSeconds),
      SHOPEE_RTMP_URL: input.rtmpUrl,
      SHOPEE_RTMP_KEY: input.rtmpKey
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk)
      .replaceAll(input.rtmpUrl, "rtmp_url_present_redacted")
      .replaceAll(input.rtmpKey, "stream_key_present_redacted");
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`overlay stream smoke failed with exit ${code}: ${stderr.slice(-1200)}`));
    });
  });

  return {
    status: "sent_overlay_stream_smoke",
    overlayUrl: input.overlayUrl,
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted",
    durationSeconds
  };
}

function redactCameraInput(kind: string, input: string) {
  return kind === "avfoundation" ? "present_redacted" : input;
}

export function getRuntimeCameraCompositorStatus(): RuntimeCompositorStatus {
  return activeRuntimeCompositor?.status ?? { state: "idle" };
}

export function stopRuntimeCameraCompositor(): RuntimeCompositorStatus {
  if (!activeRuntimeCompositor) {
    return { state: "idle" };
  }
  const current = activeRuntimeCompositor;
  const stoppedAt = new Date().toISOString();
  current.status = {
    ...current.status,
    state: "stopped",
    stoppedAt
  };
  activeRuntimeCompositor = undefined;
  current.child.kill("SIGTERM");
  return current.status;
}

export async function startRuntimeCameraCompositor(input: {
  rtmpUrl: string;
  rtmpKey: string;
  overlayUrl: string;
  sellerPreviewUrl: string;
  durationSeconds?: number;
  cameraInputKind?: string;
  cameraInput?: string;
  waitForCompletion?: boolean;
  spawnImpl?: typeof spawn;
}): Promise<RuntimeCompositorResult> {
  if (!input.rtmpUrl || !input.rtmpKey) {
    throw new Error("Shopee preview RTMP URL and key are required.");
  }
  const durationSeconds = input.durationSeconds ?? 60;
  const cameraInputKind = input.cameraInputKind ?? "lavfi";
  const cameraInput = input.cameraInput ?? "testsrc2=size=1280x720:rate=30";
  const outputOrientation = "vertical";
  const outputSize = "720x1280";
  const streamSignature = `${input.rtmpUrl}\n${input.rtmpKey}`;
  if (activeRuntimeCompositor) {
    throw new Error(
      activeRuntimeCompositor.streamSignature === streamSignature
        ? "runtime camera compositor already running for this Shopee stream key"
        : "runtime camera compositor already running; stop it before starting another publisher"
    );
  }
  const child = (input.spawnImpl ?? spawn)("npm", ["run", "live:stream:runtime-compositor"], {
    cwd: new URL("../../..", import.meta.url),
    env: {
      ...process.env,
      LIVESELLER_CAMERA_INPUT: cameraInput,
      LIVESELLER_CAMERA_INPUT_KIND: cameraInputKind,
      LIVESELLER_OVERLAY_URL: input.overlayUrl,
      LIVESELLER_STREAM_HEIGHT: "1280",
      LIVESELLER_STREAM_ORIENTATION: outputOrientation,
      LIVESELLER_STREAM_WIDTH: "720",
      LIVESELLER_STREAM_SECONDS: String(durationSeconds),
      SHOPEE_RTMP_URL: input.rtmpUrl,
      SHOPEE_RTMP_KEY: input.rtmpKey
    },
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk)
      .replaceAll(input.rtmpUrl, "rtmp_url_present_redacted")
      .replaceAll(input.rtmpKey, "stream_key_present_redacted");
  });
  const status: RuntimeCompositorStatus = {
    state: "running",
    overlayUrl: input.overlayUrl,
    sellerPreviewUrl: input.sellerPreviewUrl,
    cameraInputKind,
    cameraInput: redactCameraInput(cameraInputKind, cameraInput),
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted",
    durationSeconds,
    outputOrientation,
    outputSize,
    startedAt: new Date().toISOString()
  };
  activeRuntimeCompositor = {
    child,
    streamSignature,
    status
  };

  if (input.waitForCompletion !== false) {
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (activeRuntimeCompositor?.child === child) {
          activeRuntimeCompositor.status = {
            ...activeRuntimeCompositor.status,
            state: code === 0 ? "stopped" : "failed",
            stoppedAt: new Date().toISOString(),
            exitCode: code
          };
          activeRuntimeCompositor = undefined;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`runtime camera compositor failed with exit ${code}: ${stderr.slice(-1200)}`));
      });
    });
  } else {
    child.on("close", (code) => {
      if (activeRuntimeCompositor?.child === child) {
        activeRuntimeCompositor.status = {
          ...activeRuntimeCompositor.status,
          state: code === 0 ? "stopped" : "failed",
          stoppedAt: new Date().toISOString(),
          exitCode: code,
          error: code === 0 ? undefined : stderr.slice(-1200)
        };
        activeRuntimeCompositor = undefined;
      }
      if (code !== 0) {
        console.error(`runtime camera compositor failed with exit ${code}: ${stderr.slice(-1200)}`);
      }
    });
  }

  return {
    status: input.waitForCompletion === false
      ? "started_runtime_compositor_stream"
      : "sent_runtime_compositor_stream",
    overlayUrl: input.overlayUrl,
    sellerPreviewUrl: input.sellerPreviewUrl,
    cameraInputKind,
    cameraInput: redactCameraInput(cameraInputKind, cameraInput),
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted",
    durationSeconds,
    outputOrientation,
    outputSize
  };
}

function sendHtml(res: import("node:http").ServerResponse, status: number, html: string) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8"
  });
  res.end(html);
}

function runtimeOrigin(req: import("node:http").IncomingMessage) {
  return `http://${req.headers.host ?? "127.0.0.1:8787"}`;
}

function compositorPreviewHtml(req: import("node:http").IncomingMessage) {
  const base = runtimeOrigin(req);
  const url = new URL(req.url ?? "/camera-compositor/preview", base);
  const overlayUrl = url.searchParams.get("overlayUrl")
    ?? `${base.replace(":8787", ":5180")}/?runtimeOrigin=${encodeURIComponent(base)}&sessionId=${encodeURIComponent(validLiveSessionSpec.sessionId)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LiveSeller camera compositor preview</title>
  <style>
    html,body{margin:0;height:100%;background:#111827;color:#f8fafc;font-family:Inter,system-ui,sans-serif}
    main{display:grid;grid-template-rows:auto 1fr;min-height:100%;gap:12px;padding:14px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px}
    h1{font-size:16px;margin:0}
    .controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .stage{position:relative;aspect-ratio:16/9;width:min(100%,1280px);margin:0 auto;background:#020617;overflow:hidden;border:1px solid rgba(255,255,255,.22);border-radius:8px}
    video,iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    video{object-fit:cover}
    iframe{pointer-events:none}
    button,select{border:1px solid rgba(255,255,255,.28);border-radius:6px;background:#f8fafc;color:#111827;font-weight:800;padding:8px 10px}
    #status{color:#cbd5e1;font-size:13px}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Runtime camera + public overlay preview</h1>
      <div class="controls">
        <select id="device" aria-label="Camera device"></select>
        <button type="button" id="start">Start local camera</button>
        <span id="status">Camera idle</span>
      </div>
    </header>
    <section class="stage" aria-label="Camera compositor preview">
      <video id="camera" muted autoplay playsinline></video>
      <iframe src="${overlayUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")}" title="Public overlay"></iframe>
    </section>
  </main>
  <script>
    const status = document.getElementById("status");
    const device = document.getElementById("device");
    const video = document.getElementById("camera");
    let currentStream;

    async function refreshDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((item) => item.kind === "videoinput");
      device.replaceChildren(...cameras.map((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.deviceId;
        option.textContent = camera.label || "Camera " + (index + 1);
        return option;
      }));
    }

    document.getElementById("start").addEventListener("click", async () => {
      try {
        status.textContent = "Requesting camera permission";
        currentStream?.getTracks().forEach((track) => track.stop());
        const constraints = {
          video: device.value ? { deviceId: { exact: device.value } } : true,
          audio: false
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        await video.play();
        await refreshDevices();
        status.textContent = "Camera attached";
      } catch (error) {
        status.textContent = "Camera blocked: " + (error && error.message ? error.message : String(error));
      }
    });
    void refreshDevices().catch(() => undefined);
  </script>
</body>
</html>`;
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

      if (req.method === "GET" && req.url?.startsWith("/camera-compositor/preview")) {
        sendHtml(res, 200, compositorPreviewHtml(req));
        return;
      }

      const reviewPlanSessionId = sessionIdFromUrl(req.url, /^\/api\/prep\/review-plan\/([^/]+)$/u);
      if (req.method === "GET" && reviewPlanSessionId) {
        if (reviewPlanSessionId !== validProductReviewPlan.sessionId) {
          sendJson(res, 404, { error: "review_plan_not_found" });
          return;
        }
        sendJson(res, 200, validProductReviewPlan);
        return;
      }

      const specSessionId = sessionIdFromUrl(req.url, /^\/api\/live-sessions\/([^/]+)\/spec$/u);
      if (req.method === "GET" && specSessionId) {
        const store = sessionStores.get(specSessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, store.snapshot().session);
        return;
      }

      const scriptSessionId = sessionIdFromUrl(req.url, /^\/api\/live-sessions\/([^/]+)\/script-suggestions$/u);
      if (req.method === "GET" && scriptSessionId) {
        const store = sessionStores.get(scriptSessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, {
          sessionId: scriptSessionId,
          suggestions: buildProductScriptSuggestions(store.snapshot().session)
        });
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/events") {
        const event = RuntimeEventSchema.parse(await readJson(req));
        const store = sessionStores.get(event.sessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        const routed = store.route(event);
        sendJson(res, 200, routed);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/session") {
        const session = await createRealtimeClientSecret();
        sendJson(res, session.status, session.body);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/agent-session") {
        const body = await readJson(req);
        const session = await createRealtimeAgentSession({
          sessionId: String(body.sessionId ?? validLiveSessionSpec.sessionId),
          voice: typeof body.voice === "string" ? body.voice : undefined
        });
        sendJson(res, session.status, session.body);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/agent-session") {
        const body = await readJson(req);
        const result = await createRealtimeAgentSession({
          sessionId: String(body.sessionId ?? ""),
          voice: typeof body.voice === "string" ? body.voice : undefined
        });
        sendJson(res, result.status, result.body);
        return;
      }

      if (req.method === "POST" && req.url === "/api/shopee/stream-overlay-smoke") {
        const body = await readJson(req);
        const result = await startOverlayStreamSmoke({
          rtmpUrl: String(body.rtmpUrl ?? ""),
          rtmpKey: String(body.rtmpKey ?? ""),
          overlayUrl: String(body.overlayUrl ?? ""),
          durationSeconds: Number.isFinite(body.durationSeconds) ? Number(body.durationSeconds) : undefined
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && req.url === "/api/shopee/runtime-compositor/start") {
        const body = await readJson(req);
        const overlayUrl = String(body.overlayUrl ?? "");
        const sellerPreviewUrl = String(
          body.sellerPreviewUrl
            ?? `${runtimeOrigin(req)}/camera-compositor/preview?overlayUrl=${encodeURIComponent(overlayUrl)}`
        );
        const result = await startRuntimeCameraCompositor({
          rtmpUrl: String(body.rtmpUrl ?? ""),
          rtmpKey: String(body.rtmpKey ?? ""),
          overlayUrl,
          sellerPreviewUrl,
          durationSeconds: Number.isFinite(body.durationSeconds) ? Number(body.durationSeconds) : undefined,
          cameraInputKind: typeof body.cameraInputKind === "string" ? body.cameraInputKind : undefined,
          cameraInput: typeof body.cameraInput === "string" ? body.cameraInput : undefined,
          waitForCompletion: false
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && req.url === "/api/shopee/runtime-compositor/status") {
        sendJson(res, 200, getRuntimeCameraCompositorStatus());
        return;
      }

      if (req.method === "POST" && req.url === "/api/shopee/runtime-compositor/stop") {
        sendJson(res, 200, stopRuntimeCameraCompositor());
        return;
      }

      if (req.method === "POST" && req.url === "/api/prep/review-decisions") {
        const body = await readJson(req);
        const reviewPlan = ProductReviewPlanSchema.parse(body.reviewPlan);
        const decision = ProductReviewDecisionSchema.parse(body.decision);
        const updatedReviewPlan = recordProductReviewDecision(reviewPlan, decision);
        const createProductCommands = buildShopeeCreateProductCommands(updatedReviewPlan);
        const store = sessionStores.get(updatedReviewPlan.sessionId);
        const startLivestreamCommands = store
          ? buildShopeeStartLivestreamCommands(updatedReviewPlan, store.snapshot().session)
          : [];
        sendJson(res, 200, {
          reviewPlan: updatedReviewPlan,
          createProductCommands,
          startLivestreamCommands
        });
        return;
      }

      const auditSessionId = sessionIdFromUrl(req.url, /^\/api\/audit\/([^/]+)$/u);
      if (req.method === "GET" && auditSessionId) {
        const store = sessionStores.get(auditSessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, store.snapshot().auditEvents);
        return;
      }

      const memorySessionId = sessionIdFromUrl(req.url, /^\/api\/live-sessions\/([^/]+)\/memory$/u);
      if (req.method === "GET" && memorySessionId) {
        const store = sessionStores.get(memorySessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, store.snapshot());
        return;
      }

      const summarySessionId = sessionIdFromUrl(req.url, /^\/api\/live-sessions\/([^/]+)\/summary$/u);
      if (req.method === "GET" && summarySessionId) {
        const store = sessionStores.get(summarySessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, store.summary());
        return;
      }

      const overlaySessionId = sessionIdFromUrl(req.url, /^\/api\/overlay\/([^/]+)$/u);
      if (req.method === "GET" && overlaySessionId) {
        const store = sessionStores.get(overlaySessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        sendJson(res, 200, store.overlay());
        return;
      }

      const overlayBackgroundSessionId = sessionIdFromUrl(req.url, /^\/api\/overlay\/([^/]+)\/background$/u);
      if (req.method === "POST" && overlayBackgroundSessionId) {
        const store = sessionStores.get(overlayBackgroundSessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        const body = await readJson(req);
        const current = store.overlay();
        const background = OverlayStateSchema.shape.background.unwrap().parse(body.background);
        sendJson(res, 200, store.updateOverlayBackground(background) ?? current);
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
