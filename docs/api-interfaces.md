# API And Message Interfaces

## Shared Messages

All lane boundaries use the Zod schemas from `@liveseller/contracts`.

- Prep emits `LiveSessionSpec`, `ProductRecord[]`, `PromoRecord[]`, `PolicyPack`, citations, assets, and missing-field report.
- Runtime consumes `RuntimeEvent` and emits `LiveAction[]`, `ToolResult[]`, `AuditEvent[]`, and `OverlayState`.
- Extension consumes approved `LiveAction` values and emits `ToolResult`.
- Overlay consumes `OverlayState` or overlay-safe `LiveAction` updates.

## Local Runtime API

Implemented in `apps/runtime/src/server.ts`.

- `GET /health`
  - Returns service health.
- `GET /api/live-sessions/live-seed-001/spec`
  - Returns the seed `LiveSessionSpec`.
- `POST /api/runtime/events`
  - Body: `RuntimeEvent`.
  - Returns: `{ context, actions, toolResults, auditEvents, overlayState }`.
- `POST /api/runtime/host-transcripts`
  - Body: `{ text, sourceLanguage, targetLanguage }`.
  - Local live-caption proof path used by the overlay mic controls.
  - Returns: `{ context, actions, toolResults, auditEvents, overlayState }`.
  - Uses server-owned translation; if `OPENAI_API_KEY` is present the runtime calls OpenAI from the server, otherwise it falls back to deterministic checkpoint translations.
- `GET /api/runtime/overlay-state`
  - Returns the latest in-memory `OverlayState` for local overlay polling.
- `GET /api/audit/live-seed-001`
  - Returns in-memory audit events for local demo sessions.

## Adapter Rules

- Extension command execution must be deterministic.
- The extension must not overwrite seller typing.
- Risky actions are seller alerts, drafts, or approvals only.
- Overlay promo banners must show `Shopee-backed` or `Overlay-only`.
