# /projects + OM Builder — Design

**Date:** 2026-07-10
**Status:** Approved in brainstorm (BYOK localhost wrapper chosen; fourthspaceOS as design template)

## Goal

Two deliverables:

1. **`fintok.news/projects`** — a public (no access key) section of the fintok frontend hosting "projects." First project: **OM Builder** (github.com/benfan87/fintok-om-builder). The project page presents two paths side by side:
   - **Build it yourself** — a substantial, intentionally thorough step-by-step guide (fourthspaceOS design language) to install and run the workflow via Claude Code on your own subscription.
   - **Get it prebuilt** — a Gumroad pay-what-you-want ($0+) download of a ready-made bundle.
2. **The Gumroad bundle** — the unmodified fintok-om-builder kit wrapped in a dead-simple BYOK localhost web app for non-technical buyers: edit ONE line in ONE file (their Anthropic API key), double-click ONE launcher, use a browser UI to drop deal docs in and download a finished `.pptx` OM.

**Audience for the bundle:** completely non-technical. Assume nothing is installed (no Node, no Python, no git, no dev tools). Everything ships inside the zip.

**Hard constraint:** the kit's workflow (skills, prompts, Analyze→Fill→Verify pipeline, [TBD] discipline) is not modified in any way. The wrapper only drives it.

## Part A — fintok.news/projects

### Access

- Add `"/projects"` to `PUBLIC_PREFIXES` in `frontend/src/middleware.ts`. The whole `/projects` subtree is public.
- Pages are fully static (no backend/API fetches) → no SSR-timeout risk, no egress, nothing gated can leak. The waitlist rule is respected: /projects shows project marketing + guide content, never intelligence content.

### Routes

- **`/projects`** — index. Editorial hero ("Projects") + card list of projects, driven by a local const array so future projects are one entry. One card now: OM Builder.
- **`/projects/om-builder`** — the project page. Layout:
  - Hero: what OM Builder is (institutional-grade OMs from your own deal docs, on your machine, data never leaves your computer).
  - **Two-path split** (side-by-side on desktop, stacked on mobile):
    - Path 1 "Build it yourself — free": the full guide (below).
    - Path 2 "Get it prebuilt — pay what you want": bundle description + Gumroad CTA button.
  - The guide: fourthspaceOS-style numbered steps **01–06** (install Claude Code → get the kit → install the three skills → Analyze a template → Fill your deal → Verify), with:
    - roman-numeral substeps (i, ii, iii)
    - copy-to-clipboard blocks containing the kit's actual prompts (`prompts/1-analyze.md`, `2-fill.md`, `3-verify.md`) and install commands from INSTALL.md
    - "why this matters" callouts, the [TBD] discipline explainer, and the kit's honest-limits section
    - breadcrumb step chips ([01] › [02] › …) and back-to-step anchors
  - Links to the GitHub repo throughout.

### Design language

fourthspaceOS is the **template**, not the brand: dark editorial theme, large display headline with italic word-accents, progressive section downsizing, monospace prompt boxes with "Copy prompt" buttons, high-contrast minimal palette. FinTok branding only — the fourthspaceOS logo/name is never used. References studied: fourthspaceos.com/prompts/day-01 and day-09.

Full mandatory visual stack applies at implementation (frontend-design skill, Visual Companion mockups before JSX, ≥3 iterations, visual-review subagent, desktop 1280×800 + mobile 375×812 eyes-on screenshots).

### Gumroad linkage

- CTA points at `https://fintok.gumroad.com/l/om-builder` (placeholder). The operator creates the pay-what-you-want product ($0+) and uploads the bundle zips; the link is then confirmed/swapped. I cannot create Gumroad products.

## Part B — the prebuilt bundle (BYOK localhost app)

### What the buyer experiences

1. Download `OM-Builder-Mac.zip` or `OM-Builder-Windows.zip` from Gumroad. Unzip.
2. Open `PUT-YOUR-KEY-HERE.env` (a plain text file) and paste their Anthropic API key on the one line: `ANTHROPIC_API_KEY=sk-ant-...` (README shows exactly where to get a key, with pictures).
3. Double-click `Start OM Builder.command` (Mac) / `Start OM Builder.bat` (Windows). Browser opens to `http://localhost:3131` automatically.
4. In the browser: drag deal docs in (rent roll, model, comps, photos, PDFs) → type property name + asking price → click **Build my OM** → watch a live progress feed → click **Download your OM (.pptx)** → optionally click **Verify it** (runs the kit's audit prompt).

First-run OS friction is documented with screenshots in the buyer README and on the /projects page: macOS Gatekeeper (right-click → Open the first time), Windows SmartScreen (More info → Run anyway).

### Bundle contents (per-platform zip)

```
OM-Builder/
├── Start OM Builder.command / .bat     ← the one thing to run
├── PUT-YOUR-KEY-HERE.env               ← the one line to edit
├── README.pdf / README.html            ← 3 steps, with pictures
├── kit/                                ← fintok-om-builder, byte-identical vendored copy (pinned commit)
├── app/
│   ├── server.js                       ← Node stdlib http server + Claude Agent SDK driver
│   ├── public/index.html               ← the whole UI (vanilla HTML/CSS/JS, no framework)
│   ├── node_modules/                   ← pre-installed (includes @anthropic-ai/claude-agent-sdk)
│   └── package.json
├── runtime/
│   ├── node/                           ← portable Node ≥18 (mac zip: arm64 + x64, launcher picks by uname -m; win zip: x64)
│   └── python/                         ← portable CPython (python-build-standalone) with site-packages pre-installed:
│                                          staticmap, pillow, python-pptx, python-docx, pypdf + deps of the vendored document skills
└── workspace/
    └── .claude/skills/                 ← the kit's 3 skills + vendored Anthropic document skills (pptx, docx, pdf)
```

- **No downloads at first run, no installs, no admin rights.** The launcher only: reads the `.env`, validates the key looks like `sk-ant-` (friendly message if not), prepends `runtime/node` + `runtime/python` to `PATH`, starts `server.js`, opens the browser. Everything else is pre-baked by the build script.
- The kit is vendored unmodified. `workspace/.claude/skills/` holds copies of `kit/skills/*` plus the Anthropic public `pptx`/`docx`/`pdf` skills (which `doc-from-template/SKILL.md` depends on), so the agent finds them as project-scope skills.

### The driver (server.js)

- Node stdlib `http` on port 3131 (fallback next free port). Endpoints: upload files (into a per-job folder under `workspace/jobs/<id>/`), start build, SSE progress stream, download output, run verify. No framework, no DB.
- Drives the workflow with the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), confirmed API shape:

