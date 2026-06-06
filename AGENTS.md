# LiveSeller Agent Guidelines

These project rules adapt the Karpathy-style guidance from `multica-ai/andrej-karpathy-skills` for this Shopee Live commerce copilot.

## Engineering Rules

- Think before coding: state assumptions, surface unclear scope, and ask only when repo inspection cannot answer it.
- Simplicity first: build the smallest version that satisfies the active checkpoint; do not add speculative abstractions.
- Surgical changes: touch only files required for the assigned lane or checkpoint; do not refactor unrelated work.
- Goal-driven execution: every task must define "done" plus verification commands before implementation.
- Verification rule: no checkpoint is done without tests, fixture evidence, or a recorded manual proof.

## Product Safety Rules

- Browser clients, extensions, content scripts, and overlay pages must never store long-lived OpenAI API keys.
- Shopee real-path automation uses the seller's authenticated Chrome tab plus extension/content script, not Playwright as the critical path.
- Fraud, legal, refund commitments, fake-product accusations, unauthorized discounts, and unclear risky cases must never auto-send.
- Price, stock, variants, SKU, Shopee IDs, and promo eligibility come from structured records, not vector search.
- Every live action records input, context, risk, reason, citations, approval state, and tool result.

## Lane Boundaries

- `packages/contracts` owns shared schemas, fixtures, storage contracts, and type exports.
- `apps/prep` owns upload/seed-folder extraction into structured catalog, promo, policy, assets, and `LiveSessionSpec`.
- `apps/runtime` owns policy, event routing, fake adapters, approvals, audit, captions, translations, and summaries.
- `apps/overlay` owns public livestream overlay rendering.
- `apps/extension` owns authenticated seller-tab observation and deterministic command execution.
