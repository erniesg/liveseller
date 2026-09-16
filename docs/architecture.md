# Architecture

```text
Seller material files / docs / folders
  -> apps/prep ingests files and extracts structured product identity, ProductRecord, PromoRecord, PolicyPack, assets, citations, photo enhancement plans, seller UI policy, and ProductReviewPlan
  -> server-side prep generation tasks run in parallel where useful, such as image-edit jobs, then update ProductReviewPlan task state
  -> a Codex-native operator console may use codex app-server to host multi-round human review UX and turn free-form seller responses into structured review intents/tool calls
  -> LiveSessionSpec is shared through packages/contracts
  -> apps/runtime receives RuntimeEvent values
  -> ContextEnvelope combines structured facts, policy flags, memory, and citations
  -> LiveAction values are emitted with risk, reason, citations, approval requirement
  -> ProductReviewDecision values gate review-to-publish commands
  -> approved or human-edited review items become deterministic ShopeeCreateProductCommand values
  -> fake or real adapters execute deterministic tools
  -> AuditEvent JSONL records every input, context, action, approval, and result
  -> apps/overlay renders product cards, promos, captions, and translated captions
  -> apps/extension observes the authenticated Shopee seller tab and executes approved commands
```

## Source Of Truth

- Structured records are canonical for price, stock, variants, SKU, Shopee IDs, and promo eligibility.
- Retrieval or file search can cite supporting evidence but cannot override structured fields.
- AI draft updates can polish listing copy, seller guidance, and photo prompts, but cannot patch locked structured fields.
- Seller review rounds always propose options and accept free-form responses so review can continue over multiple rounds.
- Prep smoke scripts record explicit structured seller intents; intelligent free-form interpretation belongs in the Codex-native operator console or server-side agent layer.
- SQLite stores canonical local records; JSONL stores immutable audit events.
- Browser clients and extensions do not store long-lived OpenAI API keys.

## Runtime Safety

- `send_reply` is only for low-risk factual answers.
- `draft_reply` is for answerable but policy-sensitive cases.
- `request_approval` is for seller decisions before public action.
- `escalate` is for fraud, legal, fake/counterfeit, refund abuse, or unclear risky cases.