```js
query({
  prompt: fillPrompt,            // kit's prompts/2-fill.md with [PROPERTY]/[PROFILE]/$[X] filled from the form; PROFILE defaults to garden-om
  options: {
    cwd: jobDir,                                       // per-job folder inside workspace/
    model: "claude-opus-4-8",
    settingSources: ["project"],                       // picks up workspace .claude/skills
    skills: "all",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,             // headless; no one to approve prompts
    env: { ...process.env, ANTHROPIC_API_KEY: keyFromEnvFile, PATH: pathWithBundledRuntimes },
  },
})
```

- Streamed assistant messages → translated into plain-English progress lines on the UI ("Reading your rent roll…", "Drawing the location map…"). Raw tool spam is hidden; a "show details" toggle reveals it.
- **Verify** = second `query()` in the same job dir with the kit's `3-verify.md` prompt.
- Outputs: the kit writes the `.pptx` into `cwd` (its documented behavior); server lists `*.pptx` in the job dir for download. `[TBD]` markers are surfaced honestly in the UI ("Your deck has N [TBD] spots — the tool refuses to invent numbers; add the missing info and rebuild").
- Cost honesty: UI footer notes each build bills their Anthropic API key (rough $2–8 per OM at Opus rates).
- Security posture: server binds `127.0.0.1` only; agent is scoped to the job dir via `cwd`; key is read from the local `.env` and never leaves the machine except to Anthropic.

### Where the bundle source lives

`projects/om-builder/` in the fintok repo (new top-level dir; not part of frontend/backend build contexts, so Railway/CI untouched):

- `projects/om-builder/app/` — server.js, index.html, package.json, launchers, README source
- `projects/om-builder/build.sh` — produces `OM-Builder-Mac.zip` + `OM-Builder-Windows.zip`: clones the pinned kit commit, downloads portable Node + python-build-standalone per platform, `pip download --platform` the wheel set, installs into the vendored python, vendors the Anthropic document skills, npm-installs the app, zips.
- Built zips are artifacts (gitignored), uploaded to Gumroad by the operator.

## Model & billing decisions

- Default model `claude-opus-4-8` (claude-api skill mandate; also matches the kit's "most capable model" guidance). No model picker in the UI — simplicity wins; the RUN.md guidance is baked in.
- BYOK = buyer's API key, pay-per-token. This was an explicit brainstorm decision (vs. the kit's native zero-key subscription path, which remains available via the free DIY guide).

## Testing & verification

- **Part A:** `tsc --noEmit` + lint + build; agent-browser analyst-grade audit on production `/projects` and `/projects/om-builder` **without** the access cookie (fresh session) — proves public access; every copy button clicked; both viewports screenshotted + eyes-on review; also verify gated routes still redirect (no gate regression).
- **Part B:** on this Mac — run `build.sh`, unzip the Mac artifact into a clean folder, double-click flow end-to-end with a real API key (operator-supplied at test time), build an OM from `kit/examples/sample-deal`, confirm a real `.pptx` downloads and the smoke-test map has real streets. Windows zip: build-verified (contents + launcher lint) — no Windows machine available; flagged as buyer-beta until first Windows report.

## Out of scope

- Modifying anything in fintok-om-builder.
- Payments handling (Gumroad does it), licensing changes (kit stays PolyForm Noncommercial — bundle sold "pay what you want" is consistent with the author's own distribution; the repo already planned a Gumroad link).
- Auto-update of the bundle (UPDATING.md path is documented in the buyer README as "download the new zip").

## Risks / notes

- **Unsigned binaries:** Gatekeeper/SmartScreen friction is the biggest UX risk for the 5-year-old audience; mitigated with picture-guide steps. Proper signing/notarization is a future improvement if sales justify an Apple Developer cert.
- **Zip size:** ~150–250 MB per platform (runtimes). Acceptable for Gumroad.
- **Agent SDK version pinning:** the bundle pins exact versions of the SDK + runtimes at build time; buyers get a frozen, tested combination.
