import { createServer } from "node:http";
import {
  RuntimeEventSchema,
  validLiveSessionSpec
} from "@liveseller/contracts";
import { routeRuntimeEvent } from "./runtime";

const auditLog: unknown[] = [];

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createRuntimeServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, service: "@liveseller/runtime" });
        return;
      }

      if (req.method === "GET" && req.url === `/api/live-sessions/${validLiveSessionSpec.sessionId}/spec`) {
        sendJson(res, 200, validLiveSessionSpec);
        return;
      }

      if (req.method === "POST" && req.url === "/api/runtime/events") {
        const event = RuntimeEventSchema.parse(await readJson(req));
        const routed = routeRuntimeEvent(event, validLiveSessionSpec);
        auditLog.push(...routed.auditEvents);
        sendJson(res, 200, routed);
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
