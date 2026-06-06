# Contributing

LiveSeller uses checkpoint-driven development so three people can build in parallel without breaking shared contracts.

## Branches

- `main` is the stable integration branch.
- Feature branches should use `codex/<short-description>` or `<owner>/<short-description>`.
- Keep each PR scoped to one lane, one checkpoint, or one contract change.

## Before Opening A PR

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

For UI changes, also run:

```bash
npm run dev:overlay
```

## Contract Changes

Contract changes must land before dependent lane work. If a PR changes `packages/contracts`, include:

- fixture updates
- schema tests for valid and invalid payloads
- impact notes for prep, runtime, overlay, and extension lanes

## Safety Review

Any PR touching runtime actions, extension commands, approvals, or Shopee automation must explicitly prove:

- no browser client stores long-lived OpenAI API keys
- risky messages cannot become public `send_reply`
- seller typing is not overwritten
- every action carries risk, reason, citations, and approval state
