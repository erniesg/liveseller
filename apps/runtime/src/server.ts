import { createServer } from "node:http";
import { type ChildProcess, spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  type LiveSessionSpec,
  OverlayStateSchema,
  LiveSessionSpecSchema,
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
import { createSellerTimelineStore, runtimeEventTimelineEntry } from "./sellerTimeline";

const sessionStores = new Map(
  [validLiveSessionSpec, vintageJewelryLiveSessionSpec].map((session) => [
    session.sessionId,
    createRuntimeSessionStore(session)
  ])
);
const sellerTimeline = createSellerTimelineStore();
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";

type RealtimeAgentToolName =
  | "show_overlay_background"
  | "show_product_card"
  | "prompt_seller_script"
  | "emit_translation_caption"
  | "send_policy_checked_reply";

export type RealtimeAgentToolCall = {
  callId?: string;
  name: RealtimeAgentToolName;
  arguments: Record<string, unknown>;
};

export type RealtimeAgentToolResult = {
  status: "applied";
  tool: RealtimeAgentToolName;
  callId?: string;
  sessionId: string;
  overlayState?: ReturnType<ReturnType<typeof createRuntimeSessionStore>["overlay"]>;
  routed?: ReturnType<ReturnType<typeof createRuntimeSessionStore>["route"]>;
  scriptSuggestion?: ProductScriptSuggestion;
};

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
        model: options.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
        instructions:
          "Translate Shopee Live host speech for shoppers. Keep product names, prices, stock counts, and promo terms exact. Do not invent offers.",
        reasoning: {
          effort: "low"
        },
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

function registerRuntimeSession(session: LiveSessionSpec) {
  const parsed = LiveSessionSpecSchema.parse(session);
  sessionStores.set(parsed.sessionId, createRuntimeSessionStore(parsed));
  sellerTimeline.append({
    service: "runtime",
    sessionId: parsed.sessionId,
    kind: "stream",
    status: "success",
    title: "Live session registered",
    detail: `${parsed.products.length} product(s) ready for overlay, realtime tools, and seller preview.`,
    redacted: false
  });
  return parsed;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Realtime tool argument ${key} is required`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function executeRealtimeAgentToolCall(
  store: ReturnType<typeof createRuntimeSessionStore>,
  call: RealtimeAgentToolCall
): RealtimeAgentToolResult {
  const snapshot = store.snapshot();
  const args = call.arguments ?? {};
  const timestamp = new Date().toISOString();

  if (call.name === "show_overlay_background") {
    const background = OverlayStateSchema.shape.background.unwrap().parse({
      mode: stringArg(args, "mode"),
      value: stringArg(args, "value"),
      label: optionalStringArg(args, "label") ?? "Realtime agent background"
    });
    const overlayState = store.updateOverlayBackground(background);
    return {
      status: "applied",
      tool: call.name,
      callId: call.callId,
      sessionId: snapshot.sessionId,
      overlayState
    };
  }

  if (call.name === "show_product_card") {
    const productId = stringArg(args, "productId");
    const routed = store.route({
      eventId: call.callId ? `realtime-tool-${call.callId}` : `realtime-tool-product-${Date.now()}`,
      sessionId: snapshot.sessionId,
      timestamp,
      source: "seller",
      type: "product_switch",
      payload: { productId }
    });
    return {
      status: "applied",
      tool: call.name,
      callId: call.callId,
      sessionId: snapshot.sessionId,
      overlayState: routed.overlayState,
      routed
    };
  }

  if (call.name === "prompt_seller_script") {
    const productId = optionalStringArg(args, "productId") ?? snapshot.currentProductId ?? snapshot.products[0]?.id;
    const scriptSuggestion = buildProductScriptSuggestions(snapshot.session).find((suggestion) =>
      suggestion.productId === productId
    );
    if (!scriptSuggestion) {
      throw new Error(`Realtime tool prompt_seller_script references unknown productId ${productId}`);
    }
    return {
      status: "applied",
      tool: call.name,
      callId: call.callId,
      sessionId: snapshot.sessionId,
      scriptSuggestion
    };
  }

  if (call.name === "emit_translation_caption") {
    const language = optionalStringArg(args, "language") ?? "zh";
    const routed = store.route(RuntimeEventSchema.parse({
      eventId: call.callId ? `realtime-tool-${call.callId}` : `realtime-tool-caption-${Date.now()}`,
      sessionId: snapshot.sessionId,
      timestamp,
      source: "host",
      type: "host_transcript",
      payload: {
        text: stringArg(args, "text"),
        language,
        confidence: typeof args.confidence === "number" ? args.confidence : 0.9
      }
    }));
    return {
      status: "applied",
      tool: call.name,
      callId: call.callId,
      sessionId: snapshot.sessionId,
      overlayState: routed.overlayState,
      routed
    };
  }

  if (call.name === "send_policy_checked_reply") {
    const text = stringArg(args, "text");
    const language = optionalStringArg(args, "language") ?? "en";
    const routed = store.route(RuntimeEventSchema.parse({
      eventId: call.callId ? `realtime-tool-${call.callId}` : `realtime-tool-viewer-${Date.now()}`,
      sessionId: snapshot.sessionId,
      timestamp,
      source: "viewer",
      type: "viewer_chat",
      payload: {
        viewerId: stringArg(args, "viewerId"),
        viewerName: optionalStringArg(args, "viewerName") ?? "Shopee Viewer",
        text,
        language
      }
    }));
    return {
      status: "applied",
      tool: call.name,
      callId: call.callId,
      sessionId: snapshot.sessionId,
      overlayState: routed.overlayState,
      routed
    };
  }

  throw new Error(`Unsupported realtime agent tool: ${String(call.name)}`);
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
        model: input.model ?? process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL,
        instructions: realtimeAgentInstructions(session),
        reasoning: {
          effort: "low"
        },
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
            name: "show_product_card",
            description: "Switch the public overlay product card to a structured product from this live session.",
            parameters: {
              type: "object",
              properties: {
                productId: { type: "string" }
              },
              required: ["productId"],
              additionalProperties: false
            }
          },
          {
            type: "function",
            name: "prompt_seller_script",
            description: "Get the seller-only talk track for the current or requested structured product.",
            parameters: {
              type: "object",
              properties: {
                productId: { type: "string" }
              },
              required: [],
              additionalProperties: false
            }
          },
          {
            type: "function",
            name: "emit_translation_caption",
            description: "Emit public overlay captions and translations from the host transcript.",
            parameters: {
              type: "object",
              properties: {
                text: { type: "string" },
                language: { type: "string", enum: ["en", "zh", "ms", "ta"] },
                confidence: { type: "number" }
              },
              required: ["text", "language"],
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
          "product_overlay_tools",
          "overlay_background_tools"
        ],
        toolExecutionEndpoint: "/api/runtime/realtime/tool-call"
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

export type LocalTestStreamResult = {
  status: "started_local_test_stream";
  sessionId: string;
  streamId: string;
  viewerUrl: string;
  hlsUrl: string;
  overlayUrl: string;
  sellerPreviewUrl: string;
  cameraInputKind: string;
  cameraInput: "present_redacted" | string;
  outputOrientation: "vertical";
  outputSize: "720x1280";
};

let activeRuntimeCompositor: {
  child: ChildProcess;
  streamSignature: string;
  status: RuntimeCompositorStatus;
} | undefined;

let activeLocalTestStream: {
  id: string;
  child: ChildProcess;
  workDir: string;
  overlayTimer: NodeJS.Timeout;
  status: RuntimeCompositorStatus & {
    sessionId: string;
    viewerUrl: string;
    hlsUrl: string;
    streamId: string;
  };
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

function cameraArgs(cameraInputKind: string, cameraInput: string) {
  if (cameraInputKind === "avfoundation") {
    return ["-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720", "-i", cameraInput];
  }

  if (cameraInputKind === "none") {
    return ["-f", "lavfi", "-i", "color=c=0x111827:s=1280x720:r=30"];
  }

  return ["-f", "lavfi", "-i", cameraInput];
}

async function captureOverlayImage(overlayUrl: string, screenshotPath: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    await page.goto(overlayUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, omitBackground: false });
  } finally {
    await browser.close();
  }
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

export function stopLocalTestStream(): RuntimeCompositorStatus {
  if (!activeLocalTestStream) {
    return { state: "idle" };
  }
  const current = activeLocalTestStream;
  clearInterval(current.overlayTimer);
  const stoppedAt = new Date().toISOString();
  current.status = {
    ...current.status,
    state: "stopped",
    stoppedAt
  };
  activeLocalTestStream = undefined;
  current.child.kill("SIGTERM");
  setTimeout(() => rmSync(current.workDir, { recursive: true, force: true }), 5000);
  return current.status;
}

export function getLocalTestStreamStatus(): RuntimeCompositorStatus & {
  viewerUrl?: string;
  hlsUrl?: string;
  streamId?: string;
} {
  return activeLocalTestStream?.status ?? { state: "idle" };
}

export async function startLocalTestStream(input: {
  sessionId: string;
  origin: string;
  overlayUrl: string;
  sellerPreviewUrl: string;
  cameraInputKind?: string;
  cameraInput?: string;
  spawnImpl?: typeof spawn;
  captureImpl?: typeof captureOverlayImage;
}): Promise<LocalTestStreamResult> {
  if (activeLocalTestStream) {
    stopLocalTestStream();
  }
  const streamId = `test-${randomUUID()}`;
  const workDir = join(tmpdir(), `liveseller-${streamId}`);
  mkdirSync(workDir, { recursive: true });
  const screenshotPath = join(workDir, "overlay.png");
  const playlistPath = join(workDir, "index.m3u8");
  const cameraInputKind = input.cameraInputKind ?? "avfoundation";
  const cameraInput = input.cameraInput ?? (cameraInputKind === "avfoundation" ? "0" : "testsrc2=size=1280x720:rate=30");
  const outputOrientation = "vertical";
  const outputSize = "720x1280";
  await (input.captureImpl ?? captureOverlayImage)(input.overlayUrl, screenshotPath);
  const overlayTimer = setInterval(() => {
    void (input.captureImpl ?? captureOverlayImage)(input.overlayUrl, screenshotPath).catch(() => undefined);
  }, 2500);
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    ...cameraArgs(cameraInputKind, cameraInput),
    "-stream_loop",
    "-1",
    "-framerate",
    "2",
    "-i",
    screenshotPath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    "[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[cam];[1:v]scale=720:1280[ovr];[cam][ovr]overlay=0:0:format=auto,format=yuv420p[v]",
    "-map",
    "[v]",
    "-map",
    "2:a",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-b:v",
    "2500k",
    "-g",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "6",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist",
    playlistPath
  ];
  const child = (input.spawnImpl ?? spawn)("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const viewerUrl = `${input.origin}/test-stream/${streamId}?sessionId=${encodeURIComponent(input.sessionId)}`;
  const hlsUrl = `${input.origin}/test-stream/${streamId}/index.m3u8`;
  activeLocalTestStream = {
    id: streamId,
    child,
    workDir,
    overlayTimer,
    status: {
      state: "running",
      sessionId: input.sessionId,
      streamId,
      viewerUrl,
      hlsUrl,
      overlayUrl: input.overlayUrl,
      sellerPreviewUrl: input.sellerPreviewUrl,
      cameraInputKind,
      cameraInput: redactCameraInput(cameraInputKind, cameraInput),
      durationSeconds: 0,
      outputOrientation,
      outputSize,
      startedAt: new Date().toISOString()
    }
  };
  child.on("close", (code) => {
    if (activeLocalTestStream?.child === child) {
      clearInterval(activeLocalTestStream.overlayTimer);
      activeLocalTestStream.status = {
        ...activeLocalTestStream.status,
        state: code === 0 ? "stopped" : "failed",
        stoppedAt: new Date().toISOString(),
        exitCode: code,
        error: code === 0 ? undefined : stderr.slice(-1200)
      };
      activeLocalTestStream = undefined;
    }
    if (code !== 0) {
      console.error(`local test stream failed with exit ${code}: ${stderr.slice(-1200)}`);
    }
  });
  return {
    status: "started_local_test_stream",
    sessionId: input.sessionId,
    streamId,
    viewerUrl,
    hlsUrl,
    overlayUrl: input.overlayUrl,
    sellerPreviewUrl: input.sellerPreviewUrl,
    cameraInputKind,
    cameraInput: redactCameraInput(cameraInputKind, cameraInput),
    outputOrientation,
    outputSize
  };
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
  const cameraInputKind = input.cameraInputKind ?? "avfoundation";
  const cameraInput = input.cameraInput ?? (cameraInputKind === "avfoundation" ? "0" : "testsrc2=size=1280x720:rate=30");
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

function sendFile(res: import("node:http").ServerResponse, path: string, contentType: string) {
  if (!existsSync(path)) {
    sendJson(res, 404, { error: "stream_file_not_found" });
    return;
  }
  res.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    "content-type": contentType
  });
  createReadStream(path).pipe(res);
}

function localTestStreamViewerHtml(req: import("node:http").IncomingMessage, streamId: string) {
  const origin = runtimeOrigin(req);
  const url = new URL(req.url ?? `/test-stream/${streamId}`, origin);
  const sessionId = url.searchParams.get("sessionId") || activeLocalTestStream?.status.sessionId || vintageJewelryLiveSessionSpec.sessionId;
  const hlsUrl = `${origin}/test-stream/${streamId}/index.m3u8`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LiveSeller test stream</title>
  <style>
    html,body{margin:0;height:100%;background:#0f172a;color:#f8fafc;font-family:Inter,system-ui,sans-serif}
    main{display:grid;place-items:center;min-height:100%;padding:20px}
    section{width:min(420px,100%);display:grid;gap:12px}
    video{width:100%;aspect-ratio:9/16;background:#020617;border:1px solid rgba(255,255,255,.2);border-radius:8px}
    input,textarea,button{width:100%;border:0;border-radius:6px;padding:10px;font:inherit}
    textarea{resize:vertical}
    button{background:#ee4d2d;color:white;font-weight:800;cursor:pointer}
    code,.log{display:block;background:#020617;border-radius:6px;padding:10px;overflow:auto}
    .log{min-height:84px;white-space:pre-wrap;color:#dbeafe}
    p{color:#cbd5e1;line-height:1.4}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>LiveSeller test stream</h1>
      <video controls autoplay muted playsinline src="${hlsUrl}"></video>
      <label>Viewer name <input id="viewer-name" value="Test Viewer" /></label>
      <label>Message <textarea id="viewer-message" rows="3">Can ship to Singapore and how much is the cameo brooch?</textarea></label>
      <button id="send-message" type="button">Send message</button>
      <div id="reply-log" class="log">No message sent yet.</div>
      <p>If Chrome does not play the HLS feed, open this playlist in Safari, VLC, or OBS media source.</p>
      <code>${hlsUrl}</code>
    </section>
  </main>
  <script>
    const runtimeOrigin = ${JSON.stringify(origin)};
    const sessionId = ${JSON.stringify(sessionId)};
    const log = document.getElementById("reply-log");
    async function sendViewerMessage() {
      const viewerName = document.getElementById("viewer-name").value.trim() || "Test Viewer";
      const text = document.getElementById("viewer-message").value.trim();
      const response = await fetch(runtimeOrigin + "/api/runtime/realtime/tool-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          callId: "viewer-" + Date.now(),
          name: "send_policy_checked_reply",
          arguments: {
            viewerId: "local-test-viewer",
            viewerName,
            text,
            language: "en",
            risk: "low"
          }
        })
      });
      const body = await response.json();
      log.textContent = JSON.stringify({
        status: response.ok ? "captured_and_policy_checked" : "failed",
        actions: body.routed?.actions?.map((action) => ({
          type: action.type,
          reason: action.reason,
          requiresApproval: action.requiresApproval,
          risk: action.risk
        })) || [],
        redacted: true
      }, null, 2);
    }
    document.getElementById("send-message").addEventListener("click", () => void sendViewerMessage().catch((error) => {
      log.textContent = error.message;
    }));
  </script>
</body>
</html>`;
}

function sendSellerTimelineStream(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
) {
  const url = new URL(req.url ?? "/", runtimeOrigin(req));
  const sessionId = url.searchParams.get("sessionId") || undefined;
  const after = Number(url.searchParams.get("after") ?? "0");
  res.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": "no-cache, no-transform",
    "connection": "keep-alive",
    "content-type": "text/event-stream"
  });
  res.write(`event: snapshot\ndata: ${JSON.stringify(sellerTimeline.list({
    after: Number.isFinite(after) ? after : 0,
    sessionId
  }))}\n\n`);
  const unsubscribe = sellerTimeline.subscribe((event, cursor) => {
    if (sessionId && event.sessionId !== sessionId) {
      return;
    }
    res.write(`event: timeline\ndata: ${JSON.stringify({ event, cursor })}\n\n`);
  });
  req.on("close", unsubscribe);
}

