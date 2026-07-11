# /projects + OM Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `fintok.news/projects` section hosting the OM Builder project page (DIY guide + Gumroad CTA), and produce the Gumroad "prebuilt" bundle: the unmodified fintok-om-builder kit wrapped in a BYOK localhost web app with fully vendored runtimes.

**Architecture:** Part A is static Next.js App Router pages (no backend fetches) made public via one middleware prefix. Part B is a standalone folder `projects/om-builder/` in this repo (outside all build contexts) containing a stdlib-Node server that drives the Claude Agent SDK, a single-file vanilla HTML UI, per-platform launchers, and a `build.sh` that assembles distributable zips with portable Node + Python baked in.

**Tech Stack:** Next.js 15 App Router + Tailwind v4 (Part A); Node stdlib `http` + `@anthropic-ai/claude-agent-sdk` (Part B); python-build-standalone + pinned wheels (bundle runtimes).

**Spec:** `docs/superpowers/specs/2026-07-10-projects-om-builder-design.md` — read it before starting any task.

## Global Constraints

- The fintok-om-builder kit is **never modified** — the wrapper drives it; the vendored copy is byte-identical to the pinned upstream commit.
- `/projects` subtree is public: `"/projects"` in `PUBLIC_PREFIXES` (`frontend/src/middleware.ts`). Pages are fully static — **no** `fetch` to the backend, no gated content.
- fourthspaceOS is a design **template** only — its logo/name never appears; FinTok branding only.
- Gumroad CTA URL: `https://fintok.gumroad.com/l/om-builder` (placeholder until operator creates the product).
- Agent model: `claude-opus-4-8`. Agent SDK options confirmed: `cwd`, `settingSources: ["project"]`, `skills: "all"`, `permissionMode: "bypassPermissions"`, `allowDangerouslySkipPermissions: true`, `env`.
- Bundle server binds `127.0.0.1` only, port 3131 (increment if taken). Buyer edits exactly ONE line: `ANTHROPIC_API_KEY=` in `PUT-YOUR-KEY-HERE.env`.
- Pinned versions (build.sh): Node `v20.18.1`; python-build-standalone `cpython-3.12.8+20250115`; kit commit = pin at build time via `git rev-parse HEAD` of the clone and record in `bundle-manifest.txt`.
- No liable/recommendation language anywhere; no "N sources" counts; plain-language copy rules from MEMORY.md apply to all page copy.
- Frontend gates before every push: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`. ONE push, wait for Railway deploy, then verify.
- fintok repo conventions: this is a frontend + new-standalone-folder change; no DB, no egress, no AI-call changes → fintok-conventions runbooks for those do not trigger. The designing skill + frontend-design skill MUST be loaded by whoever implements Tasks 3–4.

## File Structure

```
frontend/src/middleware.ts                          (modify: 1 line)
frontend/src/app/projects/page.tsx                  (create: index)
frontend/src/app/projects/om-builder/page.tsx       (create: project page, server component shell)
frontend/src/components/projects/ProjectsIndex.tsx  (create: index client UI)
frontend/src/components/projects/OmBuilderPage.tsx  (create: project page UI incl. guide)
frontend/src/components/projects/PromptBlock.tsx    (create: copy-to-clipboard block)
frontend/src/components/projects/guide-content.ts   (create: guide copy as data)
frontend/src/components/projects/__tests__/PromptBlock.test.tsx (create)
frontend/src/__tests__/middleware-projects.test.ts  (create)

projects/om-builder/app/package.json                (create)
projects/om-builder/app/server.js                   (create)
projects/om-builder/app/public/index.html           (create)
projects/om-builder/app/test/server-helpers.test.js (create)
projects/om-builder/launchers/Start OM Builder.command (create)
projects/om-builder/launchers/Start OM Builder.bat  (create)
projects/om-builder/launchers/PUT-YOUR-KEY-HERE.env (create)
projects/om-builder/README-buyer.html               (create)
projects/om-builder/requirements.txt                (create)
projects/om-builder/build.sh                        (create)
projects/om-builder/.gitignore                      (create: dist/, downloads/)
```

---

## Task 1: Make /projects public (middleware)

**Files:**
- Modify: `frontend/src/middleware.ts` (PUBLIC_PREFIXES array, ~line 8–23)
- Test: `frontend/src/__tests__/middleware-projects.test.ts`

**Interfaces:**
- Produces: `/projects` and every subpath pass the gate with no cookie; all other gated routes unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/__tests__/middleware-projects.test.ts
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function req(path: string) {
  return new NextRequest(new URL(`https://www.fintok.news${path}`));
}

