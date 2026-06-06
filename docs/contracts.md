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

## Fixture Rules

- Valid fixtures live in `packages/contracts/src/fixtures.ts`.
- Bad fixtures must cover safety-relevant failure modes.
- Lane tests should use shared fixtures unless a lane-specific fixture is necessary.
- Seller drop-folder fixtures for the vintage jewelry demo are exported from `packages/contracts/src/fixtures.ts` as shared products, session spec, promo, policy pack, and session memory.
