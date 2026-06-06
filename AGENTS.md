# LiveSeller Agent Guidelines

These project rules adapt the Karpathy-style guidance from `multica-ai/andrej-karpathy-skills` for this Shopee Live commerce copilot.

## Engineering Rules

- Think before coding: state assumptions, surface unclear scope, and ask only when repo inspection cannot answer it.
- Simplicity first: build the smallest version that satisfies the active checkpoint; do not add speculative abstractions.
- Surgical changes: touch only files required for the assigned lane or checkpoint; do not refactor unrelated work.
- Goal-driven execution: every task must define "done" plus verification commands before implementation.
- Verification rule: no checkpoint is done without tests, fixture evidence, or a recorded manual proof.

## Collaboration And Git Rules

- Before starting or resuming a task, inspect the branch and working tree with `git status --short --branch`.
- Pull remote changes at task boundaries when the working tree is clean: run `git fetch --all --prune`, then `git pull --ff-only`.
- If the working tree is dirty, do not pull, rebase, reset, or overwrite files. First understand whether the changes are yours, a teammate's, or generated output; commit verified work or report the blocker.
- Commit after each meaningful verified slice, not only at the end of a long session. A meaningful slice has passing relevant checks, updated docs/tests when behavior changed, and a clear commit message.
- Push immediately after each successful commit on a shared branch so teammates and later agent sessions can pick up the latest state.
- If a pull or push fails because of divergence or conflicts, stop and report the exact branch/files involved. Do not force-push, rewrite history, or discard changes without explicit human approval.
- Stage only files that belong to the active task; never silently include unrelated local changes.

## Product Safety Rules

- Browser clients, extensions, content scripts, and overlay pages must never store long-lived OpenAI API keys.
- Shopee real-path automation uses the seller's authenticated Chrome tab plus extension/content script, not Playwright as the critical path.
- Fraud, legal, refund commitments, fake-product accusations, unauthorized discounts, and unclear risky cases must never auto-send.
- Price, stock, variants, SKU, Shopee IDs, and promo eligibility come from structured records, not vector search.
- Every live action records input, context, risk, reason, citations, approval state, and tool result.

## Lane Boundaries

- `packages/contracts` owns shared schemas, fixtures, storage contracts, and type exports.
- `apps/prep` owns seller material file/doc/folder ingestion into structured product identity, catalog, promo, policy, assets, photo enhancement plans, seller UI policy, and `LiveSessionSpec`.
- `apps/runtime` owns policy, event routing, fake adapters, approvals, audit, captions, translations, and summaries.
- `apps/overlay` owns public livestream overlay rendering.
- `apps/extension` owns authenticated seller-tab observation and deterministic command execution.
