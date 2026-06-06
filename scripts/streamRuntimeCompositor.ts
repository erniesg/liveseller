import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const overlayUrl = process.env.LIVESELLER_OVERLAY_URL
  ?? "http://127.0.0.1:5180/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-seed-001";
const rtmpUrl = process.env.SHOPEE_RTMP_URL;
const rtmpKey = process.env.SHOPEE_RTMP_KEY;
const durationSeconds = Number.parseInt(process.env.LIVESELLER_STREAM_SECONDS ?? "60", 10);
const cameraInputKind = process.env.LIVESELLER_CAMERA_INPUT_KIND ?? "lavfi";
const cameraInput = process.env.LIVESELLER_CAMERA_INPUT ?? "testsrc2=size=1280x720:rate=30";
const outputWidth = Number.parseInt(process.env.LIVESELLER_STREAM_WIDTH ?? "720", 10);
const outputHeight = Number.parseInt(process.env.LIVESELLER_STREAM_HEIGHT ?? "1280", 10);
const outputOrientation = process.env.LIVESELLER_STREAM_ORIENTATION ?? "vertical";

if (!rtmpUrl || !rtmpKey) {
  throw new Error(
    "Set SHOPEE_RTMP_URL and SHOPEE_RTMP_KEY from the Shopee preview page. The script redacts them from output."
  );
}

const requiredRtmpUrl = rtmpUrl;
const requiredRtmpKey = rtmpKey;
const workDir = mkdtempSync(join(tmpdir(), "liveseller-runtime-compositor-"));
const screenshotPath = join(workDir, "overlay.png");

function redact(value: string) {
  return value
    .replaceAll(requiredRtmpUrl, "rtmp_url_present_redacted")
    .replaceAll(requiredRtmpKey, "stream_key_present_redacted");
}

function cameraArgs() {
  if (cameraInputKind === "avfoundation") {
    return ["-f", "avfoundation", "-framerate", "30", "-video_size", "1280x720", "-i", cameraInput];
  }

  if (cameraInputKind === "none") {
    return ["-f", "lavfi", "-i", "color=c=0x111827:s=1280x720:r=30"];
  }

  return ["-f", "lavfi", "-i", cameraInput];
}

async function captureOverlay() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: outputWidth, height: outputHeight } });
    await page.goto(overlayUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath, omitBackground: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  await captureOverlay();

  const targetUrl = `${requiredRtmpUrl}${requiredRtmpKey}`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    ...cameraArgs(),
    "-loop",
    "1",
    "-framerate",
    "30",
    "-t",
    String(durationSeconds),
    "-i",
    screenshotPath,
    "-f",
    "lavfi",
    "-t",
    String(durationSeconds),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight}[cam];[1:v]scale=${outputWidth}:${outputHeight}[ovr];[cam][ovr]overlay=0:0:format=auto,format=yuv420p[v]`,
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
    "-shortest",
    "-f",
    "flv",
    targetUrl
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += redact(chunk.toString());
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
  });

  console.log(JSON.stringify({
    status: "sent_runtime_compositor_stream",
    overlayUrl,
    cameraInputKind,
    cameraInput: cameraInputKind === "avfoundation" ? "present_redacted" : cameraInput,
    outputOrientation,
    outputSize: `${outputWidth}x${outputHeight}`,
    rtmpUrl: "present_redacted",
    rtmpKey: "present_redacted",
    durationSeconds
  }, null, 2));
}

try {
  await main();
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
