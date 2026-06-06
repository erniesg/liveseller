import type { RuntimeEvent } from "@liveseller/contracts";

export type CapturedViewerMessage = {
  viewerId: string;
  viewerName: string;
  text: string;
};

export function extractViewerMessage(row: Element): CapturedViewerMessage | null {
  const viewerId = row.getAttribute("data-viewer-id");
  const viewerName = row.getAttribute("data-viewer-name");
  const text = row.textContent?.trim();

  if (!viewerId || !viewerName || !text) {
    return null;
  }

  return {
    viewerId,
    viewerName,
    text
  };
}

export function toViewerChatEvent(
  message: CapturedViewerMessage,
  sessionId: string,
  timestamp = new Date().toISOString()
): RuntimeEvent {
  return {
    eventId: `viewer-${message.viewerId}-${Date.parse(timestamp)}`,
    sessionId,
    timestamp,
    source: "viewer",
    type: "viewer_chat",
    payload: {
      viewerId: message.viewerId,
      viewerName: message.viewerName,
      text: message.text
    }
  };
}
