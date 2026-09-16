# Contract Reference

The contract source of truth is `packages/contracts/src/schemas.ts`.

## Frozen Shared Types

- `ProductRecord`
- `PromoRecord`
- `PolicyPack`
- `LiveSessionSpec`
- `RuntimeEvent`
- `ContextEnvelope`
- `LiveAction`
- `ToolResult`
- `ApprovalRequest`
- `ProductIdentityDraft`
- `SellerGuidance`
- `ImageGenerationPlan`
- `SellerUiPolicy`
- `ProductReviewPlan`
- `SellerReviewRound`
- `SellerFreeFormReviewResponse`
- `PrepGenerationTask`
- `AiDraftUpdate`
- `ShopeeCreateProductCommand`
- `AuditEvent`
- `OverlayState`
- `ViewerMemory`
- `SessionMemory`

## Contract Rules

- All lane boundary payloads must parse through Zod.
- Extra/private fields are rejected by strict schemas.
- `LiveAction.type` must match `LiveAction.payload.kind`.
- `send_reply` must be low-risk and require no approval.
- Every action includes risk, reason, citations, approval state, and payload.
- `AiDraftUpdate` can only patch draft copy, seller guidance, and photo prompts; locked structured fields such as SKU, price, stock, variants, Shopee IDs, and promo eligibility are not accepted in the patch.
- `SellerReviewRound` must include proposed options and free-form responses are valid first-class payloads for multi-round review.
- `PrepGenerationTask` records async prep work, including server-side image-edit tasks, so the plan can wait for parallel outputs before publishing.
- `ShopeeCreateProductCommand` is valid only for product review decisions with `approved` or `edited` status.
- Product review plans keep human decision state per product: `pending`, `approved`, `rejected`, or `edited`.

## Fixture Rules

- Valid fixtures live in `packages/contracts/src/fixtures.ts`.
- Bad fixtures must cover safety-relevant failure modes.
- Lane tests should use shared fixtures unless a lane-specific fixture is necessary.
- Seller drop-folder fixtures for the vintage jewelry demo are exported from `packages/contracts/src/fixtures.ts` as shared products, session spec, promo, policy pack, and session memory.
