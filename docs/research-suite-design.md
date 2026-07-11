# OM Builder — Research Suite (v1) — Design

**Date:** 2026-07-11
**Status:** Approved in brainstorm (wrapper-side agent runs; web search only; briefs + deck integration)
**Prior art:** `docs/design-spec.md` (the original product design). This feature builds on the shipped bundle without modifying the vendored kit.

## Goal

Brokers assembling an OM often don't have all the information — comps, market stats, sometimes basics about the building itself. Today the kit honestly marks those gaps `[TBD]`. The Research Suite lets OM Builder go find the missing information: three on-demand research actions that run web research on the buyer's own Anthropic key, produce sourced briefs the broker can read, and feed their findings into the OM build — with every researched figure cited.

**Hard constraints carried over from v1:**
- The vendored kit stays byte-identical. All integration is prompt composition in the wrapper (which already fills `[PROPERTY]`/`$[X]`).
- BYOK, zero new setup: web search runs on the buyer's existing Anthropic key. No RentCast, no other data keys, no second app.
- The kit's honesty discipline is preserved: no invented numbers; a `[TBD]` is only replaced by a researched figure that carries a source and date.

## The broker experience

A **Research** panel appears in the UI once a property address is entered (new "Property address" field on the build form — optional for plain builds, required to enable research). Three buttons:

1. **Property search** — everything the web knows about the building: sale and listing history, unit mix, owner of record where public, zoning, news mentions of the property.
2. **Comp analysis** — recent comparable sales and rent comps in the submarket: $/unit, $/SF, cap rates where reported, distance from subject. Output is a comp table plus a short narrative.
3. **Market research** — submarket fundamentals (rents, vacancy, demographics, major employers, supply pipeline) plus a **"Last 30 days"** section of recent local news relevant to the submarket.

Each action:
- runs with the same live progress feed builds use (plain-English lines, "show details" toggle),
- ends with a readable brief rendered in the panel and a **sources list** (every URL used),
- shows an honest cost note before running (rough per-action estimate; exact copy set after E2E measurement),
- can be re-run (a re-run replaces that action's brief).

One research action at a time per job; buttons disable while one runs.

## Architecture

### Server (`om-builder/app/server.js`)

New endpoints following the existing job model (per-job folders under `workspace/jobs/<id>/`):

- `POST /api/research` — body `{ jobId, type }` where `type ∈ {property, comps, market}`. Validates the job exists and an address is on file, then starts one Agent SDK `query()` run.
- Progress streams over the existing SSE mechanism (same event shape as builds, tagged with the research type).
- `GET /api/research/<jobId>/<type>` — returns the brief (markdown) and findings (JSON) for display.

The research run is a `query()` call mirroring the build call's options (`cwd: jobDir`, model `claude-opus-4-8`, `permissionMode: "bypassPermissions"`, sealed env) with web search/fetch tools enabled and a per-type prompt template. Guardrails: max-turns cap and a wall-clock timeout per run; a failed or timed-out run marks the action failed in the UI and leaves no partial findings file behind.

### Output contract (what the agent must write)

Each run writes exactly two files into the job folder:

- `research/<type>-brief.md` — the human-readable brief, ending with a `## Sources` section listing every source URL with an as-of date.
- `research/<type>-findings.json` — structured findings: an array of `{ field, value, unit, source_url, as_of, confidence }` where `confidence ∈ {high, medium, low}`.

The prompt templates instruct: never state a figure without a source URL; mark estimates as estimates; if something can't be found, say so in the brief rather than approximating silently.

### Build integration (prompt composition only)

When a build or rebuild starts and `research/` contains findings, the wrapper appends a short instruction block to the kit's fill prompt:

> Research briefs exist in `research/`. Use them to fill gaps the deal documents don't cover. Deal documents always win over researched figures when they conflict. Every researched figure used in the deck must be cited — add a "Sources & Data Notes" endnote slide listing each figure, its source, and its as-of date. Only replace a `[TBD]` with a researched figure of high confidence; otherwise keep the `[TBD]`.

No briefs present → the prompt is unchanged and builds behave exactly as today.

### The TBD loop

After a build completes, the UI already reports the deck's `[TBD]` count. When it's nonzero, offer: *"Your deck has N `[TBD]` spots — run research to try to fill them?"* That runs a fourth, targeted prompt template: the agent opens the built `.pptx` (python-pptx is already vendored in the bundle runtime), lists each `[TBD]` and its slide context, researches just those items, and writes `research/tbd-brief.md` + `research/tbd-findings.json` under the same contract. The UI then offers one-click Rebuild.

## UI (`om-builder/app/public/index.html`)

- New "Property address" input on the build form.
- Research panel: three action cards (name, one-line description, cost note, Run button), progress area reusing the build feed component, brief viewer (rendered markdown) with the sources list, per-action re-run.
- Post-build TBD banner with the research offer and Rebuild button.
- Footer cost copy extended to cover research actions.

Vanilla HTML/CSS/JS like the rest of the file — no framework, no build step.

## Error handling

- Research failure (network, timeout, agent error) → action marked failed with a friendly message; job, uploads, and any prior briefs untouched; retry available.
- Malformed findings JSON → brief still shown; build integration skips that findings file and the UI notes it couldn't be used for the build.
- Budget/key errors from Anthropic surface the same way build errors do today.

## Cost honesty

Each action is one agent run on the buyer's key (web search billed per Anthropic pricing plus tokens). The UI shows a rough per-action estimate before running and reminds that research bills their key. Real numbers measured during E2E; placeholder copy is not shipped.

## Testing

- Unit tests (extend `app/test/server-helpers.test.js` pattern): route validation (bad type, missing address, unknown job), findings-JSON validation, prompt-composition function (with/without briefs, conflict rule present).
- E2E on this Mac with a real key, using the bundled sample deal (`kit/examples/sample-deal/`) plus a real address: run all three actions → verify both output files exist and briefs carry sources; build → verify the deck cites researched figures on a Sources & Data Notes slide; TBD loop → verify targeted pass + rebuild reduces TBD count without inventing numbers.
- Regression: a job with no research briefs builds byte-path-identical to today's flow.

## Out of scope (v1)

- RentCast / OpenProp / any licensed data feed integration (possible v2 as optional keys).
- Kit modifications of any kind (a kit-side `om-research` skill for DIY-guide users is a separate future project).
- Site (`web/`) copy updates for the feature — separate deliverable when this ships to the bundle.
- Template profile manager and build-UX upgrades — the next two feature cycles.

## Risks / notes

- **Web data quality:** comps and market figures from the open web are directional, not a licensed feed. Mitigation is the product's existing soul: citation + as-of date on everything, confidence gating on TBD replacement, deal docs always win.
- **Research runtime:** each action is minutes, not seconds; the live feed and honest expectations copy manage this the same way the 10–25 min build does.
- **Windows:** unchanged risk profile — the feature is pure server.js/index.html/prompts, nothing platform-specific, but Windows remains buyer-beta overall.
