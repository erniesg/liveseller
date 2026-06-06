# Two-Minute Demo Script

## 0:00-0:25 Prep

Run:

```bash
npm run demo:prep
```

Show that the seed folder becomes 3 products, 1 promo, 1 policy pack, citations, assets, missing-field report, and `LiveSessionSpec`.

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
npm run dev:runtime
npm run dev:overlay
```

Show product card, overlay-only promo, quantity, countdown, Chinese source caption, and English translated caption.

For Swara's local realtime proof, open `http://127.0.0.1:5173`, choose source and target languages in the host translator controls, click Start, and speak. The browser captures the local transcript, then the runtime emits `update_caption` and `emit_translation` actions. Stop or language-switch clears the live captions. If browser speech recognition misses Chinese, type the Chinese sentence in the manual transcript field and click Send to verify the same runtime translation path. Set `OPENAI_API_KEY` on the runtime server for real server-side translation; without it, the runtime uses deterministic checkpoint translations.

## 1:45-2:00 Summary

Show post-stream summary recommendations from `apps/runtime/src/postStream.ts` and the explicit real Shopee audit blocker in `docs/shopee-ui-audit.md`.
