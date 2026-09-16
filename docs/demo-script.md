# Hackathon Demo Script

Source deck reviewed: `[EXT] 2026 Sea x OpenAI Codex Hackathon - Briefing Materials`.

## Deck Review

The presentation format is 6 minutes for demo/pitch and 2 minutes for Q&A. Judges are asked to score the working product against:

- Problem and solution fit.
- Build quality under use.
- Insight and originality.
- Real-world value.
- Alignment with at least one build direction.
- Depth of Codex usage.

Relevant build directions for LiveSeller:

- Autonomous and Adaptive AI: low-risk live actions can run without constant seller oversight, while risky cases are gated.
- AI-Native Products and Operations: live-commerce operations are redesigned around structured seller data, policy checks, multilingual captions, overlays, and audit events.
- Deep Domain AI: price, stock, SKU, promo, and safety commitments come from structured commerce records instead of generic retrieval.

Demo implications:

- Lead with the live seller problem, then show working commands quickly.
- Make the safety boundary explicit: refund, fraud, legal, fake/counterfeit, unauthorized discount, and unclear risky cases do not auto-send.
- State the real Shopee status honestly: local extension command safety is implemented, but authenticated Shopee selector proof is still blocked pending `docs/shopee-ui-audit.md`.
- Mention Codex as part of the build process and evidence: lane planning, contracts, tests, demo docs, and isolated worktree execution.

## Pre-Demo Setup

Use three terminals.

Terminal 1:

```bash
npm run demo:prep
```

Terminal 2:

```bash
npm run demo:runtime
```

Terminal 3:

```bash
npm run dev:overlay
```

Optional proof commands if judges ask for build quality:

```bash
npm test
npm run typecheck
npm run build
npm test -- apps/runtime/test/runtime.test.ts
npm test -- apps/extension/test/extension.test.ts
```

## 6-Minute Script

### 0:00-0:35 Opening

Say:

> We built LiveSeller, a Shopee Live commerce copilot for sellers who are trying to host, answer chat, manage promos, and avoid risky commitments at the same time.
>
> The product idea is not "AI writes chat replies." The idea is a live-commerce control loop: seller material becomes structured catalog, promo, and policy data; the runtime decides what is safe; overlays keep the stream useful; and every action is audited.

Point to the build directions:

- Autonomous and Adaptive AI: it can auto-send only low-risk factual answers.
- AI-Native Operations: it changes how a live stream is run, from upload prep to post-stream summary.
- Deep Domain AI: commerce facts come from structured records, not guessed text.

### 0:35-1:25 Prep: Seller Uploads Become Structured Live Data

Run or show Terminal 1:

```bash
npm run demo:prep
```

Call out:

- `live-seed-001` is built from the seed folder.
- The pipeline extracts 3 products, 1 promo, 1 policy pack, citations, assets, and a `LiveSessionSpec`.
- Product facts are structured: SKUs, prices, stock, currency, and promo metadata.
- The missing-field report marks `shopeeProductId` as missing, so the system knows the marketplace readiness still needs seller review.

Say:

> This is the first safety layer. Price and stock are not coming from vector search or a language model guess. They come from structured records, and missing marketplace IDs are visible instead of hidden.

### 1:25-2:30 Runtime: Safe Multilingual Live Actions

Run or show Terminal 2:

```bash
npm run demo:runtime
```

Call out:

- Low-risk factual viewer questions produce `send_reply`.
- The runtime records product interest through `record_memory`.
- Chinese host speech produces a source caption and an English translation.
- The overlay state includes product card, stock, promo banner, caption, translated caption, audio mix, and layout warnings.
- The post-stream summary recommends seller actions.

Say:

> For a normal product question, the system can answer immediately because the context envelope contains structured price and stock facts. For host speech, it updates captions and translations without putting API keys in the browser client or extension.

If judges ask about language coverage, use:

```bash
npm test -- apps/runtime/test/runtime.test.ts
```

Point out that the test covers safe factual replies in English, Chinese, Malay, and Tamil.

### 2:30-3:35 Risk Gates: What It Refuses To Auto-Send

Stay on the runtime test or describe the covered cases:

```bash
npm test -- apps/runtime/test/runtime.test.ts
```

Call out:

