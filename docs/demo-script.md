# Two-Minute Demo Script

## 0:00-0:25 Prep

Run:

```bash
npm run demo:prep
```

Show that the seed folder becomes 3 products, 1 promo, 1 policy pack, citations, assets, missing-field report, and `LiveSessionSpec`.

For the seller drop folder, show that product grouping is citation-driven: each copied image is matched through a product image citation ending in `drop-folder file: <fileName>`. Human validation should confirm product count, image counts, seller talk tracks, and `gpt-image-2` prompt plans before using those records in a live session.

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