function runtimeOrigin(req: import("node:http").IncomingMessage) {
  return `http://${req.headers.host ?? "127.0.0.1:8787"}`;
}

function compositorPreviewHtml(req: import("node:http").IncomingMessage) {
  const base = runtimeOrigin(req);
  const url = new URL(req.url ?? "/camera-compositor/preview", base);
  const overlayUrl = url.searchParams.get("overlayUrl")
    ?? `${base.replace(":8787", ":5180")}/?runtimeOrigin=${encodeURIComponent(base)}&sessionId=${encodeURIComponent(validLiveSessionSpec.sessionId)}&transparent=1`;
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
    video{object-fit:cover;z-index:1}
    iframe{pointer-events:none;z-index:2;background:transparent;opacity:1}
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
        <span id="status" aria-live="polite">Camera idle</span>
      </div>
    </header>
    <section class="stage" aria-label="Camera compositor preview">
      <video id="camera" data-layer="camera-primary" muted autoplay playsinline></video>
      <iframe data-layer="overlay-top" src="${overlayUrl.replaceAll("&", "&amp;").replaceAll("\"", "&quot;")}" title="Public overlay"></iframe>
    </section>
  </main>
  <script>
    const status = document.getElementById("status");
    const device = document.getElementById("device");
    const video = document.getElementById("camera");
    let currentStream;

    function reportCameraStatus(prefix) {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      status.textContent = width && height
        ? prefix + " " + width + "x" + height + " (live)"
        : prefix + " (waiting for dimensions)";
    }

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

    async function startCamera() {
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
        reportCameraStatus("Camera attached");
      } catch (error) {
        status.textContent = "Camera blocked: " + (error && error.message ? error.message : String(error));
      }
    }

    video.addEventListener("loadedmetadata", () => reportCameraStatus("Camera attached"));
    video.addEventListener("resize", () => reportCameraStatus("Camera attached"));
    document.getElementById("start").addEventListener("click", startCamera);
    void refreshDevices()
      .then(() => startCamera())
      .catch((error) => {
        status.textContent = "Camera unavailable: " + (error && error.message ? error.message : String(error));
      });
  </script>
