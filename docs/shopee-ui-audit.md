# Shopee UI Audit

This document is the required real-path checkpoint before relying on Shopee selectors or automation behavior.

## Current Status

- Status: blocked as of 2026-06-06.
- Blocker label: `REAL_SHOPEE_UI_AUDIT_REQUIRED`.
- Reason: this workspace has no authenticated Shopee seller live tab or second-device viewer account to inspect. The Lane 3 extension now provides deterministic local helpers, side-panel blocker states, and seller-command guards, but real Shopee automation must remain disabled until selectors and composer behavior are proven in an authenticated tab.

## Latest Lane 3 Proof

- Branch: `codex/jodisw-ui-context`.
- Local mock proof: content-script helpers convert audited viewer rows with `data-viewer-id`, `data-viewer-name`, optional `data-language`, and nested `data-message-text` into `RuntimeEvent.viewer_chat`.
- Host-row guard: rows marked `data-live-role="host"`, `data-is-host="true"`, or host-message `aria-label` are ignored.
- Command proof: `send_reply` can public-send only when the runtime action is low-risk, does not require approval, has a `send_reply` payload, and the composer guard passes.
- Seller-only proof: `draft_reply`, `escalate`, and `request_approval` do not public-send.
- UI proof: `apps/extension/sidepanel.html` shows disconnected runtime, real-selector blocker, captured message, pending actions, composer guard, approval controls, and latest tool-result evidence for the vintage-jewelry live session.
- Open blocker: no real Shopee URL, screenshot, selector list, second-device event log, or composer/send-button evidence is available in this environment.

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
| Draft safe reply | Implemented in command executor | Blocked pending audit | Must protect seller typing |
| Send low-risk reply | Implemented in command executor | Blocked pending audit | Enable only after real proof |
| Escalate risky message | Implemented as seller-only command | Blocked pending audit | No public auto-send |
| Read active product | Contracted | Blocked pending audit | Needs seller UI selector |
| Show overlay promo | Implemented in overlay app | Mock only | Must distinguish Shopee-backed vs overlay-only |

## Manual Proof Script

1. Start the runtime server with `npm run dev:runtime`.
2. Load the unpacked extension from `apps/extension` after building extension assets.
3. Open an authenticated Shopee seller live tab.
4. Send a viewer message from a second device/account.
5. Record the captured viewer ID, name, text, timestamp, and DOM selector.
6. Trigger a safe price question and verify draft/send behavior.
7. Trigger a refund/fake/legal/discount message and verify no public auto-send occurs.
