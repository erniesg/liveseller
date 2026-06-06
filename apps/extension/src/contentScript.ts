import {
  type LanguageCode,
  type RuntimeEvent,
  LanguageCodeSchema,
  RuntimeEventSchema
} from "@liveseller/contracts";

export type CapturedViewerMessage = {
  viewerId: string;
  viewerName: string;
  text: string;
  language?: LanguageCode;
  timestamp?: string;
};

function readFirstAttribute(row: Element, names: string[]): string | null {
  for (const name of names) {
    const value = row.getAttribute(name)?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readMessageText(row: Element): string | null {
  const messageNode = row.querySelector("[data-message-text], [data-live-message-text]");
  return messageNode?.textContent?.trim() || row.textContent?.trim() || null;
}

function readLanguage(row: Element): LanguageCode | undefined {
  const language = readFirstAttribute(row, ["data-language", "lang"]);
  const parsed = LanguageCodeSchema.safeParse(language);
  return parsed.success ? parsed.data : undefined;
}

export function isHostViewerRow(row: Element): boolean {
  return (
    row.getAttribute("data-live-role") === "host" ||
    row.getAttribute("data-is-host") === "true" ||
    row.getAttribute("aria-label")?.toLowerCase().includes("host message") === true
  );
}

export function extractViewerMessage(row: Element): CapturedViewerMessage | null {
  if (isHostViewerRow(row)) {
    return null;
  }

  const viewerId = readFirstAttribute(row, [
    "data-viewer-id",
    "data-live-viewer-id",
    "data-sender-id"
  ]);
  const viewerName = readFirstAttribute(row, [
    "data-viewer-name",
    "data-live-viewer-name",
    "data-sender-name"
  ]);
  const text = readMessageText(row);

  if (!viewerId || !viewerName || !text) {
    return null;
  }

  const message: CapturedViewerMessage = {
    viewerId,
    viewerName,
    text
  };

  const language = readLanguage(row);
  const capturedAt = readFirstAttribute(row, ["data-timestamp", "datetime"]);
  if (language) {
    message.language = language;
  }
  if (capturedAt) {
    message.timestamp = capturedAt;
  }

  return message;
}

export function toViewerChatEvent(
  message: CapturedViewerMessage,
  sessionId: string,
  timestamp = new Date().toISOString()
): RuntimeEvent {
  return RuntimeEventSchema.parse({
    eventId: `viewer-${message.viewerId}-${Date.parse(timestamp)}`,
    sessionId,
    timestamp,
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: message.viewerId,
      viewerName: message.viewerName,
      text: message.text,
      language: message.language
    }
  });
}