</body>
</html>`;
}

function sellerLiveControlHtml(req: import("node:http").IncomingMessage) {
  const base = runtimeOrigin(req);
  const url = new URL(req.url ?? "/seller-live-control", base);
  const sessionId = url.searchParams.get("sessionId") || vintageJewelryLiveSessionSpec.sessionId;
  const overlayOrigin = base.replace(":8787", ":5180");
  const publicOverlayUrl =
    `${overlayOrigin}/?runtimeOrigin=${encodeURIComponent(base)}&sessionId=${encodeURIComponent(sessionId)}`;
  const compositorOverlayUrl = `${publicOverlayUrl}&transparent=1`;
  const cameraPreviewUrl =
    `${base}/camera-compositor/preview?overlayUrl=${encodeURIComponent(compositorOverlayUrl)}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LiveSeller isolated seller control</title>
  <style>
    :root{color-scheme:light;--orange:#ee4d2d;--ink:#0f172a;--muted:#64748b;--line:#fed7aa;--panel:#fff7ed}
    *{box-sizing:border-box}
    body{margin:0;background:#fff7ed;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    main{display:grid;grid-template-columns:minmax(360px,1fr) 360px;gap:16px;min-height:100vh;padding:16px}
    header,.panel{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px}
    header{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:12px}
    h1,h2,h3,p{margin:0}
    h1{font-size:28px;line-height:1}
    h2{font-size:18px;margin-bottom:8px}
    h3{font-size:15px}
    p,.muted{color:var(--muted);line-height:1.35}
    button{border:0;border-radius:6px;background:var(--orange);color:white;font-weight:800;padding:10px 12px;cursor:pointer}
    button.secondary{background:#0f172a}
    button:disabled{background:#fed7aa;color:#64748b;cursor:not-allowed}
    input,textarea,select{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:9px 10px;font:inherit;color:var(--ink);background:white}
    textarea{resize:vertical}
    label{display:grid;gap:5px;font-weight:700;font-size:13px}
    .stage{background:#0f172a;border-radius:8px;padding:10px}
    iframe{display:block;width:100%;height:min(72vh,760px);border:0;border-radius:6px;background:#020617}
    .grid{display:grid;gap:12px}
    .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .products{display:grid;gap:8px}
    .product{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;border:1px solid #fed7aa;border-radius:8px;padding:8px;background:#fffaf5}
    .product img{width:72px;height:72px;object-fit:cover;border-radius:6px;background:#f1f5f9}
    .product strong{display:block}
    .script{min-height:92px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;white-space:pre-wrap}
    .log{height:260px;overflow:auto;background:#0f172a;color:#dbeafe;border-radius:6px;padding:10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
    .status{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;background:#ffedd5;color:#9a3412;font-weight:800}
    @media(max-width:900px){main{grid-template-columns:1fr}.stage iframe{height:720px}}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p>LiveSeller isolated seller UI</p>
        <h1>Camera + AI overlays</h1>
      </div>
      <span id="session-status" class="status">Loading</span>
    </header>

    <section class="stage" aria-label="Seller camera preview">
      <iframe id="camera-frame" title="Seller camera plus public overlay" allow="camera; microphone; autoplay" src="${cameraPreviewUrl.replaceAll("&", "&amp;")}"></iframe>
    </section>

    <aside class="grid">
      <section class="panel">
        <h2>Products in this live</h2>
        <div id="products" class="products">Loading products...</div>
      </section>

      <section class="panel grid">
        <h2>Go live</h2>
        <p class="muted">Paste captured stream credentials here to start the camera plus overlay publisher.</p>
        <label>Viewer URL <input id="viewer-url" placeholder="Viewer URL appears after live room is ready" /></label>
        <label>RTMP URL <input id="rtmp-url" placeholder="rtmp://..." autocomplete="off" /></label>
        <label>Stream key <input id="rtmp-key" placeholder="Stream key" type="password" autocomplete="off" /></label>
        <div class="row">
          <button id="go-live" type="button">Go Live</button>
          <button id="stop-stream" class="secondary" type="button">Stop</button>
        </div>
      </section>

      <section class="panel grid">
        <h2>AI stream director</h2>
        <div class="two">
          <button id="change-bg" type="button">Change bg</button>
          <button id="start-agent" type="button">Start voice agent</button>
        </div>
        <label>Host speech / translation command
          <textarea id="host-text" rows="3">这枚中古胸针今天直播可以近看珐琅和贝母细节</textarea>
        </label>
        <button id="translate" type="button">Translate on overlay</button>
        <label>Viewer message
          <textarea id="viewer-message" rows="3">Can ship to Singapore and how much is the cameo brooch?</textarea>
        </label>
        <button id="reply-viewer" type="button">Policy-check reply</button>
      </section>

      <section class="panel">
        <h2>Seller-only script</h2>
        <div id="seller-script" class="script">Pick a product to generate what to say next.</div>
      </section>

      <section class="panel">
        <h2>Live event log</h2>
        <div id="log" class="log">No live events yet.</div>
      </section>
    </aside>
  </main>

  <script>
    const runtimeOrigin = ${JSON.stringify(base)};
    const overlayOrigin = ${JSON.stringify(overlayOrigin)};
    const sessionId = ${JSON.stringify(sessionId)};
    const publicOverlayUrl = ${JSON.stringify(publicOverlayUrl)};
    const compositorOverlayUrl = ${JSON.stringify(compositorOverlayUrl)};
    const cameraPreviewUrl = ${JSON.stringify(cameraPreviewUrl)};
    const state = { products: [], events: [], currentProductId: undefined, cursor: 0 };

    const byId = (id) => document.getElementById(id);

    function log(title, detail, extra) {
      state.events.unshift({
        time: new Date().toISOString(),
        title,
        detail,
        ...(extra || {})
      });
      state.events = state.events.slice(0, 50);
      byId("log").textContent = state.events
        .map((event) => "[" + event.time + "] " + event.title + "\\n" + (event.detail || "") + "\\n" + JSON.stringify(event, null, 2))
        .join("\\n\\n");
    }

    async function fetchJson(path, options) {
      const response = await fetch(runtimeOrigin + path, {
        headers: { "content-type": "application/json" },
        ...(options || {})
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || body.error || "HTTP " + response.status);
      }
      return body;
    }

    async function callTool(name, args) {
      const result = await fetchJson("/api/runtime/realtime/tool-call", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          callId: "isolated-" + name + "-" + Date.now(),
          name,
          arguments: args || {}
        })
      });
      log("Realtime tool " + name, result.scriptSuggestion?.script || result.routed?.actions?.[0]?.reason || result.overlayState?.productCard?.title || result.overlayState?.translatedCaptions?.[0]?.text || result.overlayState?.background?.label || "Applied", {
        tool: name,
        redacted: true
      });
      return result;
    }

    function renderProducts() {
      byId("products").replaceChildren(...state.products.map((product) => {
        const row = document.createElement("article");
        row.className = "product";
        const image = product.media?.images?.[0];
        row.innerHTML =
          "<img alt=\\"" + (image?.alt || product.title).replaceAll("\\"", "&quot;") + "\\" src=\\"" + overlayOrigin + (image?.uri || "") + "\\" />" +
          "<div><strong>" + product.title + "</strong><span class=\\"muted\\">" + product.currency + " " + Number(product.price).toFixed(2) + " · " + product.stock + " left</span></div>" +
          "<button type=\\"button\\">Show</button>";
        row.querySelector("button").addEventListener("click", () => showProduct(product.id));
        return row;
      }));
    }

    async function showProduct(productId) {
      const product = state.products.find((candidate) => candidate.id === productId);
      state.currentProductId = productId;
      await callTool("show_product_card", { productId });
      const script = await callTool("prompt_seller_script", { productId });
      byId("seller-script").textContent = script.scriptSuggestion?.script || "No script returned.";
      log("Product changed", product?.title || productId, { productId });
    }

    async function loadSession() {
      const session = await fetchJson("/api/live-sessions/" + encodeURIComponent(sessionId) + "/spec");
      state.products = session.products || [];
      byId("session-status").textContent = state.products.length + " products ready";
      renderProducts();
      if (state.products[0]) {
        await showProduct(state.products[0].id);
      }
      log("Seller UI ready", "Camera preview and public overlay loaded.", {
        publicOverlayUrl,
        cameraPreviewUrl
      });
    }

    async function changeBackground() {
      const product = state.products.find((candidate) => candidate.id === state.currentProductId) || state.products[0];
      await callTool("show_overlay_background", {
        mode: "solid",
        value: "#ee4d2d",
        label: product ? "AI generated Shopee-orange background for " + product.title : "AI generated live background"
      });
    }

    async function resetBackground() {
      await callTool("show_overlay_background", {
        mode: "default",
        value: "default",
        label: "Default overlay background"
      });
    }

    async function translateCaption() {
      await callTool("emit_translation_caption", {
        text: byId("host-text").value.trim(),
        language: "zh",
        confidence: 0.95
      });
    }

    async function replyViewer() {
      const result = await callTool("send_policy_checked_reply", {
        viewerId: "isolated-viewer",
        viewerName: "Viewer",
        text: byId("viewer-message").value.trim(),
        language: "en"
      });
      log("Viewer message checked", result.routed?.actions?.map((action) => action.reason).join("\\n") || "No action returned.");
    }

    function realtimeClientSecret(response) {
      return response.value ||
        response.client_secret?.value ||
        response.client_secret ||
        response.ephemeralKey ||
        response.secret;
    }

    async function executeRealtimeFunctionCall(call) {
      const name = call.name;
      const args = JSON.parse(call.arguments || "{}");
      const result = await callTool(name, args);
      if (result.scriptSuggestion?.script) {
        byId("seller-script").textContent = result.scriptSuggestion.script;
      }
      return result;
    }

    function handleVoiceCommand(text) {
      const lowered = text.toLowerCase();
      const compact = lowered.replace(/\\s+/g, "");
      byId("host-text").value = text;
      const mentionsBackground = /\\b(bg|background|backdrop)\\b/.test(lowered) || compact.includes("背景");
      const stopsBackground = /\\b(stop|off|disable|remove)\\b/.test(lowered) ||
        lowered.includes("turn off") ||
        lowered.includes("camera only") ||
        lowered.includes("no background") ||
        compact.includes("关闭背景") ||
        compact.includes("關閉背景") ||
        compact.includes("停止背景");
      if (mentionsBackground && stopsBackground) {
        void resetBackground();
      } else if (mentionsBackground) {
        void changeBackground();
      }
      if (lowered.includes("translate") || lowered.includes("翻译")) {
        void translateCaption();
      }
      const product = state.products.find((candidate) =>
        lowered.includes(candidate.title.toLowerCase().split(" ").find((word) => word.length > 4) || candidate.title.toLowerCase())
      ) || (lowered.includes("peacock") ? state.products.find((candidate) => candidate.title.toLowerCase().includes("peacock")) : undefined)
        || (lowered.includes("cameo") ? state.products.find((candidate) => candidate.title.toLowerCase().includes("cameo")) : undefined)
        || (lowered.includes("bracelet") ? state.products.find((candidate) => candidate.title.toLowerCase().includes("bracelet")) : undefined);
      if (product) {
        void showProduct(product.id);
      }
      log("Voice command heard", text, { source: "browser_speech_or_realtime" });
    }

    async function startVoiceAgent() {
      try {
        const result = await fetchJson("/api/runtime/realtime/agent-session", {
          method: "POST",
          body: JSON.stringify({ sessionId, voice: "marin" })
        });
        const secret = realtimeClientSecret(result);
        if (!secret) {
          log("Realtime voice agent unavailable", result.error || "No ephemeral client secret returned.", {
            status: "warning",
            redacted: true
          });
          return;
        }
        const peer = new RTCPeerConnection();
        const channel = peer.createDataChannel("oai-events");
        channel.addEventListener("open", () => {
          log("Realtime voice agent connected", "Microphone audio is streaming; tool calls will update overlay/script/replies.", {
            redacted: true
          });
        });
        channel.addEventListener("message", (event) => {
          let payload;
          try {
            payload = JSON.parse(event.data);
          } catch {
            return;
          }
          if (payload.type === "response.function_call_arguments.done" || payload.type === "response.output_item.done") {
            const item = payload.item || payload;
            if (item.name && item.arguments) {
              void executeRealtimeFunctionCall(item).then((toolResult) => {
                channel.send(JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: item.call_id || item.callId || payload.call_id,
                    output: JSON.stringify(toolResult)
                  }
                }));
                channel.send(JSON.stringify({ type: "response.create" }));
              }).catch((error) => log("Realtime tool failed", error.message, { status: "error" }));
            }
          }
          if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript) {
            handleVoiceCommand(payload.transcript);
          }
        });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) {
          peer.addTrack(track, stream);
        }
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const model = result.session?.model || "gpt-realtime-2";
        const response = await fetch("https://api.openai.com/v1/realtime?model=" + encodeURIComponent(model), {
          method: "POST",
          headers: {
            authorization: "Bearer " + secret,
            "content-type": "application/sdp"
          },
          body: offer.sdp
        });
        if (!response.ok) {
          throw new Error("Realtime WebRTC returned " + response.status);
        }
        await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
        window.livesellerRealtimePeer?.close?.();
        window.livesellerRealtimePeer = peer;
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = false;
          recognition.lang = "zh-CN";
          recognition.onresult = (event) => {
            const latest = event.results[event.results.length - 1]?.[0]?.transcript;
            if (latest) {
              handleVoiceCommand(latest);
            }
          };
          recognition.start();
          window.livesellerSpeechRecognition = recognition;
        }
        log("Realtime voice agent requested", "Mic connected and ready for voice commands/tool calls.", {
          status: "success",
          clientSecretPresent: true,
          redacted: true
        });
      } catch (error) {
        log("Realtime voice agent unavailable", error.message, { status: "warning", redacted: true });
      }
    }

    async function goLive() {
      const rtmpUrl = byId("rtmp-url").value.trim();
      const rtmpKey = byId("rtmp-key").value.trim();
      const viewerUrl = byId("viewer-url").value.trim();
      if (!rtmpUrl || !rtmpKey) {
        const result = await fetchJson("/api/test-stream/start", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            overlayUrl: compositorOverlayUrl,
            sellerPreviewUrl: cameraPreviewUrl,
            cameraInputKind: "avfoundation",
            cameraInput: "0"
          })
        });
        byId("viewer-url").value = result.viewerUrl;
        log("Local test stream started", "No RTMP credentials were provided, so LiveSeller auto-published a local test stream.", {
          result,
          viewerUrl: result.viewerUrl,
          hlsUrl: result.hlsUrl,
          rtmpUrl: "not_required_for_local_test",
          rtmpKey: "not_required_for_local_test"
        });
        return;
      }
      const result = await fetchJson("/api/shopee/runtime-compositor/start", {
        method: "POST",
        body: JSON.stringify({
          rtmpUrl,
          rtmpKey,
          overlayUrl: compositorOverlayUrl,
          sellerPreviewUrl: cameraPreviewUrl,
          cameraInputKind: "avfoundation",
          cameraInput: "0",
          durationSeconds: 3600
        })
      });
      log("Publisher started", "Camera plus overlay is streaming to the live room.", {
        result,
        viewerUrl: viewerUrl || "pending_from_live_room",
        rtmpUrl: "present_redacted",
        rtmpKey: "present_redacted"
      });
    }

    async function stopStream() {
      const result = await fetchJson("/api/shopee/runtime-compositor/stop", {
        method: "POST",
        body: "{}"
      });
      log("Publisher stopped", result.state || "stopped", { result });
    }

    byId("go-live").addEventListener("click", () => void goLive().catch((error) => log("Go Live failed", error.message)));
    byId("stop-stream").addEventListener("click", () => void stopStream().catch((error) => log("Stop failed", error.message)));
    byId("change-bg").addEventListener("click", () => void changeBackground().catch((error) => log("Background change failed", error.message)));
    byId("translate").addEventListener("click", () => void translateCaption().catch((error) => log("Translation failed", error.message)));
    byId("reply-viewer").addEventListener("click", () => void replyViewer().catch((error) => log("Viewer reply failed", error.message)));
    byId("start-agent").addEventListener("click", () => void startVoiceAgent());
    void loadSession().catch((error) => log("Seller UI failed", error.message));
  </script>
