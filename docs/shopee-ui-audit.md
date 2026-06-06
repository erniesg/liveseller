# Shopee UI Audit

This document is the required real-path checkpoint before relying on Shopee selectors or automation behavior.

## Current Status

- Status: not yet audited.
- Blocker label: `REAL_SHOPEE_UI_AUDIT_REQUIRED`.
- Reason: this repo provides the extension/content-script skeleton and deterministic command safety, but no authenticated Shopee seller tab has been inspected yet.

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
