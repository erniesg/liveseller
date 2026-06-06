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
npm run dev:overlay
```

Show product card, overlay-only promo, quantity, countdown, Chinese source caption, and English translated caption.

## 1:45-2:00 Summary

Show post-stream summary recommendations from `apps/runtime/src/postStream.ts` and the explicit real Shopee audit blocker in `docs/shopee-ui-audit.md`.
