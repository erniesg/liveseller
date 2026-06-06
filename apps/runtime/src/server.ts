import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
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
};

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
  const child = (input.spawnImpl ?? spawn)("npm", ["run", "live:stream:runtime-compositor"], {
    cwd: new URL("../../..", import.meta.url),
    env: {
      ...process.env,
      LIVESELLER_CAMERA_INPUT: cameraInput,
      LIVESELLER_CAMERA_INPUT_KIND: cameraInputKind,
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

  if (input.waitForCompletion !== false) {
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`runtime camera compositor failed with exit ${code}: ${stderr.slice(-1200)}`));
      });
    });
  } else {
    child.on("close", (code) => {
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
    durationSeconds
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
    .stage{position:relative;aspect-ratio:16/9;width:min(100%,1280px);margin:0 auto;background:#020617;overflow:hidden;border:1px solid rgba(255,255,255,.22);border-radius:8px}
    video,iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    video{object-fit:cover}
    iframe{pointer-events:none}
    button{border:1px solid rgba(255,255,255,.28);border-radius:6px;background:#f8fafc;color:#111827;font-weight:800;padding:8px 10px}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Runtime camera + public overlay preview</h1>
      <button type="button" id="start">Start local camera</button>
    </header>
    <section class="stage" aria-label="Camera compositor preview">
      <video id="camera" muted autoplay playsinline></video>
      <iframe src="${overlayUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")}" title="Public overlay"></iframe>
    </section>
  </main>
  <script>
    document.getElementById("start").addEventListener("click", async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      document.getElementById("camera").srcObject = stream;
    });
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
