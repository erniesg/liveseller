# Codex App-Server Operator

LiveSeller uses Codex app-server as the intended operator-console runtime for multi-round seller review. The app-server layer is different from a plain OpenAI prompt because it gives the product a Codex-native protocol for conversations, authentication state, streamed agent events, approvals, and dynamic tool calls.

## Implemented

- `apps/operator` defines the LiveSeller review tools exposed to Codex app-server:
  - `liveseller_record_seller_review_response`
  - `liveseller_apply_ai_draft_update`
  - `liveseller_run_generation_tasks`
  - `liveseller_record_product_review_decision`
  - `liveseller_build_create_product_commands`
- `buildCodexAppServerReviewTurn` builds the JSON-RPC app-server messages for a seller review turn: `initialize`, `initialized`, `thread/start`, and `turn/start`.
- `executeCodexReviewToolCall` handles Codex-selected tool calls with deterministic LiveSeller domain functions. It can update review rounds, apply AI draft patches, attach generation outputs, record approval/rejection/edit decisions, and build create-product commands only after approval.
- `npm run demo:operator` shows the app-server message shape and deterministic tool execution without starting a live Codex model turn.

## Why Not Just A Prompt

- A prompt-only flow returns text; LiveSeller still has to parse and trust that text.
- The app-server flow lets Codex choose named tools and send structured arguments. LiveSeller validates those arguments against contracts before mutating state.
- A prompt-only flow has no native approval/event stream. App-server exposes approval and tool-call events that an operator console can render and resolve.
- A prompt-only flow can accidentally blur policy and execution. The app-server tool boundary keeps publish commands deterministic and approval-gated.

## Remaining Live Transport Work

- Connect `apps/operator` to a live `codex app-server` process over `stdio://`, `unix://`, or `ws://127.0.0.1:<port>`.
- Listen for `item/tool/call` requests, run `executeCodexReviewToolCall`, and return the tool result content items.
- Render approval prompts and request-user-input events in the operator UI.
- Feed generated review plan artifacts and product image variants back into the seller review screen.