- Refund demand.
- Fake or counterfeit accusation.
- Legal threat.
- Scam or fraud claim.
- Extra discount or "best price" negotiation.

Say:

> These cases never become public `send_reply` actions. The runtime emits `draft_reply`, `request_approval`, or `escalate`, and every action carries risk, reason, citations, approval state, and tool results.
>
> That matters because the cost of a wrong live-commerce answer is not just a bad chatbot response. It can create a refund promise, legal exposure, brand damage, or an unauthorized discount.

### 3:35-4:35 Overlay: Seller-Controlled Stream Surface

Run or show Terminal 3:

```bash
npm run dev:overlay
```

Open the Vite URL and point to:

- Product title, price, stock, and image.
- Live flash promo banner.
- Remaining quantity and countdown.
- Chinese source caption.
- English translated caption.

Say:

> The overlay is a seller-owned stream surface. It can show helpful live context without pretending every promo is already Shopee-backed. In the data model, this promo is marked `overlay_only`, which prevents us from promising marketplace eligibility before it has been verified.

### 4:35-5:20 Extension And Real Shopee Boundary

Run or show:

```bash
npm test -- apps/extension/test/extension.test.ts
```

Call out:

- The extension command executor does not overwrite seller typing.
- Public send is allowed only for low-risk actions with no approval required.
- Risky actions are seller-only drafts, alerts, or approval requests.
- The manifest is checked to keep OpenAI key material out of the extension.
- Real Shopee seller-tab selector proof is documented as blocked in `docs/shopee-ui-audit.md`.

Say:

> The real path is the authenticated seller's Chrome tab plus extension/content script, not Playwright as the critical path. We have the deterministic command safety in place, but we are not claiming real Shopee automation until the selector audit is recorded.

### 5:20-5:50 Post-Stream Summary And Value

Return to the `demo:runtime` JSON summary.

Call out:

- Total events.
- Public replies.
- Approvals and escalations.
- Recommendations, including which product to lead with and which promos need verification.

Say:

> The seller gets value during the stream and after the stream. During the stream, safe questions are handled faster and risky ones are contained. After the stream, the audit trail and summary tell the seller what to improve for the next session.

### 5:50-6:00 Close

Say:

> LiveSeller is a safe live-commerce copilot: structured prep, policy-gated runtime, multilingual overlay, authenticated-tab execution path, and auditability. The demo shows the working local slice, and the next milestone is the real Shopee UI audit before enabling real sends.

## 2-Minute Q&A Prep

Likely question: What is real versus mocked?

Answer:

> Prep, contracts, runtime policy, overlay, tests, summaries, and extension command safety are implemented locally. Real Shopee selector evidence is not claimed yet; it is explicitly blocked in `docs/shopee-ui-audit.md`.

Likely question: Why not just use vector search over seller notes?

Answer:

> Price, stock, variants, SKU, Shopee IDs, and promo eligibility need structured records. Retrieval can provide citations, but it cannot override canonical commerce fields.

Likely question: How does the system avoid unsafe auto-send?

Answer:

> `send_reply` is restricted to low-risk factual answers. Refund, fraud, legal, fake/counterfeit, unauthorized discount, and unclear risky cases require approval or escalation. Tests cover these cases.

Likely question: Where does Codex matter?

Answer:

> Codex was used as the build partner across lane planning, contract/test creation, runtime and overlay implementation, safety docs, and this isolated demo-script worktree. The repo keeps that visible through tests, checkpoint docs, and explicit definitions of done.

Likely question: What would make this production-ready?

Answer:

> The next steps are authenticated Shopee UI selector proof, real adapter hardening, durable audit storage, seller approval UI, and production monitoring. The current build intentionally keeps real sends blocked until that proof exists.

## Fallback Plan

If the overlay dev server is slow:

- Use `npm run demo:runtime` and point to the `overlayState` JSON.
- Show `apps/overlay/src/App.tsx` for the rendered surfaces.
- Show `npm test -- apps/overlay/test/overlay.test.tsx` for rendering proof.

If a judge wants proof of repo health:

- Show `npm test`, `npm run typecheck`, and `npm run build`.

If a judge challenges real Shopee automation:

- Open `docs/shopee-ui-audit.md`.
- Say the capability is intentionally blocked until authenticated seller-tab proof is recorded.
