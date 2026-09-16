# 5-Hour Hackathon Checkpoints

This is the operating plan for the SEAxOpenAI 5-hour build. `main` must stay usable for demo at all times.

## Owner Split

| Owner | GitHub | Scope | Primary Output |
| --- | --- | --- | --- |
| Jiayi | `JodisW` | Chrome extension and Shopee real-tab proof | Extension captures viewer chat, drafts/sends deterministic commands, protects seller typing |
| Swara | `swarangi263` | Realtime and live brain | Server-owned realtime captions/translations, policy-gated actions, audit events |
| Ernest | `erniesg` | Remaining integration | Contracts, prep/catalog, overlay, demo script, GitHub ops, final integration |

## Commit And Push Cadence

- Push at least once per checkpoint, or every 30-45 minutes if still in progress.
- Commit messages should start with the lane: `lane1:`, `lane2:`, `lane3:`, or `integration:`.
- Work on branches from `main`; merge only after relevant checks pass.
- During the final hour, small direct fixes to `main` are allowed only when `npm test`, `npm run typecheck`, and the impacted demo command pass locally.
- Every push should update the related GitHub issue with status, blocker, or proof artifact.

## Checkpoint Timeline

| Time | Checkpoint | Owner(s) | Done Means | Verify |
| --- | --- | --- | --- | --- |
| T+0:15 | Kickoff sync | All | Branches created, issues claimed, owner split understood | GitHub issue comments |
| T+0:45 | Contract freeze confirmed | Ernest | Shared schemas/fixtures stable enough for lane work | `npm test -- packages/contracts/test/contracts.test.ts` |
| T+1:15 | Fake vertical slice | Ernest + Swara | `RuntimeEvent -> LiveAction -> fake adapter -> AuditEvent -> OverlayState` works | `npm test -- apps/runtime/test/runtime.test.ts` |
| T+1:45 | Prep seller-material slice | Ernest | Seller files/docs/folders produce structured identity drafts, products, promo, policy, assets, citations, missing-field report, photo enhancement plans, seller UI policy, and `LiveSessionSpec` | `npm run demo:prep` |
| T+2:15 | Realtime caption slice | Swara | Server-owned realtime path or local realtime stub emits source captions and translations; no browser-side API key | `npm run demo:runtime` plus issue proof |
| T+2:45 | Extension mock slice | Jiayi | Content script helper captures viewer rows; command executor drafts without overwriting seller typing | `npm test -- apps/extension/test/extension.test.ts` |
| T+3:15 | Risk gate checkpoint | Swara + Ernest | refund, fake/counterfeit, legal, fraud, discount cases never auto-send | `npm test -- apps/runtime/test/runtime.test.ts` |
| T+3:45 | Overlay demo slice | Ernest | Product card, promo, countdown, remaining quantity, source captions, translated captions render | `npm test -- apps/overlay/test/overlay.test.tsx`; `npm run dev:overlay` |
| T+4:15 | Real-tab proof or blocker | Jiayi | Real Shopee seller tab proof is recorded, or blocker is explicit with screenshots/selectors still needed | update `docs/shopee-ui-audit.md` |
| T+4:40 | Integrated demo rehearsal | All | Two-minute script runs end to end with known mock/real boundaries | `npm run demo:prep`; `npm run demo:runtime`; overlay open |
| T+5:00 | Final submission | All | Repo green, demo script ready, blockers labeled, summary prepared | GitHub CI green |

## Lane Definitions Of Done

### Jiayi: Chrome Extension

Done by T+2:45:

- Content script can convert a viewer DOM row into `RuntimeEvent.viewer_chat`.
- Command executor rejects unsafe `send_reply` and never overwrites seller typing.
- Extension manifest contains no OpenAI key material.

Done by T+4:15:

- Real Shopee tab evidence is added to `docs/shopee-ui-audit.md`, or the exact blocker is written there.
- Safe reply can be drafted in the real composer, or blocker is clearly labeled.
- Risky runtime actions appear as seller-only alert/draft/approval, never public auto-send.

### Swara: Realtime

Done by T+2:15:

- Runtime owns realtime/session logic; browser/extension/overlay do not hold long-lived OpenAI keys.
- Host transcript/audio path emits `update_caption` and `emit_translation`.
- At least Chinese source caption to English translated caption works in demo or deterministic stub.

Done by T+3:15:

- Policy gate blocks public auto-send for refund, fraud, legal, fake/counterfeit, discount negotiation.
- Every action includes risk, reason, citations, and `requiresApproval`.
- Audit events record input, context, model/action proposal, and tool result.

### Ernest: Remaining Integration

Done by T+1:45:

- Contracts, prep seller-material slice, fake runtime slice, overlay baseline, docs, CI, and issue tracking stay green.

Done by T+4:40:

- Two-minute demo script is executable.
- Overlay clearly distinguishes `Shopee-backed` and `Overlay-only` promos.
- Final README/docs mention real Shopee blockers honestly.
- `main` is green and pushed.

## Integration Rules

- Contract changes go first and must update fixtures/tests.
- If a lane needs a contract change, open or comment on the contracts issue before coding around it.
- Runtime actions are the boundary between Swara and Jiayi. Jiayi should not infer policy; Swara should not rely on unknown Shopee selectors.
- Overlay state is the boundary between runtime and demo surface. Keep it serializable and validated.
- Real Shopee blockers are acceptable for the hackathon only if labeled and backed by evidence in `docs/shopee-ui-audit.md`.

## Final Demo Acceptance

The final demo must show:

- Seller material becomes structured catalog/promo/policy data.
- Host speech produces source and translated captions.
- Safe multilingual viewer questions produce low-risk replies or drafts.
- Risky refund/fake/legal/discount messages escalate or request approval.
- Overlay shows product, promo, countdown, remaining quantity, and multilingual captions.
- Post-stream summary recommends next seller actions.
