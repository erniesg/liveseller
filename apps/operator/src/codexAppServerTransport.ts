import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type {
  CodexAppServerTransport,
  CodexJsonRpcMessage,
  CodexJsonRpcRequest,
  CodexJsonRpcSuccessResponse
} from "./codexAppServerReview";

export type JsonLineCodexAppServerTransportOptions = {
  stdin: Writable;
  stdout: Readable;
};

export type ManagedCodexAppServerTransport = CodexAppServerTransport & {
  child: ChildProcessWithoutNullStreams;
  close(): Promise<void>;
};

export type SpawnCodexAppServerTransportOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
};

type QueueItem =
  | { kind: "message"; message: CodexJsonRpcMessage }
  | { kind: "error"; error: Error }
  | { kind: "end" };

function parseJsonRpcLine(line: string): CodexJsonRpcMessage {
  const parsed = JSON.parse(line) as unknown;
  if (!parsed || typeof parsed !== "object" || (!("method" in parsed) && !("id" in parsed))) {
    throw new Error("Codex app-server transport received a non-JSON-RPC message");
  }
  return parsed as CodexJsonRpcMessage;
}

export function createJsonLineCodexAppServerTransport(
  options: JsonLineCodexAppServerTransportOptions
): CodexAppServerTransport {
  const queue: QueueItem[] = [];
  const waiters: Array<() => void> = [];
  let buffer = "";

  function wake(): void {
    waiters.shift()?.();
  }

  function push(item: QueueItem): void {
    queue.push(item);
    wake();
  }

  options.stdout.on("data", (chunk: Buffer | string) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      try {
        push({ kind: "message", message: parseJsonRpcLine(line) });
      } catch (error) {
        push({ kind: "error", error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  });

  options.stdout.on("end", () => {
    if (buffer.trim().length > 0) {
      try {
        push({ kind: "message", message: parseJsonRpcLine(buffer) });
      } catch (error) {
        push({ kind: "error", error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    push({ kind: "end" });
  });

  options.stdout.on("error", (error) => {
    push({ kind: "error", error });
  });

  return {
    async send(message: CodexJsonRpcRequest | CodexJsonRpcSuccessResponse): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        options.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },

    async *events(): AsyncIterable<CodexJsonRpcMessage> {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => waiters.push(resolve));
        }

        const item = queue.shift();
        if (!item) {
          continue;
        }
        if (item.kind === "message") {
          yield item.message;
          continue;
        }
        if (item.kind === "error") {
          throw item.error;
        }
        return;
      }
    }
  };
}

export function spawnCodexAppServerStdioTransport(
  options: SpawnCodexAppServerTransportOptions = {}
): ManagedCodexAppServerTransport {
  const child = spawn(
    options.command ?? "codex",
    options.args ?? ["app-server", "--listen", "stdio://"],
    {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  const transport = createJsonLineCodexAppServerTransport({
    stdin: child.stdin,
    stdout: child.stdout
  });

  return {
    ...transport,
    child,
    async close(): Promise<void> {
      if (child.exitCode !== null) {
        return;
      }
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill();
      });
    }
  };
}
