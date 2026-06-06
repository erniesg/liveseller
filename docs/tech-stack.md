# Tech Stack And Architecture Decisions

## Language And Monorepo

- TypeScript is the implementation language for all packages.
- npm workspaces manage `packages/*` and `apps/*`.
- Zod defines runtime-validated contracts and TypeScript types.
- Vitest is the test runner.
- Vite + React power the public overlay app.

## Packages

- `packages/contracts`
  - Shared schemas, fixtures, storage contracts, and type exports.
- `apps/prep`
  - Deterministic seller-material ingestion into structured product identity, catalog, promo, policy, assets, photo enhancement plans, seller UI policy, and `LiveSessionSpec`.
- `apps/runtime`
  - Server-owned runtime, policy gates, fake adapters, overlay state, audit events, summaries, local API.
- `apps/overlay`
  - Public livestream overlay.
- `apps/extension`
  - Chrome extension skeleton for authenticated Shopee seller-tab observation and deterministic command execution.

## Storage Decisions

- SQLite is the canonical local store for products, promos, sessions, approvals, commands, and memory.
- JSONL is the immutable audit format.
- Vector/file search may support evidence retrieval but must not override canonical commerce fields.

## Agent And Automation Decisions

- Backend/runtime owns OpenAI Realtime/session negotiation and model calls.
- Browser clients, overlays, extensions, and content scripts do not store long-lived OpenAI API keys.
- Real Shopee operation uses the seller's authenticated Chrome tab through extension/content script.
- Playwright is not the critical path for real Shopee operation.
- Fake adapters are used for deterministic local tests and hackathon demos before real selector proof.

## Risk Decisions

- `send_reply` is only for low-risk factual answers.
- `draft_reply` is for answerable but policy-sensitive cases.
- `request_approval` is for seller decisions before public action.
- `escalate` is for fraud, legal, refund abuse, fake/counterfeit accusations, unauthorized discounts, or unclear risky cases.
- Overlay promos must state whether they are `Shopee-backed` or `Overlay-only`.
