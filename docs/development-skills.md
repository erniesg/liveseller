# Development Skills

These are the relevant development workflows for this repo. They are written as repo-local practice so contributors can follow them even outside Codex.

## Use Before Coding

- Read `AGENTS.md`.
- Run `git status --short --branch`.
- If the tree is clean, run `git fetch --all --prune` and `git pull --ff-only` before starting or resuming work.
- If the tree is dirty, do not pull or rebase until the local changes are understood, committed, or explicitly handed off.
- Identify the lane and checkpoint.
- State the target definition of done.
- Inspect existing contracts and fixtures before changing behavior.

## Collaboration Loop

- Keep work sliced into small, reviewable commits.
- Commit after a meaningful verified change: passing relevant checks, updated tests/docs, and no unrelated files staged.
- Push immediately after each successful commit on a shared branch.
- Use `git pull --ff-only` at clean task boundaries so local work never silently rewrites teammate history.
- If Git reports divergence or conflicts, stop and document the branch, files, and failed command before making history-changing moves.

## Recommended Superpower-Style Workflows

- Planning: use for unclear scope, contract changes, or cross-lane work.
- Test-driven development: use for policy gates, schema changes, runtime routing, and extension command safety.
- Systematic debugging: use when tests or live adapter behavior fail.
- Verification before completion: use before declaring a checkpoint done.
- Finishing a development branch: use before merging or opening a PR.

## Required Verification Commands

```bash
npm test
npm run typecheck
npm run build
```

## Lane-Specific Checks

```bash
npm run demo:prep
npm run demo:runtime
npm run dev:overlay
```

## Reviewer Checklist

- Does the PR keep structured commerce facts canonical?
- Does it preserve the no-auto-send rules for risky topics?
- Does it avoid browser-side long-lived OpenAI keys?
- Does it update fixtures/tests when contracts change?
- Does it clearly label mock-only behavior and real Shopee blockers?