describe("middleware /projects public access", () => {
  it("lets /projects through without a cookie", () => {
    const res = middleware(req("/projects"));
    // NextResponse.next() has no Location header; a redirect does
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets /projects/om-builder through without a cookie", () => {
    const res = middleware(req("/projects/om-builder"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects a gated route without a cookie", () => {
    const res = middleware(req("/dashboard"));
    expect(res.headers.get("location")).toBe("https://www.fintok.news/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest src/__tests__/middleware-projects.test.ts`
Expected: FAIL — `/projects` assertions fail (redirected), `/dashboard` passes.

- [ ] **Step 3: Add the prefix**

In `frontend/src/middleware.ts`, inside `PUBLIC_PREFIXES`, after the legal-pages block:

```ts
  /* §11.461 — /projects is public by design: project marketing + DIY guide
   * content only, fully static, never intelligence content. */
  "/projects",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx jest src/__tests__/middleware-projects.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/middleware.ts frontend/src/__tests__/middleware-projects.test.ts
git commit -m "feat(projects): /projects subtree is public — middleware prefix + tests"
```

---

## Task 2: PromptBlock + guide content data

**Files:**
- Create: `frontend/src/components/projects/PromptBlock.tsx`
- Create: `frontend/src/components/projects/guide-content.ts`
- Test: `frontend/src/components/projects/__tests__/PromptBlock.test.tsx`

**Interfaces:**
- Produces: `<PromptBlock label={string} text={string} />` (client component; monospace box + "Copy" button that writes `text` to clipboard and flips to "Copied ✓" for 2s).
- Produces: `guide-content.ts` exports `GUIDE_STEPS: GuideStep[]` where `type GuideStep = { n: string; title: string; intro: string; substeps: { label: string; body: string; prompt?: { label: string; text: string } }[]; callout?: { title: string; body: string } }`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/projects/__tests__/PromptBlock.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptBlock } from "../PromptBlock";

describe("PromptBlock", () => {
  it("renders the text and copies it on click", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PromptBlock label="Copy prompt" text="hello world" />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("hello world");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent(/copied/i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx jest src/components/projects`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement PromptBlock**

```tsx
// frontend/src/components/projects/PromptBlock.tsx
"use client";

import { useState } from "react";

/* fourthspaceOS-style prompt box: monospace body, hairline border,
 * single Copy action. Used for prompts AND terminal commands. */
export function PromptBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-md border border-white/15 bg-white/[0.04]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/80 transition-colors hover:text-white"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed text-white/85">
        {text}
      </pre>
    </div>
  );
}
```

- [ ] **Step 4: Write guide-content.ts**

Author `GUIDE_STEPS` with six steps. The exact structure and load-bearing content (prompts verbatim from the kit, commands verbatim from its INSTALL.md) is below; connective prose (`intro`, substep `body`) must follow each step's stated points — plain language, no jargon without explanation, why-this-matters framing per fourthspaceOS reference:

```ts
// frontend/src/components/projects/guide-content.ts
export type GuideStep = {
  n: string;
  title: string;
  intro: string;
  substeps: {
    label: string;
    body: string;
    prompt?: { label: string; text: string };
  }[];
  callout?: { title: string; body: string };
};

export const GITHUB_URL = "https://github.com/benfan87/fintok-om-builder";
export const GUMROAD_URL = "https://fintok.gumroad.com/l/om-builder";

export const GUIDE_STEPS: GuideStep[] = [
  /* 01 — Install Claude Code.
     intro: what Claude Code is (Anthropic's AI assistant that lives in a
     terminal window your computer already has), that any paid Claude plan
     works, and that Claude runs every technical command FOR you.
     substeps: (i) install from anthropic.com/claude-code and sign in;
     (ii) open it — a chat inside a terminal window; how to open a terminal
     on Mac (Cmd+Space → "Terminal") and Windows (Start → "PowerShell"). */
  /* 02 — Get the kit. ONE substep with the magic prompt:
     prompt: { label: "Paste into Claude Code",
       text: "Install this for me: https://github.com/benfan87/fintok-om-builder" }
     body: Claude clones the repo, copies the three skills into place, and
     runs a smoke test while you watch.
     callout: "Why a smoke test?" — the map generator draws REAL streets
     from real map tiles; a blank grid means it isn't working yet. Real
     streets = installed. */
  /* 03 — Install by hand (for the curious). substeps carry INSTALL.md's
     verbatim commands as prompt blocks:
     (i) prerequisites — { label: "Check the tools", text:
       "git --version\nclaude --version\npython3 --version" }
     (ii) clone — { label: "Terminal", text:
       "git clone https://github.com/benfan87/fintok-om-builder.git\ncd fintok-om-builder" }
     (iii) copy the skills (macOS) — { label: "Terminal (macOS)", text:
       "mkdir -p ~/.claude/skills\ncp -R skills/cre-maps ~/.claude/skills/\ncp -R skills/property-photos ~/.claude/skills/\ncp -R skills/doc-from-template ~/.claude/skills/" }
     (iv) restart Claude Code, then verify — { label: "Ask Claude", text:
       "list the skills you can see" } — body: you should see all three:
       cre-maps, property-photos, doc-from-template. */
  /* 04 — ANALYZE: teach it a template (once). intro: point Claude at one
     beautiful OM to learn its look, saved forever as a profile; you can
     SKIP this and use the built-in institutional look, profile name
     "garden-om".
     prompt: verbatim kit prompt 1 —
     { label: "Prompt 1 — Analyze", text:
       "Analyze this offering memorandum in three layers: (1) structure — every page and its purpose; (2) design language — colors as hex, fonts, table styles, image slots; (3) variable content — every deal-specific value, table, and photo that would change for a new deal, as a field list. Save the analysis as a reusable template profile with an untouched copy of the original." } */
  /* 05 — FILL: build your deal (per deal). intro: drop your rent roll,
     model, comps and photos into the chat, fill three blanks
     ([PROPERTY], [PROFILE], $[X]).
     prompt: verbatim kit prompt 2 —
     { label: "Prompt 2 — Fill", text:
       "Build [PROPERTY] into the [PROFILE] template as an editable PowerPoint at a price of $[X]. Every number must come from my documents — rent roll, financial model, comp analysis — and anything missing becomes a visible [TBD] marker, never a guess. Real text boxes and real tables so I can edit everything. Use the cre-maps skill for the location and comp maps, and the property-photos skill for imagery. Strip all of the original template's branding and replace with mine." }
     callout: "The [TBD] discipline" — the tool never invents financials;
     a deck full of [TBD]s is the tool refusing to fabricate, not failing.
     Chase each one down, add the source, re-run. */
  /* 06 — VERIFY: audit before you trust it (always). intro: same chat,
     right after Fill.
     prompt: verbatim kit prompt 3 —
     { label: "Prompt 3 — Verify", text:
       "Review the deck three ways before I trust it: (1) design fidelity against the original template, page by page; (2) every number re-traced to my source documents — recompute the derived ones; (3) editability — confirm every word is a real text frame and every table a real table, and scan for any remnant of the template owner's branding. Fix what you find and show me proof." }
     callout: "Honest limits" — condensed from the kit's RUN.md: asking
     rents overstate collected rents; small comp samples are noisy; the
     truth layer is yours (garbage rent roll in, garbage OM out); a
     produced OM is a marketing draft, not underwriting. */
];
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd frontend && npx jest src/components/projects && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/projects
git commit -m "feat(projects): PromptBlock + OM Builder guide content"
```

---

## Task 3: /projects index page

**Files:**
- Create: `frontend/src/app/projects/page.tsx`
- Create: `frontend/src/components/projects/ProjectsIndex.tsx`

**Interfaces:**
- Consumes: nothing dynamic. A local `PROJECTS` const array drives cards.
- Produces: route `/projects` (static). Card links to `/projects/om-builder`.

**Design directives (binding — implementer must load the `designing` + `frontend-design:frontend-design` skills first):** dark editorial theme (`bg-[#0B0B0C]`, near-white type), Anton for the display headline with a Fraunces-italic word accent (e.g. "Projects, <em>owned</em>."), Geist Mono for eyebrows/labels, generous whitespace, hairline `border-white/10` separators. This is the fourthspaceOS language under FinTok branding. NOT the gated app shell — the page renders its own minimal header (wordmark "Fintok.news" linking to `/`) and reuses `SiteFooter`. No decorative badges, no source counts.

- [ ] **Step 1: Page shell**

```tsx
// frontend/src/app/projects/page.tsx
import type { Metadata } from "next";
import { ProjectsIndex } from "@/components/projects/ProjectsIndex";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "AI workflows you can own — built by FinTok, documented end to end, free to build yourself or ready-made if you'd rather not.",
};

export default function ProjectsPage() {
  return <ProjectsIndex />;
}
```

- [ ] **Step 2: Implement ProjectsIndex**

Server-compatible component (no client hooks needed). Structure: minimal header → hero (display headline + one-paragraph dek) → project card list from:

```tsx
const PROJECTS = [
  {
    slug: "om-builder",
    name: "OM Builder",
    tagline:
      "Institutional-grade offering memorandums from your own deal documents — built on your machine, your data never leaves it.",
    status: "Live",
  },
];
```

Card: number chip (`01`), name in Anton, tagline in body type, mono "Read the guide →" link. Whole card is the `<Link href={`/projects/${p.slug}`}>`.

- [ ] **Step 3: Gates**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 4: Local eyes-on**

Not possible pre-deploy per repo convention (production-only verification happens in Task 5) — instead verify the built route exists: `ls frontend/.next/server/app/projects*` shows the compiled route.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/projects frontend/src/components/projects/ProjectsIndex.tsx
git commit -m "feat(projects): public /projects index — editorial project cards"
```

---

## Task 4: /projects/om-builder page (guide + Gumroad split)

**Files:**
- Create: `frontend/src/app/projects/om-builder/page.tsx`
- Create: `frontend/src/components/projects/OmBuilderPage.tsx`

**Interfaces:**
- Consumes: `GUIDE_STEPS`, `GITHUB_URL`, `GUMROAD_URL` from `guide-content.ts`; `PromptBlock`.
- Produces: route `/projects/om-builder` (static).

**Layout (binding):**
1. Minimal header (same as index) + breadcrumb `Projects / OM Builder`.
2. Hero: Anton headline ("Build an institutional OM from your own deal docs."), dek covering: runs on your machine · billed to the Claude subscription you already pay for (DIY path) · nothing leaves your computer · [TBD] instead of invented numbers.
3. **Two-path split** — `grid md:grid-cols-2` panel pair, stacked on mobile:
   - Panel A "BUILD IT YOURSELF — FREE": 3-sentence summary + anchor button "Start the guide ↓" + mono GitHub link.
   - Panel B "GET IT PREBUILT — PAY WHAT YOU WANT": describes the bundle (one file to edit, one thing to double-click, a browser UI; bring your own Anthropic API key; each build bills your key roughly $2–8). CTA button → `GUMROAD_URL` (`target="_blank" rel="noopener"`). Sub-line: "Pay $0 if you want. Pay something if it's worth something to you."
4. Step chip breadcrumb row: `[01 Install] › [02 One-line setup] › [03 By hand] › [04 Analyze] › [05 Fill] › [06 Verify]` — anchor links to `#step-01`…`#step-06`.
5. The guide: map `GUIDE_STEPS` → sections with `id={`step-${n}`}`, big mono step number, Anton title, intro paragraph, roman-numeral substeps (i., ii., …), `PromptBlock` where `prompt` present, callout boxes (`border-l-2 border-white/30 pl-4` treatment, Fraunces-italic title).
6. Footer of guide: "Rather skip all of this?" → repeats the Gumroad CTA; then `SiteFooter`.

- [ ] **Step 1: Page shell**

```tsx
// frontend/src/app/projects/om-builder/page.tsx
import type { Metadata } from "next";
import { OmBuilderPage } from "@/components/projects/OmBuilderPage";

export const metadata: Metadata = {
  title: "OM Builder — Projects",
  description:
    "Build institutional-grade CRE offering memorandums from your own deal documents. Free step-by-step guide, or a ready-made bundle — pay what you want.",
};

export default function Page() {
  return <OmBuilderPage />;
}
```

- [ ] **Step 2: Implement OmBuilderPage** per the layout directives above. Iterate the visual design at least 3 times before settling (density, hierarchy, hover states on cards/buttons, prompt-box treatment) — per CLAUDE.md's frontend stack; note each iteration's change in the commit body.

- [ ] **Step 3: Gates**

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build && npx jest src/components/projects src/__tests__/middleware-projects.test.ts`
Expected: all clean, tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/projects frontend/src/components/projects
git commit -m "feat(projects): OM Builder page — DIY guide (01-06) + pay-what-you-want split"
```

---

## Task 5: Push, deploy, production verification (Part A)

**Files:** none (verification only).

- [ ] **Step 1: Push** — `git push origin main` (single push carrying Tasks 1–4 commits). Wait for operator confirmation that Railway deploy succeeded.

- [ ] **Step 2: Public-access proof** — in a FRESH agent-browser session (no access cookie ever set): open `https://www.fintok.news/projects` and `/projects/om-builder` → both must render fully. Then open `/dashboard` → must redirect to `/` (gate regression check).

- [ ] **Step 3: Analyst-grade content audit** — read every headline/step title on both pages; click EVERY interactive element: each project card, both path CTAs (Gumroad opens the product page), all 6 step chips (anchor scroll), every Copy button (≥8 — verify clipboard via a paste into the URL bar or `agent-browser` eval), GitHub links, footer links.

- [ ] **Step 4: Two-viewport eyes-on** — screenshot desktop 1280×800 and mobile 375×812 of both routes; Read each screenshot; answer in writing: crisp type? no overlap/clipping? no horizontal scroll? prompt boxes wrap correctly on mobile? does it hold up next to the fourthspaceOS reference and feel institutional?

- [ ] **Step 5: Visual-only review subagent** — dispatch a subagent with the screenshots asking exactly: "Blackstone-adjacent editorial page or generic Tailwind dashboard?" Fix anything it flags, single follow-up push if needed.

- [ ] **Step 6: Cleanup + docs** — `agent-browser close --all`; delete screenshots; update `docs/STATE.md` banner + ledger §11.461 with the VERIFIED evidence.

---

## Task 6: Bundle app — server.js + UI

**Files:**
- Create: `projects/om-builder/app/package.json`
- Create: `projects/om-builder/app/server.js`
- Create: `projects/om-builder/app/public/index.html`
- Create: `projects/om-builder/app/test/server-helpers.test.js`
- Create: `projects/om-builder/.gitignore` (contents: `dist/`, `downloads/`, `app/node_modules/`)

**Interfaces:**
- Produces: `node app/server.js` from the bundle root serves `http://127.0.0.1:3131`. HTTP API (all JSON unless noted):
  - `GET /` → index.html
  - `GET /api/status` → `{ keyPresent: boolean }` (key looks like `sk-ant-`)
  - `POST /api/job` → `{ job: string }` (creates `workspace/jobs/<uuid>/`)
  - `POST /api/upload?job=<id>&name=<filename>` (raw body streamed to disk; filename basename-sanitized) → `{ ok: true, name }`
  - `POST /api/build` body `{ job, property, price }` → `{ ok: true }` (starts agent; profile fixed to `garden-om`)
  - `POST /api/verify` body `{ job }` → `{ ok: true }`
  - `GET /api/progress?job=<id>` → SSE stream; events: `{ kind: "line"|"detail"|"done"|"error", text }`; replays buffered events on connect
  - `GET /api/outputs?job=<id>` → `{ files: string[] }` (`*.pptx` in job dir)
  - `GET /api/download?job=<id>&name=<file>` → file bytes (Content-Disposition attachment)
- Exports (for tests): `parseEnvFile(text)`, `fillPrompt({ property, price })`, `safeName(name)`.

- [ ] **Step 1: package.json**

```json
{
  "name": "om-builder-app",
  "private": true,
  "type": "commonjs",
  "scripts": { "test": "node --test test/" },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.5.0"
  }
}
```

(Pin to the latest published version at implementation time via `npm view @anthropic-ai/claude-agent-sdk version`; write the exact version, not a range, before building the bundle.)

- [ ] **Step 2: Write failing helper tests**

```js
// projects/om-builder/app/test/server-helpers.test.js
const test = require("node:test");
const assert = require("node:assert");
const { parseEnvFile, fillPrompt, safeName } = require("../server.js");

test("parseEnvFile reads the key line, ignores comments/blanks", () => {
  const env = parseEnvFile("# paste below\nANTHROPIC_API_KEY=sk-ant-abc123\n");
  assert.strictEqual(env.ANTHROPIC_API_KEY, "sk-ant-abc123");
});

test("fillPrompt substitutes property, profile and price", () => {
  const p = fillPrompt({ property: "845 S Kenmore", price: "12,500,000" });
  assert.ok(p.includes("Build 845 S Kenmore into the garden-om template"));
  assert.ok(p.includes("$12,500,000"));
  assert.ok(!p.includes("[PROPERTY]") && !p.includes("[PROFILE]") && !p.includes("$[X]"));
});

test("safeName strips paths", () => {
  assert.strictEqual(safeName("../../etc/passwd"), "passwd");
  assert.strictEqual(safeName("rent roll.xlsx"), "rent roll.xlsx");
});
```

Run: `cd projects/om-builder/app && npm test` → FAIL (server.js missing).

- [ ] **Step 3: Implement server.js**

```js
// projects/om-builder/app/server.js
// OM Builder local app — stdlib http + Claude Agent SDK. Binds 127.0.0.1 only.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

const ROOT = path.resolve(__dirname, ".."); // bundle root
const WORKSPACE = path.join(ROOT, "workspace");
const JOBS = path.join(WORKSPACE, "jobs");
const ENV_FILE = path.join(ROOT, "PUT-YOUR-KEY-HERE.env");
const PUBLIC = path.join(__dirname, "public");

// ---- pure helpers (exported for tests) ----
function parseEnvFile(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}

const FILL_TEMPLATE =
  "Build [PROPERTY] into the [PROFILE] template as an editable PowerPoint at a price of $[X]. " +
  "Every number must come from my documents — rent roll, financial model, comp analysis — and anything missing becomes a visible [TBD] marker, never a guess. " +
  "Real text boxes and real tables so I can edit everything. Use the cre-maps skill for the location and comp maps, and the property-photos skill for imagery. " +
  "Strip all of the original template's branding and replace with mine. " +
  "The deal documents are the files in the current folder.";

const VERIFY_PROMPT =
  "Review the deck three ways before I trust it: (1) design fidelity against the original template, page by page; " +
  "(2) every number re-traced to my source documents — recompute the derived ones; " +
  "(3) editability — confirm every word is a real text frame and every table a real table, and scan for any remnant of the template owner's branding. " +
  "Fix what you find and show me proof. The deck and source documents are in the current folder.";

function fillPrompt({ property, price }) {
  return FILL_TEMPLATE.replace("[PROPERTY]", property)
    .replace("[PROFILE]", "garden-om")
    .replace("$[X]", `$${price}`);
}

function safeName(name) {
  return path.basename(String(name)).replace(/[\\/\0]/g, "");
}

// ---- job state ----
const jobs = new Map(); // id -> { events: [], listeners: Set<res>, running: bool }

function emit(job, kind, text) {
  const ev = { kind, text };
  job.events.push(ev);
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of job.listeners) res.write(payload);
}

function readKey() {
  try {
    return parseEnvFile(fs.readFileSync(ENV_FILE, "utf8")).ANTHROPIC_API_KEY || "";
  } catch {
    return "";
  }
}

// Friendly progress translation: assistant text → "line"; tool chatter → "detail".
function describeToolUse(name, input) {
  if (name === "Bash" && /make_map/.test(input?.command || "")) return "Drawing the location map from real map tiles…";
  if (name === "Bash" && /extract_pdf_photos/.test(input?.command || "")) return "Pulling property photos from your PDF…";
  if (name === "Write" || name === "Edit") return "Building the deck…";
  if (name === "Read") return "Reading your documents…";
  return null;
}

async function runAgent(jobId, prompt) {
  const job = jobs.get(jobId);
  const jobDir = path.join(JOBS, jobId);
  job.running = true;
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const q = query({
      prompt,
      options: {
        cwd: jobDir,
        model: "claude-opus-4-8",
        settingSources: ["project"],
        skills: "all",
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        env: { ...process.env, ANTHROPIC_API_KEY: readKey() },
      },
    });
    for await (const msg of q) {
      if (msg.type === "assistant") {
        for (const block of msg.message?.content || []) {
          if (block.type === "text" && block.text.trim()) emit(job, "line", block.text.trim());
          if (block.type === "tool_use") {
            const friendly = describeToolUse(block.name, block.input);
            if (friendly) emit(job, "line", friendly);
            emit(job, "detail", `${block.name}: ${JSON.stringify(block.input).slice(0, 300)}`);
          }
        }
      } else if (msg.type === "result") {
        if (msg.is_error) emit(job, "error", msg.result || "The build hit an error.");
      }
    }
    emit(job, "done", "Done.");
  } catch (err) {
    emit(job, "error", `Something went wrong: ${err.message}`);
  } finally {
    job.running = false;
  }
}

// The workspace's project skills must be visible from each job dir: jobs live
// UNDER workspace/, and the SDK discovers .claude/ from cwd ancestors — so
// workspace/.claude/skills serves every job. (Verified in Task 9 E2E.)

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const jobId = url.searchParams.get("job");
  const job = jobId ? jobs.get(jobId) : null;

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(fs.readFileSync(path.join(PUBLIC, "index.html")));
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    return json(res, 200, { keyPresent: readKey().startsWith("sk-ant-") });
  }
  if (req.method === "POST" && url.pathname === "/api/job") {
    const id = crypto.randomUUID();
    fs.mkdirSync(path.join(JOBS, id), { recursive: true });
    jobs.set(id, { events: [], listeners: new Set(), running: false });
    return json(res, 200, { job: id });
  }
  if (!job && url.pathname.startsWith("/api/") && url.pathname !== "/api/build" && url.pathname !== "/api/verify") {
    if (url.pathname !== "/api/status") return json(res, 404, { error: "unknown job" });
  }
  if (req.method === "POST" && url.pathname === "/api/upload") {
    const name = safeName(url.searchParams.get("name") || "file");
    const out = fs.createWriteStream(path.join(JOBS, jobId, name));
    req.pipe(out).on("finish", () => json(res, 200, { ok: true, name }));
    return;
  }
  if (req.method === "POST" && (url.pathname === "/api/build" || url.pathname === "/api/verify")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { job: id, property, price } = JSON.parse(body || "{}");
      const j = jobs.get(id);
      if (!j) return json(res, 404, { error: "unknown job" });
      if (j.running) return json(res, 409, { error: "already running" });
      const prompt = url.pathname === "/api/build" ? fillPrompt({ property, price }) : VERIFY_PROMPT;
      runAgent(id, prompt);
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/progress") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    for (const ev of job.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    job.listeners.add(res);
    req.on("close", () => job.listeners.delete(res));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/outputs") {
    const files = fs
      .readdirSync(path.join(JOBS, jobId))
      .filter((f) => f.toLowerCase().endsWith(".pptx"));
    return json(res, 200, { files });
  }
  if (req.method === "GET" && url.pathname === "/api/download") {
    const name = safeName(url.searchParams.get("name") || "");
    const file = path.join(JOBS, jobId, name);
    if (!fs.existsSync(file)) return json(res, 404, { error: "not found" });
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}"`,
    });
    return fs.createReadStream(file).pipe(res);
  }
  json(res, 404, { error: "not found" });
});

module.exports = { parseEnvFile, fillPrompt, safeName };

if (require.main === module) {
  fs.mkdirSync(JOBS, { recursive: true });
  const PORT = 3131;
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`OM Builder running at ${url}`);
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    execFile(opener, args, () => {});
  });
}
```

- [ ] **Step 4: Run helper tests**

Run: `cd projects/om-builder/app && npm install && npm test`
Expected: 3/3 pass. (`npm install` here is dev-only; the bundle build re-installs frozen.)

- [ ] **Step 5: Implement public/index.html**

Single file, vanilla JS, no external assets (works offline except the agent itself). Required elements and behavior:

- Header: "OM Builder" wordmark + key status pill (from `/api/status`; red "Add your key first — open PUT-YOUR-KEY-HERE.env" if absent, green "Key connected" if present; poll every 5s until green).
- Three numbered panels, vertically stacked, generous type (root font 18px):
  1. **"1 · Drop your deal documents"** — a large dashed drop zone (also click-to-browse `<input type=file multiple>`); on files: `POST /api/job` once (store job id), then `POST /api/upload` per file with raw body (`fetch(url, { method:"POST", body: file })`); show uploaded-file chips with sizes.
  2. **"2 · Name it and price it"** — two inputs: "Property name" (text), "Asking price in dollars" (text). One giant button **"Build my OM"** (disabled until: key green + ≥1 file + both fields non-empty). On click: `POST /api/build`, open `EventSource("/api/progress?job=…")`, render `kind:"line"` events as a friendly progress feed with a spinner; `kind:"detail"` lines go into a collapsed `<details>Show the technical details</details>`; on `kind:"error"` show a red box with the text; on `kind:"done"` fetch `/api/outputs`.
  3. **"3 · Download"** — one download card per `.pptx` (`/api/download` link), plus a secondary button **"Double-check it (Verify)"** → `POST /api/verify` and reattach the same progress feed. If the deck likely contains `[TBD]` (any progress line mentioned "[TBD]"), show the honest note: "Your deck has [TBD] spots — the tool refuses to invent numbers. Add the missing info to your documents and build again."
- Footer note, always visible: "Each build bills your own Anthropic API key — typically a few dollars per OM."
- Styling: embedded `<style>`, warm off-white background, one accent color, system font stack + monospace for the details pane, everything ≥16px, buttons ≥48px tall. It must read as friendly consumer software, not a dev tool.

- [ ] **Step 6: Manual smoke of the server plumbing (no API key needed)**

```bash
cd projects/om-builder && node app/server.js &
sleep 1
curl -s http://127.0.0.1:3131/api/status            # {"keyPresent":false}
JOB=$(curl -s -X POST http://127.0.0.1:3131/api/job | python3 -c 'import sys,json;print(json.load(sys.stdin)["job"])')
printf 'unit,rent\n101,1500\n' | curl -s -X POST --data-binary @- "http://127.0.0.1:3131/api/upload?job=$JOB&name=rentroll.csv"
ls workspace/jobs/$JOB/                              # rentroll.csv
kill %1
```

Expected outputs as annotated. **Kill the background server before finishing.**

- [ ] **Step 7: Commit**

```bash
git add projects/om-builder/app projects/om-builder/.gitignore
git commit -m "feat(om-builder): BYOK localhost app — stdlib server + Agent SDK driver + single-file UI"
```

---

## Task 7: Launchers, .env, buyer README

**Files:**
- Create: `projects/om-builder/launchers/Start OM Builder.command`
- Create: `projects/om-builder/launchers/Start OM Builder.bat`
- Create: `projects/om-builder/launchers/PUT-YOUR-KEY-HERE.env`
- Create: `projects/om-builder/README-buyer.html`

**Interfaces:**
- Consumes: bundle layout from the spec (`runtime/node/<arch>/`, `runtime/python/`, `app/server.js`).
- Produces: double-clickable entry points; the ONE-line env file.

- [ ] **Step 1: PUT-YOUR-KEY-HERE.env**

```
# ↓↓↓ Paste your Anthropic API key after the = sign on the next line. That's the only edit you'll ever make. ↓↓↓
ANTHROPIC_API_KEY=
# Get a key at https://console.anthropic.com → API keys → Create key. It starts with sk-ant-
```

- [ ] **Step 2: Mac launcher**

```bash
#!/bin/bash
# Start OM Builder — double-click me. (First time: right-click → Open.)
cd "$(dirname "$0")"
ARCH=$(uname -m)                       # arm64 or x86_64
[ "$ARCH" = "x86_64" ] && ARCH=x64
NODE="$PWD/runtime/node/$ARCH/bin/node"
if [ ! -x "$NODE" ]; then
  echo "This download doesn't match your Mac ($ARCH). Please re-download the Mac version."; read -r; exit 1
fi
export PATH="$PWD/runtime/python/bin:$PWD/runtime/node/$ARCH/bin:$PATH"
exec "$NODE" app/server.js
```

Mark executable in git: `chmod +x "projects/om-builder/launchers/Start OM Builder.command"`.

- [ ] **Step 3: Windows launcher**

```bat
@echo off
rem Start OM Builder — double-click me. (If Windows warns: More info -> Run anyway.)
cd /d "%~dp0"
set "PATH=%cd%\runtime\python;%cd%\runtime\python\Scripts;%cd%\runtime\node;%PATH%"
"%cd%\runtime\node\node.exe" app\server.js
pause
```

- [ ] **Step 4: README-buyer.html**

Self-contained HTML (embedded CSS, no images required — use big numbered typographic steps; screenshots can be added before Gumroad upload). Content, in this order:
1. "Three steps, ever." — 1) Get your key (console.anthropic.com → API keys → Create; copy it) 2) Paste it into `PUT-YOUR-KEY-HERE.env` after the `=` 3) Double-click `Start OM Builder`.
2. First-time warnings, verbatim guidance: **Mac:** "macOS will say it can't verify the developer. Right-click (or hold Control and click) `Start OM Builder.command` → Open → Open. You only do this once." **Windows:** "Windows may show 'Windows protected your PC'. Click More info → Run anyway. You only do this once."
3. What it costs: "Builds bill your own Anthropic key — typically a few dollars per OM. Nothing else is billed by anyone."
4. Privacy: "Your deal documents stay on your computer. The only place anything is sent is Anthropic's API, using your own key."
5. Updating: "New version = download the new zip from your Gumroad library and replace the folder. Your key file can be copied over."
6. Credits + license: built on the FinTok OM Builder kit (link to GitHub + fintok.news/projects/om-builder); PolyForm Noncommercial 1.0.0.

- [ ] **Step 5: Commit**

```bash
git add projects/om-builder/launchers projects/om-builder/README-buyer.html
git commit -m "feat(om-builder): double-click launchers, one-line key file, buyer README"
```

---

## Task 8: build.sh — assemble the distributable zips

**Files:**
- Create: `projects/om-builder/requirements.txt`
- Create: `projects/om-builder/build.sh`

**Interfaces:**
- Consumes: everything from Tasks 6–7.
- Produces: `projects/om-builder/dist/OM-Builder-Mac.zip` and `dist/OM-Builder-Windows.zip`; `bundle-manifest.txt` inside each (kit commit, Node/Python/SDK versions).

- [ ] **Step 1: requirements.txt**

Start from the kit's documented deps + document-skill deps; **then verify** (Step 3 below) by grepping the vendored skills for imports:

```
staticmap==0.5.7
pillow==11.1.0
python-pptx==1.0.2
python-docx==1.1.2
pypdf==5.1.0
pdfplumber==0.11.4
openpyxl==3.1.5
```

- [ ] **Step 2: build.sh**

```bash
#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

NODE_V=v20.18.1
PY_TAG=20250115
PY_V=3.12.8
KIT_URL=https://github.com/benfan87/fintok-om-builder.git
SKILLS_URL=https://github.com/anthropics/skills.git

mkdir -p downloads dist
DL=$PWD/downloads

fetch() { [ -f "$DL/$2" ] || curl -fL "$1" -o "$DL/$2"; }

# --- 1. sources ---
rm -rf "$DL/kit" "$DL/anthropic-skills"
git clone --depth 1 "$KIT_URL" "$DL/kit"
KIT_COMMIT=$(git -C "$DL/kit" rev-parse HEAD)
git clone --depth 1 "$SKILLS_URL" "$DL/anthropic-skills"

# --- 2. runtimes ---
fetch "https://nodejs.org/dist/$NODE_V/node-$NODE_V-darwin-arm64.tar.gz"  node-mac-arm64.tgz
fetch "https://nodejs.org/dist/$NODE_V/node-$NODE_V-darwin-x64.tar.gz"    node-mac-x64.tgz
fetch "https://nodejs.org/dist/$NODE_V/node-$NODE_V-win-x64.zip"          node-win.zip
PB=https://github.com/astral-sh/python-build-standalone/releases/download/$PY_TAG
fetch "$PB/cpython-$PY_V+$PY_TAG-aarch64-apple-darwin-install_only.tar.gz" py-mac-arm64.tgz
fetch "$PB/cpython-$PY_V+$PY_TAG-x86_64-apple-darwin-install_only.tar.gz"  py-mac-x64.tgz
fetch "$PB/cpython-$PY_V+$PY_TAG-x86_64-pc-windows-msvc-install_only.tar.gz" py-win.tgz

# --- 3. app deps (frozen) ---
( cd app && npm ci --omit=dev )

stage() { # stage <name> <plat>  plat: mac|win
  local S=dist/stage-$1; rm -rf "$S"; mkdir -p "$S/OM-Builder"
  cp -R "$DL/kit" "$S/OM-Builder/kit"; rm -rf "$S/OM-Builder/kit/.git"
  mkdir -p "$S/OM-Builder/app" && cp -R app/server.js app/public app/package.json app/node_modules "$S/OM-Builder/app/"
  cp "launchers/PUT-YOUR-KEY-HERE.env" README-buyer.html "$S/OM-Builder/"
  # workspace skills = kit skills + anthropic document skills
  mkdir -p "$S/OM-Builder/workspace/.claude/skills"
  cp -R "$DL"/kit/skills/* "$S/OM-Builder/workspace/.claude/skills/"
  for sk in pptx docx pdf; do
    SRC=$(find "$DL/anthropic-skills" -maxdepth 3 -type d -name "$sk" | head -1)
    [ -n "$SRC" ] && cp -R "$SRC" "$S/OM-Builder/workspace/.claude/skills/$sk"
  done
  printf 'kit=%s\nnode=%s\npython=%s+%s\n' "$KIT_COMMIT" "$NODE_V" "$PY_V" "$PY_TAG" > "$S/OM-Builder/bundle-manifest.txt"
}

pyinstall() { # pyinstall <sitepkgs-dir> <pip-platform>
  python3 -m pip install --quiet --target "$1" --platform "$2" \
    --only-binary=:all: --python-version 3.12 -r requirements.txt
}

# --- MAC ---
stage mac mac
S=dist/stage-mac/OM-Builder
mkdir -p "$S/runtime/node/arm64" "$S/runtime/node/x64"
tar -xzf "$DL/node-mac-arm64.tgz" -C "$S/runtime/node/arm64" --strip-components=1
tar -xzf "$DL/node-mac-x64.tgz"   -C "$S/runtime/node/x64"   --strip-components=1
mkdir -p "$S/runtime"
tar -xzf "$DL/py-mac-arm64.tgz" -C "$S/runtime" && mv "$S/runtime/python" "$S/runtime/python"
pyinstall "$S/runtime/python/lib/python3.12/site-packages" macosx_11_0_arm64
cp "launchers/Start OM Builder.command" "$S/" && chmod +x "$S/Start OM Builder.command"
( cd dist/stage-mac && zip -qry ../OM-Builder-Mac.zip OM-Builder )

# --- WINDOWS ---
stage win win
S=dist/stage-win/OM-Builder
mkdir -p "$S/runtime/node"
unzip -q "$DL/node-win.zip" -d "$S/runtime"
mv "$S/runtime/node-$NODE_V-win-x64"/* "$S/runtime/node/" && rmdir "$S/runtime/node-$NODE_V-win-x64"
tar -xzf "$DL/py-win.tgz" -C "$S/runtime"
pyinstall "$S/runtime/python/Lib/site-packages" win_amd64
cp "launchers/Start OM Builder.bat" "$S/Start OM Builder.bat"
( cd dist/stage-win && zip -qry ../OM-Builder-Windows.zip OM-Builder )

echo "Built: dist/OM-Builder-Mac.zip dist/OM-Builder-Windows.zip (kit $KIT_COMMIT)"
```

Known judgment points for the implementer (resolve, don't skip): (a) the Mac zip ships the **arm64** Python only — Intel-Mac buyers also need x64 python; either ship both pythons (mirror the node arm64/x64 layout and select in the `.command` by `$ARCH`) or ship two Mac zips; pick ship-both-pythons and update the launcher's PATH line accordingly. (b) Confirm the anthropic-skills repo's actual folder layout for pptx/docx/pdf at build time and adjust the `find`. (c) If any wheel in requirements.txt has no matching platform wheel, pin to the nearest version that does.

- [ ] **Step 3: Verify the requirements set against the vendored skills**

```bash
grep -rhoE "^(import|from) [a-z_0-9]+" downloads/anthropic-skills/*/pptx downloads/anthropic-skills/*/docx downloads/anthropic-skills/*/pdf downloads/kit/skills 2>/dev/null | sort -u
```

Every non-stdlib module must map to a line in requirements.txt; add any missing (e.g. `markitdown`, `defusedxml`) with a pinned version.

- [ ] **Step 4: Run the build**

Run: `cd projects/om-builder && bash build.sh`
Expected: both zips in `dist/`, each < 400 MB. Then structural check:

```bash
unzip -l dist/OM-Builder-Mac.zip | grep -E "Start OM Builder.command|PUT-YOUR-KEY-HERE.env|server.js|garden-om|cre-maps|node$|python3$" 
```

Expected: all present.

- [ ] **Step 5: Commit**

```bash
git add projects/om-builder/build.sh projects/om-builder/requirements.txt
git commit -m "feat(om-builder): build.sh — vendored runtimes + skills, per-platform zips"
```

---

## Task 9: Mac E2E on the built artifact — CHECKPOINT (needs operator API key)

**Files:** none. **⚠ Blocked on:** an Anthropic API key from the operator for the test build (billed a few dollars). Ask before running; do not use any key found in repo env files without asking.

- [ ] **Step 1: Clean-room unzip**

```bash
rm -rf /tmp/om-e2e && mkdir /tmp/om-e2e && unzip -q projects/om-builder/dist/OM-Builder-Mac.zip -d /tmp/om-e2e
```

- [ ] **Step 2: Key + launch** — paste the operator-supplied key into `/tmp/om-e2e/OM-Builder/PUT-YOUR-KEY-HERE.env`; run `"/tmp/om-e2e/OM-Builder/Start OM Builder.command"` from a terminal (double-click parity is the same script). Expected: server logs the URL and the browser opens.

- [ ] **Step 3: Drive the UI with agent-browser** — open `http://localhost:3131`; confirm the key pill is green; upload the kit's sample deal files (`/tmp/om-e2e/OM-Builder/kit/examples/sample-deal/*`); property "845 S Kenmore Ave", price "12,500,000"; click **Build my OM**; watch the progress feed (expect several minutes).

- [ ] **Step 4: Judge the output like an analyst** — download the `.pptx`; convert first pages to PNG (`python3 kit/scripts/export_pdf.py` then render, or open via `soffice --headless --convert-to pdf`) and Read them: real Koreatown map with street names + attribution, tables populated from the sample CSVs, `[TBD]` only where sample data is genuinely absent, zero invented figures. Run **Verify** from the UI and confirm the audit report streams.

- [ ] **Step 5: Fix–rebuild loop** — any defect: fix in `projects/om-builder/`, re-run `build.sh`, repeat from Step 1. Common expected issues to check deliberately: bundled python not found on agent PATH (launcher PATH export), skills not discovered (settingSources/cwd ancestry), SDK cli spawn failing under the portable node.

- [ ] **Step 6: Cleanup + commit fixes**

```bash
agent-browser close --all
kill %1 2>/dev/null; rm -rf /tmp/om-e2e   # and delete any screenshots
git add -A projects/om-builder && git commit -m "fix(om-builder): E2E hardening from Mac artifact run"
```

---

## Task 10: Gumroad handoff + link swap + docs

**Files:**
- Possibly modify: `frontend/src/components/projects/guide-content.ts` (GUMROAD_URL)

- [ ] **Step 1: Hand the operator the upload package** — tell them: create a Gumroad product at slug `om-builder`, price **$0+** (pay-what-you-want), attach `dist/OM-Builder-Mac.zip` + `dist/OM-Builder-Windows.zip`, description text can be lifted from the /projects/om-builder Panel B copy. Ask for the final product URL.

- [ ] **Step 2: Swap the URL if it differs** from `https://fintok.gumroad.com/l/om-builder`; run frontend gates; single push; after deploy, click the CTA on production and confirm it lands on the live Gumroad product.

- [ ] **Step 3: Close the arc in docs** — update `docs/STATE.md` §11.461 banner to SHIPPED/VERIFIED with evidence; append the ledger entry (what shipped, E2E evidence, known limits: Windows zip build-verified only, binaries unsigned).

---

## Self-Review (done at plan time)

- **Spec coverage:** middleware (T1), index (T3), project page + guide + CTA (T2/T4), production verification incl. public-access proof (T5), server+UI (T6), launchers/env/README (T7), build+vendoring (T8), E2E (T9), Gumroad + link + docs (T10). Windows-artifact limitation carried into T10 docs. ✓
- **Type consistency:** `PromptBlock({label,text})` matches T2 test and T4 usage; `GUIDE_STEPS`/`GITHUB_URL`/`GUMROAD_URL` names consistent across T2/T4/T10; server exports match test imports. ✓
- **Known open judgment points** are explicitly assigned to implementers (Task 8 a–c) rather than silently unresolved. ✓