</body>
</html>`;
}

function appendRoutedActionTimeline(
  sessionId: string,
  sourceEventId: string | undefined,
  actions: NonNullable<RealtimeAgentToolResult["routed"]>["actions"]
) {
  for (const action of actions) {
    sellerTimeline.append({
      service: "runtime",
      sessionId,
      kind: "runtime_action",
      status: action.requiresApproval ? "warning" : "success",
      title: action.type,
      detail: action.reason,
      subjectId: action.actionId,
      sourceEventId,
      approvalState: action.requiresApproval ? "pending" : "none"
    });
  }
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

      if (req.method === "GET" && req.url?.startsWith("/api/seller-timeline/events")) {
        const url = new URL(req.url, runtimeOrigin(req));
        const after = Number(url.searchParams.get("after") ?? "0");
        sendJson(res, 200, sellerTimeline.list({
          after: Number.isFinite(after) ? after : 0,
          sessionId: url.searchParams.get("sessionId") || undefined
        }));
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/api/seller-timeline/stream")) {
        sendSellerTimelineStream(req, res);
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/camera-compositor/preview")) {
        sendHtml(res, 200, compositorPreviewHtml(req));
        return;
      }

      if (req.method === "GET" && req.url?.startsWith("/seller-live-control")) {
        sendHtml(res, 200, sellerLiveControlHtml(req));
        return;
      }

      const testStreamMatch = /^\/test-stream\/([^/?]+)(?:\/([^?]+))?/u.exec(req.url ?? "");
      if (req.method === "GET" && testStreamMatch) {
        const streamId = testStreamMatch[1];
        const fileName = testStreamMatch[2];
        if (!streamId) {
          sendJson(res, 404, { error: "test_stream_not_found" });
          return;
        }
        if (!fileName) {
          sendHtml(res, 200, localTestStreamViewerHtml(req, streamId));
          return;
        }
        if (!activeLocalTestStream || activeLocalTestStream.id !== streamId) {
          sendJson(res, 404, { error: "test_stream_not_running" });
          return;
        }
        const safeFile = fileName.replaceAll(/[^a-zA-Z0-9._-]/gu, "");
        const contentType = safeFile.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : safeFile.endsWith(".ts")
            ? "video/mp2t"
            : "application/octet-stream";
        sendFile(res, join(activeLocalTestStream.workDir, safeFile), contentType);
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

      if (req.method === "POST" && req.url === "/api/live-sessions") {
        const body = await readJson(req);
        const session = registerRuntimeSession(LiveSessionSpecSchema.parse(body.session ?? body));
        sendJson(res, 201, {
          status: "registered",
          sessionId: session.sessionId,
          title: session.title,
          productCount: session.products.length,
          overlayUrl: `/api/overlay/${session.sessionId}`,
          scriptSuggestionsUrl: `/api/live-sessions/${session.sessionId}/script-suggestions`,
          realtimeToolCallUrl: "/api/runtime/realtime/tool-call"
        });
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
        sellerTimeline.append(runtimeEventTimelineEntry(event));
        appendRoutedActionTimeline(event.sessionId, event.eventId, routed.actions);
        sendJson(res, 200, routed);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/tool-call") {
        const body = await readJson(req);
        const sessionId = String(body.sessionId ?? "");
        const store = sessionStores.get(sessionId);
        if (!store) {
          sendJson(res, 404, { error: "session_not_found" });
          return;
        }
        const result = executeRealtimeAgentToolCall(store, {
          callId: typeof body.callId === "string" ? body.callId : undefined,
          name: body.name as RealtimeAgentToolName,
          arguments: typeof body.arguments === "object" && body.arguments !== null
            ? body.arguments as Record<string, unknown>
            : {}
        });
        sellerTimeline.append({
          service: "runtime",
          sessionId,
          kind: "realtime",
          status: "success",
          title: `Realtime tool ${result.tool}`,
          detail: result.scriptSuggestion?.script ?? result.routed?.actions[0]?.reason ?? result.overlayState?.background?.label ?? "Tool applied.",
          subjectId: result.scriptSuggestion?.productId ?? result.overlayState?.currentProductId,
          redacted: false
        });
        if (result.routed) {
          appendRoutedActionTimeline(sessionId, result.routed.context.event.eventId, result.routed.actions);
        }
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/session") {
        const session = await createRealtimeClientSecret();
        sellerTimeline.append({
          service: "runtime",
          kind: "realtime",
          status: session.status >= 200 && session.status < 300 ? "success" : "error",
          title: "Realtime client secret request",
          detail: session.status >= 200 && session.status < 300
            ? "Server minted an ephemeral client secret without exposing the OpenAI API key."
            : "Realtime client secret request failed; check runtime server OpenAI configuration.",
          redacted: true
        });
        sendJson(res, session.status, session.body);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/realtime/agent-session") {
        const body = await readJson(req);
        const sessionId = String(body.sessionId ?? validLiveSessionSpec.sessionId);
        const session = await createRealtimeAgentSession({
          sessionId,
          voice: typeof body.voice === "string" ? body.voice : undefined
        });
        sellerTimeline.append({
          service: "runtime",
          sessionId,
          kind: "realtime",
          status: session.status >= 200 && session.status < 300 ? "success" : "error",
          title: "RealtimeAgent session requested",
          detail: session.status >= 200 && session.status < 300
            ? "Ephemeral RealtimeAgent session is ready for the seller-private UI."
            : "RealtimeAgent session failed; server-side OpenAI configuration may be missing.",
          redacted: true
        });
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
        sellerTimeline.append({
          service: "runtime",
          kind: "stream",
          status: "success",
          title: "Overlay stream smoke sent",
          detail: `${result.durationSeconds} seconds to ${result.overlayUrl}`,
          redacted: true
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
        sellerTimeline.append({
          service: "runtime",
          kind: "stream",
          status: "success",
          title: "Camera and overlay publisher started",
          detail: `${result.outputSize} ${result.outputOrientation} stream to Shopee preview.`,
          redacted: true
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && req.url === "/api/test-stream/start") {
        const body = await readJson(req);
        const overlayUrl = String(body.overlayUrl ?? "");
        const sellerPreviewUrl = String(
          body.sellerPreviewUrl
            ?? `${runtimeOrigin(req)}/camera-compositor/preview?overlayUrl=${encodeURIComponent(overlayUrl)}`
        );
        const result = await startLocalTestStream({
          sessionId: typeof body.sessionId === "string" ? body.sessionId : vintageJewelryLiveSessionSpec.sessionId,
          origin: runtimeOrigin(req),
          overlayUrl,
          sellerPreviewUrl,
          cameraInputKind: typeof body.cameraInputKind === "string" ? body.cameraInputKind : undefined,
          cameraInput: typeof body.cameraInput === "string" ? body.cameraInput : undefined
        });
        sellerTimeline.append({
          service: "runtime",
          kind: "stream",
          status: "success",
          title: "Local test stream started",
          detail: result.viewerUrl,
          redacted: true
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "GET" && req.url === "/api/shopee/runtime-compositor/status") {
        sendJson(res, 200, getRuntimeCameraCompositorStatus());
        return;
      }

      if (req.method === "GET" && req.url === "/api/test-stream/status") {
        sendJson(res, 200, getLocalTestStreamStatus());
        return;
      }

      if (req.method === "POST" && req.url === "/api/shopee/runtime-compositor/stop") {
        const status = stopRuntimeCameraCompositor();
        const testStatus = stopLocalTestStream();
        sellerTimeline.append({
          service: "runtime",
          kind: "stream",
          status: status.state === "idle" ? "info" : "success",
          title: "Camera and overlay publisher stopped",
          detail: testStatus.state !== "idle" ? testStatus.state : status.state,
          redacted: true
        });
        sendJson(res, 200, testStatus.state !== "idle" ? testStatus : status);
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
        sellerTimeline.append({
          service: "runtime",
          sessionId: updatedReviewPlan.sessionId,
          kind: "product_creation",
          status: "success",
          title: "Seller review decision recorded",
          detail: `${decision.status}; ${createProductCommands.length} create_product command(s) ready.`,
          subjectId: decision.productId,
          approvalState: decision.status === "rejected" ? "rejected" : "approved"
        });
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
        const next = store.updateOverlayBackground(background) ?? current;
        sellerTimeline.append({
          service: "runtime",
          sessionId: overlayBackgroundSessionId,
          kind: "overlay",
          status: "success",
          title: "Overlay background changed",
          detail: background.label,
          redacted: false
        });
        sendJson(res, 200, next);
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
