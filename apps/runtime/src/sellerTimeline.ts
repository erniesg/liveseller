import {
  SellerTimelineEventSchema,
  type RuntimeEvent,
  type SellerTimelineEvent,
  type SellerTimelineResponse
} from "@liveseller/contracts";

const MAX_EVENTS = 200;

export type SellerTimelineStore = {
  append(event: Omit<SellerTimelineEvent, "id" | "timestamp" | "redacted"> & {
    id?: string;
    timestamp?: string;
    redacted?: boolean;
  }): SellerTimelineEvent;
  list(options?: { after?: number; sessionId?: string }): SellerTimelineResponse;
  subscribe(listener: (event: SellerTimelineEvent, cursor: number) => void): () => void;
};

function now(): string {
  return new Date().toISOString();
}

function eventTitle(event: RuntimeEvent): string {
  if (event.type === "viewer_chat") {
    return `Viewer message from ${event.payload.viewerName}`;
  }
  if (event.type === "host_transcript") {
    return "Host caption routed";
  }
  if (event.type === "product_switch") {
    return "Current product changed";
  }
  if (event.type === "promo_update") {
    return "Promo banner updated";
  }
  if (event.type === "metric_update") {
    return "Stream metrics updated";
  }
  if (event.type === "host_audio_chunk") {
    return "Host audio chunk received";
  }
  if (event.type === "tool_result") {
    return "Runtime tool result recorded";
  }
  return `Stream ${event.payload.status}`;
}

function eventDetail(event: RuntimeEvent): string | undefined {
  if (event.type === "viewer_chat" || event.type === "host_transcript") {
    return event.payload.text.slice(0, 180);
  }
  if (event.type === "product_switch") {
    return event.payload.productId;
  }
  if (event.type === "promo_update") {
    return `${event.payload.remainingQuantity} remaining`;
  }
  if (event.type === "metric_update") {
    return `${event.payload.viewerCount} viewers, ${event.payload.orders} orders`;
  }
  if (event.type === "host_audio_chunk") {
    return `${event.payload.durationMs}ms ${event.payload.format}`;
  }
  if (event.type === "tool_result") {
    return `${event.payload.adapter} ${event.payload.status}`;
  }
  return event.payload.reason ?? event.payload.status;
}

export function createSellerTimelineStore(): SellerTimelineStore {
  const events: SellerTimelineEvent[] = [];
  const listeners = new Set<(event: SellerTimelineEvent, cursor: number) => void>();
  let cursor = 0;

  return {
    append(input) {
      const { redacted, ...rest } = input;
      const event = SellerTimelineEventSchema.parse({
        ...rest,
        redacted: redacted ?? false,
        id: input.id ?? `timeline-${Date.now()}-${cursor + 1}`,
        timestamp: input.timestamp ?? now()
      });
      events.push(event);
      if (events.length > MAX_EVENTS) {
        events.splice(0, events.length - MAX_EVENTS);
      }
      cursor += 1;
      for (const listener of listeners) {
        listener(event, cursor);
      }
      return event;
    },
    list(options = {}) {
      const after = options.after ?? 0;
      return {
        events: events
          .slice(Math.max(0, events.length - Math.max(0, cursor - after)))
          .filter((event) => !options.sessionId || event.sessionId === options.sessionId),
        nextCursor: cursor
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function runtimeEventTimelineEntry(event: RuntimeEvent): Omit<SellerTimelineEvent, "id" | "timestamp"> {
  return {
    service: "runtime",
    sessionId: event.sessionId,
    kind: event.type === "viewer_chat" ? "viewer_message" : "runtime_event",
    status: "success",
    title: eventTitle(event),
    detail: eventDetail(event),
    subjectId: event.type === "product_switch" ? event.payload.productId : undefined,
    sourceEventId: event.eventId,
    redacted: false
  };
}
