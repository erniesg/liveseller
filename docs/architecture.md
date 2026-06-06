# Architecture

```text
Seller uploads / seed folder
  -> apps/prep extracts ProductRecord, PromoRecord, PolicyPack, assets, citations
  -> LiveSessionSpec is shared through packages/contracts
  -> apps/runtime receives RuntimeEvent values
  -> ContextEnvelope combines structured facts, policy flags, memory, and citations
  -> LiveAction values are emitted with risk, reason, citations, approval requirement
  -> fake or real adapters execute deterministic tools
  -> AuditEvent JSONL records every input, context, action, approval, and result
  -> apps/overlay renders product cards, promos, captions, and translated captions
  -> apps/extension observes the authenticated Shopee seller tab and executes approved commands
```

## Source Of Truth

- Structured records are canonical for price, stock, variants, SKU, Shopee IDs, and promo eligibility.
- Retrieval or file search can cite supporting evidence but cannot override structured fields.
- SQLite stores canonical local records; JSONL stores immutable audit events.
- Browser clients and extensions do not store long-lived OpenAI API keys.

## Runtime Safety

- `send_reply` is only for low-risk factual answers.
- `draft_reply` is for answerable but policy-sensitive cases.
- `request_approval` is for seller decisions before public action.
- `escalate` is for fraud, legal, fake/counterfeit, refund abuse, or unclear risky cases.
