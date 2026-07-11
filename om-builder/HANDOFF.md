# OM Builder — Collaborator Handoff

**What this is:** a sellable product + public marketing pages, built and verified 2026-07-10. Buyers drop CRE deal documents into a local web app and get back an institutional-grade offering memorandum (editable `.pptx`), built by Claude on their own Anthropic API key. Nothing leaves their machine except calls to Anthropic.

## The two halves

| Half | Where | Status |
|---|---|---|
| **Public pages** — fintok.news/projects + /projects/om-builder (free DIY guide + pay-what-you-want CTA) | `web/` in THIS repo (static export; the fintok frontend serves the built files verbatim) | LIVE and verified on production |
| **The product** — downloadable bundle (local web app + vendored kit + Node/Python runtimes, zero installs for the buyer) | `om-builder/` in THIS repo (source); build zips with `bash build.sh` (macOS) | Built, security-reviewed, E2E-proven |

## Proof it works (real end-to-end)

A real deal was run through the exact buyer flow: two large broker OMs in (19 MB + 5 MB PDFs), freeform prompt "make the Covina deal in the MM Ontario template style," and a **31-slide OM came out** — style transferred, deal's own branding kept, every recomputed number internally consistent, honest `[TBD]` markers where data was absent, real map tiles, 21 sale comps matching the comp map. Four text-overlap defects were found by review; the kit's own Verify pass + one targeted fix instruction cleared all four. Finished deck: `Studio Garden Apartments OM.pptx` (Darryl has it — not in git; it contains a real broker's deal data).

## Launch checklist (what's actually left)

1. **Gumroad** — the entire payment system; nothing to build. Create a product at slug `om-builder` on the fintok Gumroad account, price **$0+** (pay-what-you-want), attach the two zips (rebuild via `cd om-builder && bash build.sh` on a Mac — output lands in `om-builder/dist/`), publish. The live site's buttons already point at `https://fintok.gumroad.com/l/om-builder`. Alternative: paste a hosted download link into the product instead of uploading files (Gumroad supports both; uploads are better — buyers get library updates).
2. **DNS** — bare `fintok.news` 404s on deep paths (old registrar URL-forwarder). At the DNS provider: point `fintok.news` → CNAME/ALIAS `sedkxujb.up.railway.app`. Railway side is already configured. `www.` works fine today.
3. **Pricing copy (optional)** — the site says builds bill "$2–8"; real-world: simple builds $2–8, template-clone jobs on big decks **$15–25** (a saved template profile roughly halves repeat cost). Update `web/src/components/OmBuilderPage.tsx` + the bundle UI footer if you want the honest range. Note: after changing `web/`, run `npm run build` and hand the `web/out/` folder to whoever maintains the fintok frontend (it serves those files from its `public/projects/`).

## How to test the product locally (10 minutes)

1. Build the zips (`cd om-builder && bash build.sh`) or get `OM-Builder-Mac.zip` from Darryl; unzip anywhere.
2. Double-click `Start OM Builder.command` (first time: right-click → Open — it's unsigned).
3. The browser opens; paste an Anthropic API key (console.anthropic.com → API keys) into the panel.
4. Drop deal docs, optionally type instructions, **Build my OM** (~10–25 min, bills the key), download.
   A tiny sanitized sample deal ships inside at `kit/examples/sample-deal/`.

## Research Suite (added 2026-07-11, branch research-suite)

Three research options (Property search / Comp analysis / Market research) plus a TBD-fill loop, all wrapper-side — the vendored kit is still byte-identical. Web research runs on the buyer's own key via the Agent SDK's web search; no new API keys, no new dependencies.

**v2 UX (2026-07-11, Ben's feedback):** no address field — every research prompt identifies the subject property from the deal documents itself. The Run buttons are gone: research is now **checkboxes** whose ticked types ride the build request (`research: ["property", ...]`) and run as pipeline phases before the deck phase (a failed research phase aborts the build). The upload zone split in two: a **template** drop (files land in the job's `template/` subfolder and trigger a template-style bridge in the build prompt) and a **deal documents** drop. `POST /api/research` remains for the post-build TBD hunt only.

- **Contract:** each run writes `research/<type>-brief.md` (sourced brief, `## Sources` section) + `research/<type>-findings.json` (array of `{field, value, unit, source_url, as_of, confidence}`) into the job dir. Types: `property | comps | market | tbd`.
- **Build integration:** when any `*-findings.json` exists, the build prompt gains a bridge block — deal docs beat research, every researched figure cited on a final "Sources & Data Notes" slide, `[TBD]` only replaced by high-confidence findings. No findings → prompt byte-identical to before.
- **Guardrails:** `maxTurns 150`, 20-min abort timer per research run; a failed run deletes only a *malformed* findings file. Real per-run cost (`total_cost_usd` from the SDK result) is shown in the feed.
- **E2E-proven** (845 S Kenmore Ave, 2026-07-11): 24/30/27 sourced findings across the three runs ($1.20/$1.10/$1.22), 15-slide OM out with Sources & Data Notes slide ($7.85), TBD hunt found APN + zoning + retrofit status at high confidence and honestly left unknowable contact blocks as `[TBD]` ($2.00), rebuild consumed the findings. Conflict rule observed working: research found the old Coldwell listing, deck kept the deal docs' Marcus & Millichap branding.
- **Docs trail:** `docs/research-suite-design.md` (spec) + `docs/research-suite-plan.md` (plan); 22 unit tests in `app/test/server-helpers.test.js`.

## Facts you'll want

- **Model:** hardcoded `claude-fable-5` (Ben's call, 2026-07-11 — previously `claude-opus-4-8`). Everything is BYOK — no server, no accounts, no billing infra on our side. Fable caveats for buyers: ~2x Opus per-token pricing, the buyer's Anthropic org must allow 30-day data retention (zero-data-retention orgs get a 400 on every request), and safety classifiers can occasionally refuse a run (surfaces as a normal error; retry or rephrase). If those bite real buyers, dropping back to `claude-opus-4-8` is a one-line change in `agentOptions()`. Fable costs: one research run measured live at $2.54 (same run was $1.20 on Opus — the expected ~2x); builds estimated at $20–30/OM (Ben's estimate off the $7.85 Opus-measured build — no full Fable build has been measured yet). The E2E figures in the Research Suite section above were all measured on Opus 4.8, pre-switch.
- **Architecture:** `app/server.js` (stdlib Node, binds 127.0.0.1 only) drives the Claude Agent SDK inside a per-job folder; skills live in `workspace/.claude/skills/` (the 3 kit skills + Anthropic's pptx/docx/pdf document skills, all vendored). The agent's environment is sealed — it cannot see the buyer's MCP servers or Claude config (proven by reproduction test).
- **Security posture:** filename sanitization everywhere, download-route hardening, strict key validation (`sk-ant-` charset), JSON-only POSTs (CSRF guard), key never logged. All from adversarial review with reproduced exploits, then re-verified fixed.
- **Rebuilding zips:** `cd om-builder && bash build.sh` (macOS; downloads are cached in `downloads/`). Pins: Node v20.18.1, CPython 3.12.8, kit commit + SDK version recorded in each zip's `bundle-manifest.txt`.
- **Known limits:** Windows zip is build-verified but never run on real Windows (treat first Windows buyer as beta). The DIY guide's "build it yourself" prompts (steps 03/04/07 on the site) are derived from the real code but haven't been dry-run by a fresh reader. Binaries are unsigned (Gatekeeper/SmartScreen one-time warnings — the buyer README covers it with exact steps).
- **License:** the underlying kit is PolyForm Noncommercial 1.0.0 (source-available; buyer README credits it).

## Never commit / never ship

- `PUT-YOUR-KEY-HERE.env` with a real key in it (the `e2e/` test folder on Darryl's machine contains his key — it is gitignored; keep it that way).
- The real deal PDFs / the finished Covina deck (confidential broker material; deliberately not in git).

## Repo docs trail

Design spec and implementation plan: `docs/` in this repo.
