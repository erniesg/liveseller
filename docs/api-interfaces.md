# API And Message Interfaces

## Shared Messages

All lane boundaries use the Zod schemas from `@liveseller/contracts`.

- Prep emits `LiveSessionSpec`, `ProductRecord[]`, `PromoRecord[]`, `PolicyPack`, citations, assets, missing-field report, seller guidance, and image generation plans.
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
- `GET /api/audit/live-seed-001`
  - Returns in-memory audit events for local demo sessions.

## Adapter Rules

- Extension command execution must be deterministic.
- The extension must not overwrite seller typing.
- Risky actions are seller alerts, drafts, or approvals only.
- Overlay promo banners must show `Shopee-backed` or `Overlay-only`.

## Prep Drop-Folder Interface

Implemented in `apps/prep/src/index.ts`.

- `discoverSellerDropFolderAssets(folder)`
  - Reads seller-supplied image files from a local folder.
  - Groups the current Downloads fixture into shared vintage-jewelry product fixtures.
- `buildSellerDropFolderExtraction(folder)`
  - Returns a valid `LiveSessionSpec`, structured product and promo records, seller guidance, and image generation prompts.
  - Image generation prompts target server-side `gpt-image-2` use; browser clients and extensions must not hold OpenAI API keys.
