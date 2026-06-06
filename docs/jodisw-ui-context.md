# JodisW Lane UI Context

This is the repo-local context for JodisW's Lane 3 agent. Use it to implement and verify this repo's Chrome extension, content script, side panel, and Shopee real-tab proof.

## Lane Purpose

JodisW owns the seller-tab UI path:

- Observe an authenticated Shopee seller tab through `apps/extension`.
- Convert real viewer chat rows into `RuntimeEvent.viewer_chat` payloads.
- Consume policy-gated `LiveAction` values from the runtime.
- Draft or send only deterministic low-risk commands.
- Keep risky actions seller-only as alerts, drafts, or approvals.
- Record real Shopee proof or blockers in `docs/shopee-ui-audit.md`.

The runtime owns policy decisions. The extension must not infer whether an answer is safe, invent prices, invent discounts, or turn a risky action into a public send.

## Product Context

The current demo seller is a Singapore vintage-jewelry live stream. The canonical fixture is `vintageJewelryLiveSessionSpec` in `packages/contracts/src/fixtures.ts`.

Session context:

- Session ID: `live-vintage-jewelry-001`
- Shop ID: `shop-sg-demo`
- Title: `Vintage Jewelry Live Showcase`
- Target languages: English, Chinese, Malay, Tamil
- Approval mode: `hybrid`
- Enabled seller-tab tools include `draft_reply`, `send_reply`, `escalate`, `request_approval`, and `record_memory`

Products:

| Product ID | Seller-facing product | Price | Stock | Safe public facts |
| --- | --- | ---: | ---: | --- |
| `prod-vintage-gold-grape-leaf-brooch` | Vintage Gold-Tone Grape Leaf Brooch | SGD 88 | 1 | Gold-tone botanical grape-and-leaf brooch, one available, ships from Singapore |
| `prod-vintage-blue-stone-bar-brooch` | Vintage Blue Stone Bar Brooch | SGD 118 | 1 | Blue stone and rhinestone-style bar brooch, one available, ships from Singapore |
| `prod-vintage-cameo-brooch` | Vintage Cream Cameo Brooch | SGD 138 | 1 | Cream cameo-style portrait brooch, one available, ships from Singapore |

Promo context:

- Promo ID: `promo-vintage-live-showcase`
- Offer: SGD 8 off, minimum spend SGD 80
- Remaining quantity: 3
- Eligible products: all three vintage jewelry products
- Source: `seller_note`
- Important UI label: overlay-only until the seller proves the voucher exists in Shopee

Policy context:

- Shipping: vintage jewelry ships from Singapore within 2 working days with protective packaging.
- Returns: unused items may be reviewed within 7 days; disclosed vintage patina or age-related marks are not new defects.
- Safe material answer: describe visible color, design, and condition only unless the seller has a certificate or structured record.
- Escalate authenticity accusations, refund commitments, legal threats, fraud allegations, and unauthorized discounts.
- Never claim precious-metal purity, natural gemstone identity, exact era, brand attribution, or official Shopee discounts without structured proof.

## UI Workflow

The expected seller flow is:

1. Seller opens an authenticated Shopee seller live tab and loads the extension.
2. Side panel shows runtime connection state, current session, captured viewer messages, pending actions, approval controls, and latest tool result evidence.
3. Content script observes audited viewer chat rows. Each non-host viewer row becomes a `RuntimeEvent.viewer_chat` with `viewerId`, `viewerName`, `text`, optional `language`, and an ISO timestamp.
4. Runtime returns `LiveAction` values. The extension displays them by risk and approval state instead of deciding policy locally.
5. Before writing to the Shopee composer, the extension checks that the composer is empty and the seller is not typing.
6. Low-risk `send_reply` actions may public-send only when `risk` is `low`, `requiresApproval` is `false`, payload kind is `send_reply`, and the composer guard passes.
7. `draft_reply`, `escalate`, and `request_approval` stay private to the seller. They may fill a draft or side-panel alert, but they must not public-send.
8. Every applied, skipped, rejected, or failed command emits a `ToolResult` with evidence and a clear reason.

## Required UI States

The side panel should make these states visible to the seller:

- Runtime disconnected: no public sends; show connection problem.
- Real selectors unaudited: local mock helpers may run, but real Shopee automation remains blocked.
- Captured viewer message: show viewer name, text, timestamp, and whether it has been sent to runtime.
- Pending safe reply: show public-send eligibility and cited product/promo fact.
- Pending draft or escalation: show seller-only status and why approval or review is needed.
- Composer occupied or seller typing: show skipped command result and preserve the existing composer text.
- Last tool result: show status, adapter, timestamp, evidence source, and error if present.

## Definition Of Done

Mock extension slice is done when:

- `extractViewerMessage` converts a DOM row into a `CapturedViewerMessage`.
- `toViewerChatEvent` emits a valid `RuntimeEvent.viewer_chat`.
- `executeSellerCommand` public-sends only low-risk, no-approval `send_reply` actions.
- Drafts never overwrite seller typing or a non-empty composer.
- `escalate` and `request_approval` never public-send.
- Extension files and manifest contain no long-lived OpenAI key material.
- Side panel has enough UI to show connection, pending actions, approval controls, and command status.

Real Shopee tab proof is done when `docs/shopee-ui-audit.md` records:

- Seller account region and Shopee Live URL with sensitive data redacted.
- Screenshot of the host chat area.
- Stable selectors or attributes for viewer row, viewer ID/name, message text, composer, send button, product panel, and promo panel.
- Event log proving a second-device viewer message appears in the seller tab and is converted to `RuntimeEvent.viewer_chat`.
- Evidence that draft insertion does not overwrite seller typing.
- Evidence that a low-risk factual reply can be drafted, and only sent after all send guards pass.
- Evidence that refund, fake/counterfeit, legal, fraud, and discount-negotiation messages become seller-only alerts, drafts, or approvals.
- Proof that any Shopee-backed promo exists in the seller UI, or an explicit blocker that the promo remains overlay-only.

## Verification

Run the extension lane checks before handing off:

```bash
npm test -- apps/extension/test/extension.test.ts
npm run typecheck
```

If real Shopee access is unavailable, update `docs/shopee-ui-audit.md` with the exact blocker and any partial selector/screenshot evidence instead of marking the lane complete.
