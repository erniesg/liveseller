# Shopee UI Audit

This document is the required real-path checkpoint before relying on Shopee selectors or automation behavior.

## Current Status

- Status: not yet audited.
- Blocker label: `REAL_SHOPEE_UI_AUDIT_REQUIRED`.
- Reason: this repo provides the extension/content-script runtime bridge and deterministic command safety, but no authenticated Shopee seller tab has been inspected yet.
- Seller-private UI surfaces:
  - Chrome extension side panel: `apps/extension/sidepanel.html`. This is where product review, edit, approval, create-product execution, livestream preparation, and seller-only suggestions belong during a real authenticated Shopee session.
  - Local seller console: `http://127.0.0.1:5180/?mode=seller&runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001`. This is a local test harness only.
- Public viewer surface:
  - Browser-source overlay: `http://127.0.0.1:5180/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001`. This must not show seller controls, mic controls, review controls, stream credentials, or suggestions.
- Go Live location:
  - Real Go Live is still the Shopee Seller Centre control in the authenticated seller tab. LiveSeller may prepare the session and capture redacted credential presence evidence, but it must not press Go Live until explicit seller approval and camera preview verification.

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
| Prepare livestream | Implemented as dry-run command | Blocked pending audit | `goLive:false`, redacted credential presence only |
| Press Go Live | Not automated | Blocked pending explicit approval | Manual Shopee Seller Centre click after camera preview |
| Seller suggestions | Implemented in local seller console | Blocked pending audit | Must remain side panel/seller console only, never public overlay |
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
3. Load the unpacked extension from `apps/extension` after building extension assets.
4. Open an authenticated Shopee seller live tab.
5. Send a viewer message from a second device/account.
6. Record the captured viewer ID, name, text, timestamp, and DOM selector.
7. Trigger a safe price question and verify draft/send behavior.
8. Trigger a refund/fake/legal/discount message and verify no public auto-send occurs.
9. Run prepare-livestream only with `goLive:false`; record redacted presence evidence for server URL and stream key.
10. Verify the public overlay URL has no seller controls, while the extension side panel or local seller console shows seller suggestions.
11. Press Go Live manually in Shopee Seller Centre only after explicit seller approval and camera preview verification.
