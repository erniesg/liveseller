# API And Message Interfaces

## Shared Messages

All lane boundaries use the Zod schemas from `@liveseller/contracts`.

- Prep emits `LiveSessionSpec`, `ProductRecord[]`, `PromoRecord[]`, `PolicyPack`, product identity drafts, citations, assets, missing-field report, seller guidance, photo enhancement plans, and seller UI policy.
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

## Shopee Extension Runtime Bridge

Implemented in `apps/extension/src/contentScript.ts`.

- `installReceiveNormalUserMessageHook(target, onPayload)`
  - Wraps a page-level `receiveNormalUserMessage(payload)` callback without blocking the original Shopee handler.
- `normalizeReceiveNormalUserMessagePayload(payload, sessionId, timestamp?)`
  - Converts Shopee-like viewer message payloads into `RuntimeEvent.viewer_chat`.
- `handleReceiveNormalUserMessage(payload, options)`
  - Posts the normalized event to `POST /api/runtime/events`.
  - Validates returned `LiveAction` and `ToolResult` values against shared contracts.
  - Runs each action through the deterministic extension command executor.
  - Produces a `ReviewPayload` that can be rendered into the extension side panel or a document evidence target.

## Adapter Rules

- Extension command execution must be deterministic.
- The extension must not overwrite seller typing.
- Risky actions are seller alerts, drafts, or approvals only.
- Overlay promo banners must show `Shopee-backed` or `Overlay-only`.

## Prep Drop-Folder Interface

Implemented in `apps/prep/src/index.ts`.

- `discoverSellerMaterialFiles(inputPath)`
  - Accepts a file, document, or folder and classifies each discovered file as `image`, `document`, or `other`.
- `buildSellerMaterialIngestion(inputPath, options?)`
  - Returns structured product identity drafts, product records, promo/policy data, citations, assets, missing-field report, seller guidance, server-side photo enhancement plans, seller UI policy, and valid `LiveSessionSpec`.
- `discoverSellerDropFolderAssets(folder)`
  - Reads seller-supplied image files from a local folder.
  - Groups files by matching each file name to product image citations ending in `drop-folder file: <fileName>`.
  - Supports supplied `ProductRecord[]` fixture sets; adding a product with matching image citations does not require prep code changes.
- `buildSellerDropFolderExtraction(folder)`
  - Returns a valid `LiveSessionSpec`, structured product and promo records, seller guidance, and image generation prompts.
  - Image generation prompts target server-side `gpt-image-2` use; browser clients and extensions must not hold OpenAI API keys.

## Seller UI Policy Payload

Prep emits `sellerUiPolicy` for the Chrome extension side panel.

- `status`
  - `seller_review_required` until missing Shopee IDs, low confidence, or other review fields are resolved.
- `products[]`
  - Product title, SKU, price label, stock label, image count, missing fields, and review requirement.
- `photoEnhancement[]`
  - Server-side `gpt-image-2` prompt counts and source-image counts. The extension renders these; it does not call image models.
- `publicAutomation`
  - Low-risk structured facts are the only auto-send lane. Refund, legal, fake/counterfeit, fraud, discount, and unclear risky cases require approval or are blocked from public auto-send.
