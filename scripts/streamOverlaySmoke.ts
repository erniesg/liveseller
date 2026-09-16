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

if (!rtmpUrl || !rtmpKey) {
  throw new Error(
    "Set SHOPEE_RTMP_URL and SHOPEE_RTMP_KEY from the Shopee preview page. The script redacts them from output."
  );
}

const requiredRtmpUrl = rtmpUrl;
const requiredRtmpKey = rtmpKey;
const workDir = mkdtempSync(join(tmpdir(), "liveseller-stream-smoke-"));
const screenshotPath = join(workDir, "overlay.png");

function redact(value: string) {
  return value
    .replaceAll(requiredRtmpUrl, "rtmp_url_present_redacted")
    .replaceAll(requiredRtmpKey, "stream_key_present_redacted");
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(overlayUrl, { waitUntil: "networkidle" });
    await page.screenshot({ path: screenshotPath });
  } finally {
    await browser.close();
  }

  const targetUrl = `${requiredRtmpUrl}${requiredRtmpKey}`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
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
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "stillimage",
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
    status: "sent_overlay_stream_smoke",
    overlayUrl,
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
