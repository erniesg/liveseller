# Two-Minute Demo Script

## 0:00-0:25 Prep

Run:

```bash
npm run demo:prep
```

Show that the seller material folder becomes structured product identity drafts, product records, promo/policy data, citations, assets, missing-field report, photo enhancement plans, seller UI policy, and `LiveSessionSpec`.

Product grouping is citation-driven: each copied image is matched through a product image citation ending in `drop-folder file: <fileName>`. Human validation should confirm product count, image counts, seller talk tracks, `gpt-image-2` prompt plans, and seller UI policy before using those records in a live session.

For the real one-image smoke with a local `.env` key, run:

```bash
npm run live:prep:one-image
```

This uses the repo fixture images in `apps/prep/fixtures/seller-drop/vintage-jewelry`, server-side `gpt-image-2` image editing to produce a generated product image, writes initial and updated `ProductReviewPlan` artifacts, records a free-form seller edit request as another review round, and verifies create-product commands remain at zero before approval. The smoke harness accepts explicit structured intent through `--seller-intent`; a Codex app-server operator console should be the intelligent layer that interprets free-form seller text, chooses whether to update the plan, request edits, generate more image variants, or publish after approval.

## 0:25-0:55 Safe Live Replies

Run:

```bash
npm run demo:runtime
```

Explain that safe product questions use structured price and stock fields and can become `send_reply`.

## 0:55-1:20 Risk Gates

Show the runtime tests or demo events for refund, fake/counterfeit, legal, fraud, and discount negotiation. These produce `draft_reply`, `escalate`, or `request_approval`, never unsafe auto-send.

## 1:20-1:45 Overlay

Run:

```bash
npm run dev:overlay:local
```

Open the public viewer overlay:

```text
http://127.0.0.1:5180/?runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001
```

Show product card, overlay-only promo, quantity, countdown, Chinese source caption, and English translated caption. Then open the seller-private local console:

```text
http://127.0.0.1:5180/?mode=seller&runtimeOrigin=http%3A%2F%2F127.0.0.1%3A8787&sessionId=live-vintage-jewelry-001
```

Use this only for seller guidance, viewer-message testing, caption controls, and run-of-show rehearsal. These controls must not appear on the public overlay.

## Chrome Extension Human Test

Run:

```bash
npm run dev:runtime
npm run dev:overlay:local
```

Load the unpacked extension from `apps/extension`, open the side panel, and use `http://127.0.0.1:8787` as the runtime origin.

Validation path:

1. Click `Load review plan`.
2. Edit one product title, description, category, price, or stock field.
3. Click `Approve or save edit`, then `Approve all`.
4. Click `Execute create_product`; this is still dry-run readiness until real Shopee selectors are audited.
5. Click `Prepare livestream`; expected evidence has `present_redacted` credentials and `goLivePressed:false`.
6. Click `Copy overlay URL` or `Open public overlay`; use that URL as the public browser source for stream software or a Shopee-supported preview path.
7. Click `Open Shopee Live setup` to move the human to Seller Centre.
8. In Shopee, verify camera/video preview and overlay feed manually.
9. Send a test viewer message from another account/device, then click `Use captured Shopee message` or enter a manual viewer message.
10. Confirm seller suggestions appear only in the extension side panel and never in the public overlay.

Image edit prep can run in parallel before final approval:

```bash
npm run live:prep:one-image
```

Expected timing: under 2 minutes for review/edit/approval on fixtures, 1-3 minutes for a one-image edit smoke, and 3-8 minutes target for a three-product pre-stream prep with parallel image edits after seller materials are ready.

To repeat the Shopee preview ingest smoke without storing secrets, copy the RTMP URL and key from the Shopee preview page into environment variables:

```bash
SHOPEE_RTMP_URL='<copy Shopee URL field>' \
SHOPEE_RTMP_KEY='sg-live-...redacted...' \
npm run live:stream:overlay-smoke
```

The script captures the public overlay URL and pushes a short preview feed to Shopee. It redacts the URL/key from output. It does not click `Go Live`.

## 1:45-2:00 Summary

Show post-stream summary recommendations from `apps/runtime/src/postStream.ts` and the explicit real Shopee audit blocker in `docs/shopee-ui-audit.md`.
