# Shopee UI Audit

This document is the required real-path checkpoint before relying on Shopee selectors or automation behavior.

## Current Status

- Status: not yet audited.
- Blocker label: `REAL_SHOPEE_UI_AUDIT_REQUIRED`.
- Reason: this repo provides the extension/content-script runtime bridge and deterministic command safety, but no authenticated Shopee seller tab has been inspected yet.
- Chrome check on 2026-06-06: an authenticated Shopee Seller Centre product-list tab was visible at `https://seller.shopee.sg/portal/product/list/all?operationSortBy=modified_time`.
- Shopee Live setup proof on 2026-06-06: direct Seller Centre `/portal/live` returned `/404`, but `https://live.shopee.sg/pc/setup?from=seller_center` opened the real `Create Streaming` page. A test stream setup advanced to `https://live.shopee.sg/pc/preview?...`, showing redacted RTMP URL/key presence, `Refresh`, comments, realtime data, and a `Go Live` button. `Go Live` was not pressed.
- Shopee ingest proof on 2026-06-06: `ffmpeg` pushed a short public-overlay smoke feed to the redacted Shopee RTMP target. The preview page stopped showing the acquisition failure and displayed the incoming LiveSeller overlay background while buffering. Full host-camera compositing remains an OBS/browser-source setup step.
- Extension-assisted launch update on 2026-06-06: the side panel now has `AI prepare Shopee Test preview` and `Start overlay preview pipe`. The extension creates/enters Shopee Test preview, captures RTMP credentials transiently, and calls the local runtime to start the overlay preview pipe. Raw RTMP values are not written to docs, logs, or extension session storage.
- Seller material intake update on 2026-06-06: Jodi's side-panel image drop UI is integrated into the current extension side panel as `Seller material intake`. It creates local editable review drafts for human validation; server-backed Shopee create-product commands still require runtime ingestion of the material set.
- Seller-private UI surfaces:
  - Chrome extension side panel: `apps/extension/sidepanel.html`. This is where product review, edit, approval, create-product execution, livestream preparation, and seller-only suggestions belong during a real authenticated Shopee session.
  - Local seller console: `http://127.0.0.1:5180/?mode=seller&runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001`. This is a local test harness only.
- Public viewer surface:
  - Browser-source overlay: `http://127.0.0.1:5180/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001`. This must not show seller controls, mic controls, review controls, stream credentials, or suggestions.
- Go Live location:
  - Real Go Live is still the Shopee Seller Centre control in the authenticated seller tab. LiveSeller may prepare the session and capture redacted credential presence evidence, but it must not press Go Live until explicit seller approval and camera preview verification.
- Stream output target:
  - The extension side panel now exposes the public overlay browser-source URL. A human should paste this URL into OBS/streaming software or the Shopee-supported browser-source/scene input, then verify the viewer-facing feed shows host video plus overlay. If Shopee only accepts camera/RTMP input, the stream pipe remains the seller's streaming software: LiveSeller provides the overlay URL and runtime events, not raw stream credentials.

## Required Evidence

Record these before enabling real sends:

- Seller account region and Shopee Live URL.
- Screenshot of host chat area with sensitive data redacted.
- DOM selectors or stable attributes for viewer rows, viewer IDs/names, message text, composer, send button, product panel, and promo panel.
- Event log proving a second device viewer message appears in the seller tab.
- Evidence that draft insertion does not overwrite seller typing.
- Evidence that safe send works only for low-risk factual replies.
- Evidence that risky messages appear as seller-only drafts, alerts, or approvals.

## Capability Matrix

| Capability | Local Status | Real Shopee Status | Notes |
| --- | --- | --- | --- |
| Capture non-host viewer message | Implemented with DOM-row helper | Blocked pending audit | Needs selector proof |
| Hook `receiveNormalUserMessage` | Implemented with page-handler wrapper and runtime POST test | Blocked pending audit | Needs authenticated seller-tab event proof |
| Draft safe reply | Implemented in command executor | Blocked pending audit | Must protect seller typing |
| Send low-risk reply | Implemented in command executor | Blocked pending audit | Enable only after real proof |
| Escalate risky message | Implemented as seller-only command | Blocked pending audit | No public auto-send |
| Read active product | Contracted | Blocked pending audit | Needs seller UI selector |
| Show overlay promo | Implemented in overlay app | Mock only | Must distinguish Shopee-backed vs overlay-only |
| Prepare livestream | Implemented as dry-run command plus extension-assisted Test preview | Test setup and RTMP ingest proven | `goLive:false`, redacted credential presence only |
| Camera plus overlay pipe | Overlay smoke implemented; camera bridge documented | Needs runtime/OBS/ffmpeg camera compositor proof | Extension coordinates; native runtime owns RTMP encoder |
| Press Go Live | Not automated | Blocked pending explicit approval | Manual Shopee Seller Centre click after camera preview |
| Seller suggestions | Implemented in extension side panel and local seller console | Blocked pending live chat selector audit | Must remain side panel/seller console only, never public overlay |
| Realtime voice translation | Server-owned endpoint scaffolded | Blocked without server `OPENAI_API_KEY` and seller mic approval | Browser receives ephemeral client secret only |

## Local Dynamic Payload Proof

- `npm --workspace @liveseller/extension run test`
  - Verifies the `receiveNormalUserMessage` hook preserves the original page callback.
  - Verifies a Shopee-like payload is normalized into `RuntimeEvent.viewer_chat`.
  - Verifies the event is posted to `/api/runtime/events`.
  - Verifies returned `LiveAction` evidence is rendered with `data-liveseller-action-id`.
  - Verifies returned actions still pass through deterministic extension command safety.

## Manual Proof Script

1. Start the runtime server with `npm run dev:runtime`.
2. Start the fixed local overlay server with `npm run dev:overlay:local`.
3. Load the unpacked extension from `apps/extension`.
4. Open an authenticated Shopee seller live tab.
5. In the extension side panel, load the review plan, edit at least one product field, approve all products, execute `create_product`, and run prepare-livestream only with `goLive:false`.
6. Copy the public overlay browser-source URL from the side panel and add it to the stream software or Shopee-supported preview path.
7. Record redacted presence evidence for server URL and stream key; never store raw stream secrets in the extension or overlay.
8. Send a viewer message from a second device/account.
9. Record the captured viewer ID, name, text, timestamp, and DOM selector.
10. Trigger a safe price question and verify draft/send behavior.
11. Trigger a refund/fake/legal/discount message and verify no public auto-send occurs.
12. Verify the public overlay URL has no seller controls, while the extension side panel or local seller console shows seller suggestions.
13. Verify the Shopee camera/video preview and overlay feed manually.
14. Press Go Live manually in Shopee Seller Centre only after explicit seller approval and camera preview verification.

## Prep Timing Expectations

- Review/edit/approve fixture plan in the Chrome side panel: under 2 minutes.
- One server-side image edit smoke with `npm run live:prep:one-image`: typically 1-3 minutes depending on image model latency and network.
- Three-product pre-stream plan finalisation with parallel image edits: target 3-8 minutes after seller materials are available.
- Real Shopee livestream creation: depends on Seller Centre page latency, camera permission, and stream software setup; treat as blocked until the Live UI audit records selectors and screenshots.
