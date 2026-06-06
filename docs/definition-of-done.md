# Definition Of Done

## Repo-Level Done

A change is done only when:

- all relevant tests pass
- TypeScript typecheck passes
- workspace build passes
- checkpoint docs or tests are updated when behavior changes
- public APIs and schemas are documented when changed
- any real Shopee blocker is recorded in `docs/shopee-ui-audit.md`

## Contract Done

- Zod schema added or updated.
- Type exported from `@liveseller/contracts`.
- At least one valid fixture parses.
- At least one invalid fixture fails for safety-critical constraints.
- Dependent packages compile against the contract.

## Lane 1 Done

- Seed or upload input produces valid products, promos, policy pack, citations, assets, missing-field report, and `LiveSessionSpec`.
- Price, stock, variants, SKU, Shopee IDs, and promo eligibility remain structured.
- Retrieval evidence does not override structured facts.

## Lane 2 Done

- Runtime accepts `RuntimeEvent` and emits valid `LiveAction`, `ToolResult`, `AuditEvent`, and `OverlayState`.
- Safe multilingual questions can produce `send_reply`.
- Refund, fraud, legal, fake/counterfeit, unauthorized discount, and unclear risky cases never auto-send.
- Caption and translated-caption flows are tested.

## Lane 3 Done

- Overlay renders without layout breakage for long English, Chinese, Malay, and Tamil captions.
- Extension command execution is deterministic.
- Seller typing is not overwritten.
- Real Shopee capability is proven with screenshots/selectors/event logs or marked blocked.

## Demo Done

- Two-minute script shows prep, safe replies, risky escalation, promo overlay, captions/translations, and post-stream summary.
- Every mock-only or blocked real-path capability is explicitly labeled.
