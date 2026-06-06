# Checkpoints

For the SEAxOpenAI 5-hour build, use `docs/5-hour-hackathon.md` as the timeboxed operating plan. This file remains the durable checkpoint reference.

## Contract Freeze

Done when:

- `packages/contracts` exports all shared Zod schemas and types.
- Valid fixtures parse successfully.
- Bad fixtures fail, including private action payload fields.
- Prep, runtime, overlay, and extension packages import `@liveseller/contracts`.

Verify:

```bash
npm test -- packages/contracts/test/contracts.test.ts
npm run typecheck
```

## Lane 1: Prep + Catalog Brain

Done when:

- Seed folder produces 3 products, 1 promo, 1 policy pack, citations, assets, missing-field report, and valid `LiveSessionSpec`.
- Price, stock, variants, and promo eligibility remain structured.
- Retrieval evidence does not override structured records.

Verify:

```bash
npm test -- apps/prep/test/prep.test.ts
npm run demo:prep
```

## Lane 2: Live Brain + Policy Runtime

Done when:

- English, Chinese, Malay, and Tamil safe questions produce safe actions.
- Refund, fraud, legal, fake/counterfeit, and discount-negotiation cases never auto-send.
- Chinese host speech emits source and English translated captions.
- Every action includes risk, reason, citations, and approval state.

Verify:

```bash
npm test -- apps/runtime/test/runtime.test.ts
npm run demo:runtime
```

## Lane 3: Commerce Adapter + Demo Surfaces

Done when:

- Overlay renders product, promo, countdown, quantity, and multilingual captions.
- Extension command executor avoids overwriting seller typing.
- Risky actions are not public sends.
- Real Shopee tab proof is recorded in `docs/shopee-ui-audit.md`.

Verify:

```bash
npm test -- apps/overlay/test/overlay.test.tsx
npm test -- apps/extension/test/extension.test.ts
npm run dev:overlay
```

## Final Demo

Done when:

- A two-minute flow shows prep, safe multilingual replies, risky escalation, flash promo overlay, captions, and post-stream summary.
- Any missing real Shopee capability is explicitly labeled as a blocker.
