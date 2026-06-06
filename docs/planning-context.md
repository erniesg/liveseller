# Planning Context

## North Star

LiveSeller turns one Shopee Live-style seller into a multilingual live commerce team. It prepares product knowledge before a stream, assists safely during the stream, and produces recommendations afterward.

## Hackathon Goal

For SEAxOpenAI, the project should demonstrate an autonomous and adaptive AI agent that can operate reliably under real-world live-commerce uncertainty while keeping irreversible or risky actions under seller control.

The timeboxed owner/checkpoint plan for the 5-hour build lives in `docs/5-hour-hackathon.md`.

## Team Lanes

- Lane 1: Prep + Catalog Brain
  - Uploads, extraction, structured products/promos/policies, assets, citations, missing-field report, and `LiveSessionSpec`.
- Lane 2: Live Brain + Policy Runtime
  - Server-owned runtime, policy gates, event routing, memory, fake adapters, approvals, audit, captions, translations, recommendations.
- Lane 3: Commerce Adapter + Demo Surfaces
  - Shopee UI audit, Chrome extension, content script, side panel, public overlay, mock stream, real-tab proof.
  - JodisW's extension UI and real-tab context is in `docs/jodisw-ui-context.md`.

## Execution Defaults

- Build contract-first.
- Use structured records for canonical commerce facts.
- Use fake adapters before real Shopee selectors.
- Label real-path blockers clearly instead of hiding them behind mocks.
- Prefer small vertical slices that pass tests over broad incomplete features.
