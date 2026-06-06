# LiveSeller

LiveSeller is a hackathon-ready Shopee Live commerce copilot. It turns seller uploads into structured product, promo, and policy data, then runs a safe live runtime that can draft or send low-risk replies, show overlays, escalate sensitive questions, and summarize the stream.

## What Is Implemented

- TypeScript monorepo with shared Zod contracts.
- Seed prep pipeline that creates products, promo, policy pack, citations, missing-field report, assets, and `LiveSessionSpec`.
- Runtime policy engine with fake extension and fake overlay adapters.
- Overlay web app for product cards, promo banners, quantities, countdowns, and multilingual captions.
- Chrome extension skeleton for real authenticated Shopee tab work.
- Tests for schema validation, prep checkpoint, policy no-auto-send behavior, adapter behavior, and overlay rendering.

## Repo Workflow

- `main` is the stable integration branch.
- 5-hour hackathon checkpoints live in `docs/5-hour-hackathon.md`.
- Definitions of done live in `docs/definition-of-done.md`.
- Planning context lives in `docs/planning-context.md`.
- Stack decisions live in `docs/tech-stack.md`.
- Contract guidance lives in `docs/contracts.md`.
- Contribution and PR rules live in `CONTRIBUTING.md`.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run demo:prep
npm run live:prep:one-image
npm run demo:runtime
npm run dev:overlay
```

`npm run live:prep:one-image` requires `OPENAI_API_KEY` in a local `.env`. It runs one seller product image through server-side `gpt-image-2` image editing, writes initial/updated/response review plans under ignored `artifacts/prep-live/`, records one free-form seller response, and confirms no create-product command is emitted before approval.

## Checkpoints

See `docs/checkpoints.md` for lane-level definitions of done and verification commands.
