# OM Builder Research Suite (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three on-demand research actions (property search, comp analysis, market research) plus a TBD-fill loop in the OM Builder bundle — web research on the buyer's own Anthropic key, sourced briefs in the UI, findings woven into the OM build with citations.

**Architecture:** Everything lives in the wrapper: `server.js` gains research prompt templates, a `runResearch()` runner (reusing the existing `runAgent()` phase machinery with a max-turns cap and abort timeout), and two routes (`POST /api/research`, `GET /api/research`). The build prompt gains a conditional "research bridge" block when findings exist on disk. `index.html` gains an address field, a research panel with three action cards, a markdown brief viewer, and a TBD research/rebuild offer. The vendored kit is never touched.

**Tech Stack:** Node stdlib http + `@anthropic-ai/claude-agent-sdk` 0.3.206 (already installed — no new dependencies), vanilla HTML/CSS/JS UI, `node --test` for tests.

**Spec:** `docs/research-suite-design.md`. **Branch:** `research-suite`. **App dir:** `om-builder/app/`.

## Global Constraints

- The vendored kit stays **byte-identical**: never modify anything under `om-builder/` outside `app/`, and nothing under `kit/` or `workspace/.claude/skills/` (those exist only in built bundles anyway).
- No new npm dependencies; no CDN resources; no framework. UI stays one file (`app/public/index.html`), ES5-style `var`/`function` code like the existing script.
- Model stays `claude-opus-4-8` via the existing `agentOptions()`; the environment seal (mcpServers `{}`, strictMcpConfig, settingSources `["project"]`, CLAUDE_CONFIG_DIR relocation, auto-memory off) applies to research runs unchanged.
- Server binds `127.0.0.1` only; every JSON-body POST goes through `requireJson()` (CSRF guard).
- Copy honesty: no invented cost numbers anywhere. Per-run cost comes from the SDK result message (`total_cost_usd`); static copy says research "bills your key" without a figure until E2E measures real ranges.
- Agent-written research files live only under `workspace/jobs/<id>/research/`: `<type>-brief.md` + `<type>-findings.json`, types `property | comps | market | tbd`.
- Briefs quote web content: the UI must escape HTML before rendering markdown (XSS).
- Tests: `cd om-builder/app && npm test` (Node's built-in runner discovers `test/*.test.js`). All commits on branch `research-suite`.

---

### Task 1: Research prompt templates + request validation

**Files:**
- Modify: `om-builder/app/server.js` (add constants + two functions after `buildPrompt`, ~line 56; extend `module.exports`)
- Test: `om-builder/app/test/server-helpers.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `researchPrompt(type, address) -> string` (throws on unknown type / blank address); `validateResearchRequest(body) -> {ok:true, type, address} | {ok:false, error}`; `RESEARCH_TYPES` object with keys `property, comps, market, tbd`, each `{ intro: string, prompt: (address) => string }`. Later tasks rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `om-builder/app/test/server-helpers.test.js` (add `researchPrompt`, `validateResearchRequest` to the require list at the top):

```js
test("researchPrompt embeds the address and the output contract for every type", () => {
  const addr = "845 S Kenmore Ave, Los Angeles, CA 90005";
  for (const type of ["property", "comps", "market", "tbd"]) {
    const p = researchPrompt(type, addr);
    assert.ok(p.includes(addr), `${type} includes the address`);
    assert.ok(p.includes(`research/${type}-brief.md`), `${type} names its brief file`);
    assert.ok(p.includes(`research/${type}-findings.json`), `${type} names its findings file`);
    assert.ok(p.includes("## Sources"), `${type} demands a sources section`);
    assert.ok(p.includes('"confidence"'), `${type} demands confidence ratings`);
    assert.ok(p.includes("never state a figure without a source URL"), `${type} carries the honesty rule`);
    assert.ok(p.includes("do not rely on memory"), `${type} forbids from-memory facts`);
  }
});

test("researchPrompt per-type content", () => {
  const addr = "845 S Kenmore Ave, Los Angeles, CA 90005";
  assert.ok(researchPrompt("property", addr).includes("sale and listing history"));
  assert.ok(researchPrompt("property", addr).includes("owner of record"));
  const comps = researchPrompt("comps", addr);
  assert.ok(comps.includes("$/unit") && comps.includes("$/SF") && comps.includes("cap rate"));
  assert.ok(comps.includes("markdown table"));
  const market = researchPrompt("market", addr);
  assert.ok(market.includes("Last 30 days"));
  assert.ok(market.includes("vacancy") && market.includes("supply pipeline"));
  const tbd = researchPrompt("tbd", addr);
  assert.ok(tbd.includes("[TBD]"));
  assert.ok(tbd.includes("python-pptx"));
});

test("researchPrompt rejects unknown types and blank addresses", () => {
  assert.throws(() => researchPrompt("weather", "somewhere"));
  assert.throws(() => researchPrompt("property", ""));
  assert.throws(() => researchPrompt("property", "   "));
  assert.throws(() => researchPrompt("property", undefined));
});

test("validateResearchRequest gates type and address", () => {
  assert.deepStrictEqual(
    validateResearchRequest({ type: "comps", address: " 1 Main St " }),
    { ok: true, type: "comps", address: "1 Main St" }
  );
  assert.strictEqual(validateResearchRequest({ type: "weather", address: "x" }).ok, false);
  assert.strictEqual(validateResearchRequest({ type: "property", address: "" }).ok, false);
  assert.strictEqual(validateResearchRequest({ type: "property" }).ok, false);
  assert.strictEqual(validateResearchRequest({}).ok, false);
  // prototype names must not pass the type check
  assert.strictEqual(validateResearchRequest({ type: "toString", address: "x" }).ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd om-builder/app && npm test`
Expected: FAIL — `researchPrompt is not a function` (require pulls `undefined`).

- [ ] **Step 3: Implement**

In `om-builder/app/server.js`, insert after the `buildPrompt` function (line 55):

```js
// ---- research suite (spec: docs/research-suite-design.md) ----
// Web research on the buyer's own key. Output contract: exactly two files in
// research/, one human brief + one structured findings file the build bridge
// consumes. The honesty rules mirror the kit's [TBD] discipline.
function researchContract(type) {
  return (
    "\n\nWrite your results as exactly two files inside a research/ folder in the current directory:\n" +
    `1. research/${type}-brief.md — a readable brief for a commercial real-estate broker. End it with a '## Sources' section listing every source you used as a markdown link, each with the date the information is from.\n` +
    `2. research/${type}-findings.json — a JSON array where each element is {"field": string, "value": string or number, "unit": string, "source_url": string, "as_of": string, "confidence": "high"|"medium"|"low"}.\n` +
    "Rules: never state a figure without a source URL; label estimates as estimates; if you cannot find something, say so plainly in the brief instead of approximating. " +
    "Use web search for all facts about this specific property and market — do not rely on memory for them."
  );
}

const RESEARCH_TYPES = {
  property: {
    intro: "Researching the property…",
    prompt: (address) =>
      `Research the property at ${address} using web search. Find: sale and listing history with dates and ` +
      "prices, unit mix and building size, year built, owner of record where public, zoning, and any news " +
      "mentions of the property.",
  },
  comps: {
    intro: "Finding comparable sales and rents…",
    prompt: (address) =>
      `Research comparables for the subject property at ${address} using web search: recent comparable sales ` +
      "and rent comps in the same submarket. For each comp give the address, sale or listing date, price, " +
      "$/unit, $/SF, cap rate where reported, and approximate distance from the subject. Present the comps as " +
      "a markdown table in the brief, followed by a short narrative of what they suggest about the subject.",
  },
  market: {
    intro: "Researching the market…",
    prompt: (address) =>
      `Research the submarket around ${address} using web search. Cover the fundamentals: asking rents and ` +
      "rent trends, vacancy, demographics (population and incomes), major employers, and the supply pipeline " +
      "(projects under construction or proposed). Then add a '## Last 30 days' section covering recent news " +
      "relevant to this submarket — transactions, openings and closures, policy changes, anything a broker " +
      "writing an OM should know happened recently.",
  },
  tbd: {
    intro: "Hunting down the deck's missing numbers…",
    prompt: (address) =>
      `The current folder contains a built .pptx offering memorandum for the property at ${address}, plus the ` +
      "deal documents it was built from. First open the deck (python-pptx is available) and list every [TBD] " +
      "marker with the slide it sits on and what value it stands in for. Then research JUST those missing " +
      "items using web search. In the brief, give one section per [TBD] with what you found, or a plain " +
      "statement that it could not be found.",
  },
};

function researchPrompt(type, address) {
  const def = Object.prototype.hasOwnProperty.call(RESEARCH_TYPES, type) ? RESEARCH_TYPES[type] : null;
  if (!def) throw new Error(`unknown research type: ${type}`);
  const addr = String(address || "").trim();
  if (!addr) throw new Error("address required");
  return def.prompt(addr) + researchContract(type);
}

// Pure request gate for POST /api/research — factored out so the 400 paths
// are unit-testable without a live server (same pattern as isValidKeyPrefix).
function validateResearchRequest(body) {
  const type = String((body && body.type) || "");
  if (!Object.prototype.hasOwnProperty.call(RESEARCH_TYPES, type)) return { ok: false, error: "unknown research type" };
  const address = String((body && body.address) || "").trim();
  if (!address) return { ok: false, error: "enter the property address first" };
  return { ok: true, type, address };
}
```

Add to `module.exports` (line 383): `researchPrompt, validateResearchRequest, RESEARCH_TYPES,`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd om-builder/app && npm test`
Expected: PASS (all existing tests + 4 new).

- [ ] **Step 5: Commit**

```bash
git add om-builder/app/server.js om-builder/app/test/server-helpers.test.js
git commit -m "feat(om-builder): research prompt templates + request validation"
```

---

### Task 2: Findings helpers — parse and detect

**Files:**
- Modify: `om-builder/app/server.js` (add two functions after `validateResearchRequest`; extend `module.exports`)
- Test: `om-builder/app/test/server-helpers.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseFindings(text) -> Array | null` (null = malformed / not an array); `hasResearchFindings(jobDir) -> boolean` (true iff `jobDir/research/` contains at least one `*-findings.json`). Task 3's bridge and Task 4's cleanup rely on these exact names.

- [ ] **Step 1: Write the failing tests**

Append to the test file (add `os` require at top: `const os = require("node:os");` and `const fs = require("node:fs");`; add `parseFindings, hasResearchFindings` to the require list):

```js
test("parseFindings returns the array or null — never throws", () => {
  assert.deepStrictEqual(parseFindings('[{"field":"vacancy","value":4.2}]'), [{ field: "vacancy", value: 4.2 }]);
  assert.deepStrictEqual(parseFindings("[]"), []);
  assert.strictEqual(parseFindings("{not json"), null);
  assert.strictEqual(parseFindings('{"field":"x"}'), null, "an object is not a findings array");
  assert.strictEqual(parseFindings('"hello"'), null);
  assert.strictEqual(parseFindings(""), null);
});

test("hasResearchFindings detects findings files and nothing else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omb-research-"));
  try {
    assert.strictEqual(hasResearchFindings(dir), false, "no research/ dir");
    fs.mkdirSync(path.join(dir, "research"));
    assert.strictEqual(hasResearchFindings(dir), false, "empty research/ dir");
    fs.writeFileSync(path.join(dir, "research", "market-brief.md"), "# brief");
    assert.strictEqual(hasResearchFindings(dir), false, "a brief alone is not findings");
    fs.writeFileSync(path.join(dir, "research", "market-findings.json"), "[]");
    assert.strictEqual(hasResearchFindings(dir), true, "one findings file is enough");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd om-builder/app && npm test`
Expected: FAIL — `parseFindings is not a function`.

- [ ] **Step 3: Implement**

Insert after `validateResearchRequest` in `server.js`:

```js
// A findings file is only trustworthy if it parses to a JSON array. Anything
// else — truncated write from an aborted run, an object, prose — returns null
// so callers treat the file as absent.
function parseFindings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  return Array.isArray(data) ? data : null;
}

// The build bridge switches on this: any *-findings.json under research/
// means a build should be told to use the research.
function hasResearchFindings(jobDir) {
  try {
    return fs.readdirSync(path.join(jobDir, "research")).some((f) => f.endsWith("-findings.json"));
  } catch {
    return false; // no research/ dir — the common case
  }
}
```

Add to `module.exports`: `parseFindings, hasResearchFindings,`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd om-builder/app && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add om-builder/app/server.js om-builder/app/test/server-helpers.test.js
git commit -m "feat(om-builder): findings parse + detection helpers"
```

---

### Task 3: Build-prompt research bridge

**Files:**
- Modify: `om-builder/app/server.js:52-55` (`buildPrompt`) plus a new constant above it
- Test: `om-builder/app/test/server-helpers.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildPrompt(userText, withResearch)` — second param optional; `true` appends the bridge block after the guardrails. Existing single-arg callers and tests keep working. Task 4's `/api/build` handler calls `buildPrompt(prompt, hasResearchFindings(jobDir))`.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```js
test("buildPrompt appends the research bridge only when asked", () => {
  const withR = buildPrompt("Build my OM", true);
  assert.ok(withR.includes("research/ folder"));
  assert.ok(withR.includes("deal documents always win"));
  assert.ok(withR.includes("Sources & Data Notes"));
  assert.ok(withR.includes("confidence is high"));
  assert.ok(withR.startsWith("Build my OM"), "buyer text still leads");
  assert.ok(withR.includes("[TBD] marker, never a guess"), "guardrails still present");
  const without = buildPrompt("Build my OM", false);
  assert.ok(!without.includes("Sources & Data Notes"));
  const oneArg = buildPrompt("Build my OM");
  assert.ok(!oneArg.includes("Sources & Data Notes"), "single-arg call unchanged");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd om-builder/app && npm test`
Expected: FAIL — `withR.includes("research/ folder")` is false.

- [ ] **Step 3: Implement**

In `server.js`, add above `buildPrompt` (verbatim bridge text from the spec):

```js
// Appended to the build prompt ONLY when research findings exist in the job
// dir. Deal docs beat web research; researched figures are always cited; a
// [TBD] only falls to a high-confidence finding. (Spec: build integration.)
const RESEARCH_BRIDGE =
  "\n\nResearch briefs exist in the research/ folder (research/*-brief.md with matching *-findings.json). " +
  "Use them to fill gaps the deal documents don't cover — the deal documents always win when they conflict. " +
  "Every researched figure used in the deck must be cited: add a final 'Sources & Data Notes' slide listing " +
  "each researched figure, its source, and its as-of date. Only replace a [TBD] with a researched figure whose " +
  "confidence is high; otherwise keep the [TBD].";
```

Change `buildPrompt` to:

```js
function buildPrompt(userText, withResearch) {
  const text = String(userText || "").trim();
  return (text || DEFAULT_BUILD_INSTRUCTION) + BUILD_GUARDRAILS + (withResearch ? RESEARCH_BRIDGE : "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd om-builder/app && npm test`
Expected: PASS — including all pre-existing `buildPrompt` tests untouched.

- [ ] **Step 5: Commit**

```bash
git add om-builder/app/server.js om-builder/app/test/server-helpers.test.js
git commit -m "feat(om-builder): build prompt gains conditional research bridge"
```

---

### Task 4: Research runner + routes

**Files:**
- Modify: `om-builder/app/server.js` — `runAgent` (line 177), `describeToolUse` (line 165), the 404 guard (line 286), `/api/build` handler (line 298), new `runResearch` + two routes

**Interfaces:**
- Consumes: `researchPrompt`, `RESEARCH_TYPES`, `validateResearchRequest`, `parseFindings`, `hasResearchFindings` (Tasks 1–2), `buildPrompt(text, withResearch)` (Task 3).
- Produces: `POST /api/research` body `{job, type, address}` → `{ok:true}` | 400/404/409; `GET /api/research?job=<id>&type=<t>` → `{brief: string|null, findings: Array|null, usable: boolean}`; SSE cost line `"That run billed about $X.XX to your key."` on every successful agent phase; `runAgent` returns a boolean and resets the job's event log at start.

- [ ] **Step 1: Upgrade `runAgent` — per-phase options, success return, cost line, event reset**

Replace the `runAgent` function (lines 177–215) with:

```js
// Runs one or more sequential agent phases in the same job dir. `phases` is
// an array of { intro?: string, prompt: string, options?: object } — options
// defaults to the sealed agentOptions(jobDir); research passes an override
// with maxTurns + an abort timer. Returns true when every phase succeeded.
async function runAgent(jobId, phases) {
  const job = jobs.get(jobId);
  const jobDir = path.join(JOBS, jobId);
  job.running = true;
  // Each run owns the progress feed: without this, a new EventSource replay
  // (line ~332) would prepend every PREVIOUS run's events to this run's log.
  job.events = [];
  let failed = false;
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    for (const phase of phases) {
      if (phase.intro) emit(job, "line", phase.intro);
      // agentOptions() carries the environment seal: the agent sees only the
      // bundle's skills — no MCP servers or external settings from the
      // buyer's machine.
      const q = query({ prompt: phase.prompt, options: phase.options || agentOptions(jobDir) });
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
          if (msg.is_error) {
            emit(job, "error", msg.result || "The build hit an error.");
            failed = true;
          } else if (typeof msg.total_cost_usd === "number" && msg.total_cost_usd > 0) {
            // Real cost from the SDK — the only honest number we can show.
            emit(job, "line", `That run billed about $${msg.total_cost_usd.toFixed(2)} to your key.`);
          }
        }
      }
      if (failed) break; // never run a later phase on top of a failed one
    }
    if (!failed) emit(job, "done", "Done.");
  } catch (err) {
    emit(job, "error", `Something went wrong: ${err.message}`);
    failed = true;
  } finally {
    job.running = false;
  }
  return !failed;
}
```

- [ ] **Step 2: Add `runResearch` below `runAgent`**

```js
// Research guardrails: generous enough for a real multi-search pass, tight
// enough to stop a runaway before it burns the buyer's key for an hour.
const RESEARCH_MAX_TURNS = 150;
const RESEARCH_TIMEOUT_MS = 20 * 60 * 1000;

async function runResearch(jobId, type, address) {
  const jobDir = path.join(JOBS, jobId);
  fs.mkdirSync(path.join(jobDir, "research"), { recursive: true });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), RESEARCH_TIMEOUT_MS);
  const def = RESEARCH_TYPES[type];
  const options = { ...agentOptions(jobDir), maxTurns: RESEARCH_MAX_TURNS, abortController: ac };
  let ok = false;
  try {
    ok = await runAgent(jobId, [{ intro: def.intro, prompt: researchPrompt(type, address), options }]);
  } finally {
    clearTimeout(timer);
    if (!ok) {
      // A failed/aborted run must not leave a half-written findings file for
      // a later build to trust. Only a MALFORMED file is deleted — an intact
      // one is either the completed new run or a previous good run.
      const f = path.join(jobDir, "research", `${type}-findings.json`);
      try {
        if (fs.existsSync(f) && parseFindings(fs.readFileSync(f, "utf8")) === null) fs.rmSync(f);
      } catch {}
    }
  }
}
```

- [ ] **Step 3: Friendly tool lines for web research**

In `describeToolUse` (line 165), add before the final `return null;`:

```js
  if (name === "WebSearch") return `Searching the web: ${String(input?.query || "").slice(0, 80)}…`;
  if (name === "WebFetch") return "Reading a source page…";
```

- [ ] **Step 4: Exempt `/api/research` from the unknown-job guard**

Line 286 — the POST carries `job` in the body (like `/api/build`), so change:

```js
  if (!job && url.pathname.startsWith("/api/") && url.pathname !== "/api/build" && url.pathname !== "/api/verify" && url.pathname !== "/api/research") {
```

- [ ] **Step 5: Wire the research routes and the build bridge**

Insert after the `/api/build`|`/api/verify` block (after line 325):

```js
  if (req.method === "POST" && url.pathname === "/api/research") {
    if (!requireJson(req, res)) return;
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        return json(res, 400, { error: "bad request body" });
      }
      const j = jobs.get(parsed.job);
      if (!j) return json(res, 404, { error: "unknown job" });
      if (j.running) return json(res, 409, { error: "already running" });
      const v = validateResearchRequest(parsed);
      if (!v.ok) return json(res, 400, { error: v.error });
      runResearch(parsed.job, v.type, v.address);
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/research") {
    if (!job) return json(res, 404, { error: "unknown job" });
    const t = url.searchParams.get("type") || "";
    if (!Object.prototype.hasOwnProperty.call(RESEARCH_TYPES, t)) return json(res, 400, { error: "unknown research type" });
    const dir = path.join(JOBS, jobId, "research");
    let brief = null;
    let findings = null;
    try {
      brief = fs.readFileSync(path.join(dir, `${t}-brief.md`), "utf8");
    } catch {}
    try {
      findings = parseFindings(fs.readFileSync(path.join(dir, `${t}-findings.json`), "utf8"));
    } catch {}
    return json(res, 200, { brief, findings, usable: !!(brief && findings) });
  }
```

In the `/api/build` handler (line 313–320), change the build phase line to consume the bridge:

```js
      let phases;
      if (url.pathname === "/api/verify") {
        phases = [{ prompt: VERIFY_PROMPT }];
      } else {
        // Prompt is optional — buildPrompt() supplies a sane default when
        // the buyer leaves it blank. The research bridge rides along only
        // when findings actually exist on disk.
        phases = [{ prompt: buildPrompt(prompt, hasResearchFindings(path.join(JOBS, id))) }];
      }
```

- [ ] **Step 6: Run the unit suite**

Run: `cd om-builder/app && npm test`
Expected: PASS (nothing in Tasks 1–3 regressed; `runAgent`/routes have no unit tests — wiring is verified next step, agent behavior in Task 7).

- [ ] **Step 7: Smoke-check the routes keylessly (validation paths only — no billing)**

```bash
cd om-builder/app && OM_PORT=3232 node server.js &
sleep 1
curl -s -X POST http://127.0.0.1:3232/api/research -H 'content-type: text/plain' -d '{}'
# → {"error":"expected application/json"}
curl -s -X POST http://127.0.0.1:3232/api/research -H 'content-type: application/json' -d '{"job":"nope","type":"property","address":"x"}'
# → {"error":"unknown job"}
JOB=$(curl -s -X POST http://127.0.0.1:3232/api/job | python3 -c 'import sys,json;print(json.load(sys.stdin)["job"])')
curl -s -X POST http://127.0.0.1:3232/api/research -H 'content-type: application/json' -d "{\"job\":\"$JOB\",\"type\":\"weather\",\"address\":\"x\"}"
# → {"error":"unknown research type"}
curl -s -X POST http://127.0.0.1:3232/api/research -H 'content-type: application/json' -d "{\"job\":\"$JOB\",\"type\":\"property\",\"address\":\"\"}"
# → {"error":"enter the property address first"}
curl -s "http://127.0.0.1:3232/api/research?job=$JOB&type=property"
# → {"brief":null,"findings":null,"usable":false}
curl -s "http://127.0.0.1:3232/api/research?job=$JOB&type=bogus"
# → {"error":"unknown research type"}
kill %1
```

Expected: each response exactly as commented.

- [ ] **Step 8: Commit**

```bash
git add om-builder/app/server.js
git commit -m "feat(om-builder): research runner + /api/research routes, per-run cost line"
```

---

### Task 5: UI — address field, research panel, brief viewer

**Files:**
- Modify: `om-builder/app/public/index.html` (CSS block, HTML sections, script)

**Interfaces:**
- Consumes: `POST /api/research` `{job, type, address}`; `GET /api/research?job&type` → `{brief, findings, usable}`; SSE events unchanged.
- Produces: DOM ids used by Task 6: `addressInput`, `researchProgress`, `researchLines`, `researchDetails`, `researchError`, `briefTabs`, `briefView`; JS functions `startResearch(type)`, `fetchBrief(type)`, `startBuild()`, `updateBuildGate()` (extended), `attachProgress(opts)` (parameterized).

- [ ] **Step 1: Add CSS**

Insert before the `@media (prefers-color-scheme: dark)` block (line 375):

```css
  /* ---- research suite ---- */
  .address-input {
    width: 100%;
    font-family: inherit;
    font-size: 1.05rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.6rem;
    background: #fffdf9;
    color: var(--ink);
    margin-bottom: 1rem;
  }
  .address-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .research-actions { display: flex; flex-direction: column; gap: 0.85rem; }
  .research-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--accent-soft-2);
    border: 1px solid var(--line);
    border-radius: 0.8rem;
    padding: 1rem 1.25rem;
  }
  .research-info { flex: 1 1 auto; min-width: 0; }
  .research-name { font-weight: 800; }
  .research-desc { color: var(--ink-soft); font-size: 0.92rem; margin-top: 0.15rem; }
  .research-card button {
    width: auto;
    min-width: 6.5rem;
    margin-top: 0;
    flex-shrink: 0;
    font-size: 1rem;
    min-height: 46px;
  }
  .brief-tabs { display: flex; gap: 0.5rem; margin-top: 1.2rem; flex-wrap: wrap; }
  .brief-tab {
    width: auto;
    min-height: 40px;
    margin-top: 0;
    padding: 0.45rem 1rem;
    font-size: 0.95rem;
    background: #fff;
    color: var(--accent);
    border: 2px solid var(--line);
    box-shadow: none;
  }
  .brief-tab.active { border-color: var(--accent); background: var(--accent-soft); }
  .brief-view {
    display: none;
    margin-top: 0.9rem;
    border: 1px solid var(--line);
    border-radius: 0.8rem;
    padding: 1.1rem 1.25rem;
    background: #fffdf9;
    font-size: 0.98rem;
    overflow-x: auto;
  }
  .brief-view.show { display: block; }
  .brief-view h3, .brief-view h4, .brief-view h5 { margin: 1.1rem 0 0.4rem; }
  .brief-view h3:first-child { margin-top: 0; }
  .brief-view p { margin: 0.5rem 0; }
  .brief-view ul { margin: 0.5rem 0; padding-left: 1.4rem; }
  .brief-view a { color: var(--accent); }
  .brief-view table { border-collapse: collapse; margin: 0.75rem 0; width: 100%; }
  .brief-view th, .brief-view td { border: 1px solid var(--line); padding: 0.45rem 0.6rem; text-align: left; font-size: 0.92rem; }
  .brief-view th { background: var(--accent-soft-2); }
  .brief-warning {
    background: var(--bad-bg);
    color: var(--bad);
    border-radius: 0.5rem;
    padding: 0.6rem 0.9rem;
    font-weight: 600;
  }
```

And inside the existing dark-mode block, add:

```css
    .address-input, .brief-view { background: #221c16; color: var(--ink); }
    .research-card { background: #241e17; }
    .brief-tab { background: #2a231c; }
```

- [ ] **Step 2: Add the research panel + renumber steps**

Insert after the step-1 panel's closing `</section>` (line 458):

```html
    <section class="panel">
      <h2><span class="step-num">2</span>Let it research the property <span style="font-weight:400;color:var(--ink-soft);font-size:1rem;">(optional)</span></h2>
      <p class="helper">Missing comps or market data? Give it the address and it researches the web — every figure comes back with its source. Whatever it finds feeds your build automatically.</p>
      <input id="addressInput" class="address-input" type="text" placeholder="Property address — e.g. 845 S Kenmore Ave, Los Angeles, CA 90005" aria-label="Property address" />
      <div class="research-actions">
        <div class="research-card">
          <div class="research-info">
            <div class="research-name">Property search</div>
            <div class="research-desc">Sale &amp; listing history, unit mix, owner of record, zoning, news mentions.</div>
          </div>
          <button type="button" class="research-btn secondary" data-type="property" disabled>Run</button>
        </div>
        <div class="research-card">
          <div class="research-info">
            <div class="research-name">Comp analysis</div>
            <div class="research-desc">Recent sale and rent comps nearby — $/unit, $/SF, cap rates, distances.</div>
          </div>
          <button type="button" class="research-btn secondary" data-type="comps" disabled>Run</button>
        </div>
        <div class="research-card">
          <div class="research-info">
            <div class="research-name">Market research</div>
            <div class="research-desc">Rents, vacancy, demographics, employers, pipeline — plus the last 30 days of local news.</div>
          </div>
          <button type="button" class="research-btn secondary" data-type="market" disabled>Run</button>
        </div>
      </div>
      <div id="researchProgress" class="progress">
        <div id="researchLines"></div>
        <details>
          <summary>Show the technical details</summary>
          <div id="researchDetails"></div>
        </details>
      </div>
      <div id="researchError" class="error-box"></div>
      <div id="briefTabs" class="brief-tabs"></div>
      <div id="briefView" class="brief-view"></div>
      <p class="fine-print">Each research run bills your Anthropic key and shows its exact cost in the feed when it finishes.</p>
    </section>
```

Renumber the two later panels: `<span class="step-num">2</span>Anything it should know?` → `3`, and `<span class="step-num">3</span>Download` → `4`.

- [ ] **Step 3: Parameterize the progress machinery**

In the script, replace `addProgressLine`, `addDetailLine`, and `attachProgress` with container-aware versions, and refactor the build listener into `startBuild()`:

```js
  function addProgressLine(container, text, spinning, kind) {
    var existing = container.querySelectorAll(".progress-line");
    existing.forEach(function (el) {
      el.classList.add("past");
      el.classList.remove("latest");
      var oldSpinner = el.querySelector(".spinner");
      if (oldSpinner) oldSpinner.remove();
    });
    var row = document.createElement("div");
    row.className = "progress-line latest" + (kind === "done" ? " done" : "");
    if (spinning) {
      var sp = document.createElement("div");
      sp.className = "spinner";
      row.appendChild(sp);
    } else if (kind === "done") {
      var icon = document.createElement("div");
      icon.innerHTML = checkIconSVG();
      row.appendChild(icon.firstChild);
    }
    var span = document.createElement("span");
    span.textContent = text;
    row.appendChild(span);
    container.appendChild(row);
  }

  function addDetailLine(container, text) {
    var row = document.createElement("div");
    row.className = "detail-line";
    row.textContent = text;
    container.appendChild(row);
  }

  // opts: { lines, details, errorBox, doneText, onDone }
  function attachProgress(opts) {
    if (currentSource) currentSource.close();
    var src = new EventSource("/api/progress?job=" + encodeURIComponent(jobId));
    currentSource = src;
    src.onmessage = function (evt) {
      var data;
      try { data = JSON.parse(evt.data); } catch (e) { return; }
      if (data.kind === "line") {
        addProgressLine(opts.lines, data.text, true);
        if (data.text.indexOf("[TBD]") !== -1) sawTBD = true;
      } else if (data.kind === "detail") {
        addDetailLine(opts.details, data.text);
      } else if (data.kind === "error") {
        opts.errorBox.textContent = data.text;
        opts.errorBox.classList.add("show");
        src.close();
        running = false;
        updateBuildGate();
      } else if (data.kind === "done") {
        addProgressLine(opts.lines, opts.doneText, false, "done");
        src.close();
        running = false;
        updateBuildGate();
        if (opts.onDone) opts.onDone();
      }
    };
    src.onerror = function () {};
  }
```

Update the two existing callers: the build flow becomes a named function wired to the button —

```js
  function startBuild() {
    if (running || !jobId) return;
    resetProgressUI();
    running = true; // stays true until the SSE feed says done/error
    updateBuildGate();
    fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job: jobId, prompt: promptInput.value.trim() }),
    }).then(function (r) {
      if (!r.ok) throw new Error("build request failed");
      attachProgress({
        lines: progressLines,
        details: detailLines,
        errorBox: errorBox,
        doneText: "All set — your deck is ready below.",
        onDone: fetchOutputs,
      });
    }).catch(function () {
      running = false;
      updateBuildGate();
      errorBox.textContent = "Couldn't start the build. Please try again.";
      errorBox.classList.add("show");
    });
  }
  buildBtn.addEventListener("click", function () {
    if (buildBtn.disabled) return;
    startBuild();
  });
```

and the verify listener's `attachProgress()` call becomes:

```js
      attachProgress({
        lines: progressLines,
        details: detailLines,
        errorBox: errorBox,
        doneText: "Check finished — details above.",
        onDone: fetchOutputs,
      });
```

- [ ] **Step 4: Research state, gating, actions, brief viewer**

Add element refs and state near the top of the IIFE (after the existing `var` block):

```js
  var addressInput = document.getElementById("addressInput");
  var researchProgress = document.getElementById("researchProgress");
  var researchLines = document.getElementById("researchLines");
  var researchDetails = document.getElementById("researchDetails");
  var researchError = document.getElementById("researchError");
  var briefTabs = document.getElementById("briefTabs");
  var briefView = document.getElementById("briefView");
  var researchBtns = Array.prototype.slice.call(document.querySelectorAll(".research-btn"));
  var briefs = {};           // type -> {brief, findings, usable}
  var shownBrief = null;
  var currentResearchType = null;
  var RESEARCH_LABELS = { property: "Property", comps: "Comps", market: "Market", tbd: "TBD hunt" };
```

Extend `updateBuildGate` (keep the existing two lines, add research gating):

```js
  function updateBuildGate() {
    // Prompt is optional — files in, OM out. Gate is key + at least one file.
    var ready = !running && keyPresent && uploadedFiles.length > 0;
    buildBtn.disabled = !ready;
    verifyBtn.disabled = running;
    // Research needs only key + address — a broker can research before
    // uploading a single document.
    var researchReady = !running && keyPresent && !!addressInput.value.trim();
    researchBtns.forEach(function (b) { b.disabled = !researchReady; });
  }
  addressInput.addEventListener("input", updateBuildGate);
```

Add the research flow functions:

```js
  function resetResearchUI() {
    researchLines.innerHTML = "";
    researchDetails.innerHTML = "";
    researchError.classList.remove("show");
    researchError.textContent = "";
    researchProgress.classList.add("show");
  }

  function startResearch(type) {
    if (running) return;
    var address = addressInput.value.trim();
    if (!address) return;
    resetResearchUI();
    running = true;
    currentResearchType = type;
    updateBuildGate();
    ensureJob().then(function (id) {
      return fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: id, type: type, address: address }),
      });
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (d) {
          throw new Error((d && d.error) || "research request failed");
        });
      }
      attachProgress({
        lines: researchLines,
        details: researchDetails,
        errorBox: researchError,
        doneText: "Research finished — the brief is below.",
        onDone: function () { fetchBrief(currentResearchType); },
      });
    }).catch(function (err) {
      running = false;
      updateBuildGate();
      researchError.textContent = (err && err.message) || "Couldn't start the research. Please try again.";
      researchError.classList.add("show");
    });
  }
  researchBtns.forEach(function (b) {
    b.addEventListener("click", function () { startResearch(b.getAttribute("data-type")); });
  });

  function fetchBrief(type) {
    fetch("/api/research?job=" + encodeURIComponent(jobId) + "&type=" + encodeURIComponent(type))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.brief) return;
        briefs[type] = data;
        showBrief(type);
      })
      .catch(function () {});
  }

  function renderBriefTabs() {
    briefTabs.innerHTML = "";
    Object.keys(RESEARCH_LABELS).forEach(function (t) {
      if (!briefs[t]) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "brief-tab" + (t === shownBrief ? " active" : "");
      b.textContent = RESEARCH_LABELS[t];
      b.addEventListener("click", function () { showBrief(t); });
      briefTabs.appendChild(b);
    });
  }

  function showBrief(type) {
    shownBrief = type;
    var data = briefs[type];
    briefView.innerHTML = "";
    if (data) {
      if (!data.usable) {
        var warn = document.createElement("p");
        warn.className = "brief-warning";
        warn.textContent = "Heads up: this run's data file couldn't be read, so a build won't use these findings. Re-run this research before building.";
        briefView.appendChild(warn);
      }
      var body = document.createElement("div");
      body.innerHTML = renderMarkdown(data.brief);
      briefView.appendChild(body);
      briefView.classList.add("show");
    }
    renderBriefTabs();
  }
```

- [ ] **Step 5: Add the markdown renderer (escape-first — briefs quote the open web)**

```js
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Tiny renderer for agent briefs: headings, bold, links, lists, tables,
  // paragraphs. Input is escaped FIRST so web-sourced text can never become
  // live HTML; only the tags this function emits exist in the output.
  function renderMarkdown(md) {
    var lines = String(md).split(/\r?\n/);
    var html = [];
    var listOpen = false;
    var tableRows = null;

    function inline(s) {
      s = escapeHtml(s);
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    }
    function closeList() {
      if (listOpen) { html.push("</ul>"); listOpen = false; }
    }
    function flushTable() {
      if (!tableRows || !tableRows.length) { tableRows = null; return; }
      var out = "<table><thead><tr>";
      tableRows[0].forEach(function (c) { out += "<th>" + inline(c) + "</th>"; });
      out += "</tr></thead><tbody>";
      for (var i = 1; i < tableRows.length; i++) {
        out += "<tr>";
        tableRows[i].forEach(function (c) { out += "<td>" + inline(c) + "</td>"; });
        out += "</tr>";
      }
      html.push(out + "</tbody></table>");
      tableRows = null;
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      if (/^\s*\|.*\|\s*$/.test(line)) {
        var cells = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); });
        var isSeparator = cells.every(function (c) { return /^:?-{2,}:?$/.test(c); });
        if (!isSeparator) {
          if (!tableRows) tableRows = [];
          tableRows.push(cells);
        }
        return;
      }
      flushTable();
      var h = /^(#{1,3})\s+(.*)$/.exec(line);
      if (h) {
        closeList();
        var level = h[1].length + 2; // # -> h3 inside the panel
        html.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
        return;
      }
      var li = /^[-*]\s+(.*)$/.exec(line);
      if (li) {
        if (!listOpen) { html.push("<ul>"); listOpen = true; }
        html.push("<li>" + inline(li[1]) + "</li>");
        return;
      }
      if (!line.trim()) { closeList(); return; }
      closeList();
      html.push("<p>" + inline(line) + "</p>");
    });
    flushTable();
    closeList();
    return html.join("");
  }
```

- [ ] **Step 6: Verify in the browser without billing**

```bash
cd om-builder/app && OM_PORT=3232 node server.js
```

Open `http://localhost:3232`. Check, in order:
1. Research panel shows as step 2 with three cards; later panels read 3 and 4.
2. Run buttons disabled. Paste dummy key `sk-ant-test123` in the key panel → Connect → type an address → Run buttons enable; clear the address → they disable.
3. Click a Run → progress appears in the RESEARCH panel; within ~a minute an error lands in the research error box (invalid key) — proving SSE targeting and the error path — and buttons re-enable.
4. Renderer + XSS check (renderMarkdown is IIFE-scoped and pure — test it directly): paste the entire `renderMarkdown` + `escapeHtml` function source into the DevTools console, then run `renderMarkdown('# T\n<img src=x onerror=alert(1)>\n**bold** and [x](https://example.com)\n| a | b |\n| --- | --- |\n| 1 | 2 |')`. The output string must contain `&lt;img` (escaped, not live), `<strong>bold</strong>`, `<a href="https://example.com"`, `<h3>T</h3>`, and one `<table>` with a `<th>`/`<td>` row — and no executable `<img` tag. Full in-app rendering of a real brief is verified in Task 7.
5. Dark mode (OS toggle or DevTools emulation): research cards, address input, brief view all legible.

- [ ] **Step 7: Commit**

```bash
git add om-builder/app/public/index.html
git commit -m "feat(om-builder): research panel UI — address, action cards, sourced brief viewer"
```

---

### Task 6: UI — TBD loop + footer copy

**Files:**
- Modify: `om-builder/app/public/index.html` (tbd-note block, script, footer)

**Interfaces:**
- Consumes: `startResearch("tbd")`, `startBuild()`, `updateBuildGate()`, `briefs`/`fetchBrief` from Task 5; `sawTBD` flag set by the SSE handler.
- Produces: the complete TBD offer → research → rebuild loop.

- [ ] **Step 1: Replace the static tbd-note**

Replace line 483 (`<div id="tbdNote" ...>...</div>`) with:

```html
      <div id="tbdNote" class="tbd-note">
        <span>Your deck has [TBD] spots — the tool refuses to invent numbers. Add the missing info to your documents and build again, or let it research the gaps (uses the address in step 2):</span>
        <button id="tbdResearchBtn" type="button" class="secondary" disabled>Research the missing info</button>
        <button id="rebuildBtn" type="button" style="display:none;">Rebuild with research</button>
      </div>
```

- [ ] **Step 2: Wire the loop in the script**

Add refs with the other `var`s: `var tbdResearchBtn = document.getElementById("tbdResearchBtn"); var rebuildBtn = document.getElementById("rebuildBtn");`

Extend `updateBuildGate()` — add at the end:

```js
    tbdResearchBtn.disabled = !researchReady;
    rebuildBtn.disabled = running;
```

Add listeners (after the researchBtns wiring):

```js
  tbdResearchBtn.addEventListener("click", function () {
    if (tbdResearchBtn.disabled) return;
    startResearch("tbd");
  });
  rebuildBtn.addEventListener("click", function () {
    if (rebuildBtn.disabled) return;
    startBuild();
  });
```

In `startResearch`'s `onDone` callback, reveal the rebuild button after a TBD hunt:

```js
        onDone: function () {
          fetchBrief(currentResearchType);
          if (currentResearchType === "tbd") rebuildBtn.style.display = "inline-block";
        },
```

- [ ] **Step 3: Footer copy**

Replace the footer line (line 488) with:

```html
    Each build bills your own Anthropic API key — typically a few dollars per OM. Research runs bill the same key and show their exact cost when they finish.
```

- [ ] **Step 4: Verify keylessly**

Restart `OM_PORT=3232 node server.js`, reload. The tbd-note is hidden by default (unchanged). In DevTools, force it visible (`document.getElementById('tbdNote').classList.add('show')`): both buttons render, "Research the missing info" is disabled until dummy key + address are set, "Rebuild with research" is hidden. Footer shows the new copy.

- [ ] **Step 5: Commit**

```bash
git add om-builder/app/public/index.html
git commit -m "feat(om-builder): TBD loop — research the gaps, rebuild with findings"
```

---

### Task 7: E2E with a real key + honest cost copy + docs

**CHECKPOINT — bills a real Anthropic key (operator-supplied). Get Ben's go-ahead and rough budget (~$10–20 total) before starting.**

**Files:**
- Modify: `om-builder/app/public/index.html` (only if measured costs justify better pre-run copy)
- Modify: `om-builder/HANDOFF.md`, `om-builder/README-buyer.html` (feature documentation)

**Interfaces:** consumes everything; produces the verified feature + honest measured copy.

- [ ] **Step 1: Stage a real deal.** Run the server (`OM_PORT=3232 node server.js`) with a real key connected. Upload Ben's 845 S Kenmore mock-deal documents (real LA address, docs on this Mac) — or the kit's sample deal plus a real address if Kenmore docs aren't at hand.
- [ ] **Step 2: Run all three research actions** (address: `845 S Kenmore Ave, Los Angeles, CA 90005`). For each: confirm live progress in the research panel, a brief renders with a `## Sources` section and working links, `workspace/jobs/<id>/research/<type>-brief.md` + `<type>-findings.json` exist, findings parse as an array with `source_url`/`as_of`/`confidence` on each element. Record each run's billed cost from the feed's cost line.
- [ ] **Step 3: Build.** Confirm the deck downloads, contains a "Sources & Data Notes" slide, researched figures carry sources, and numbers present in the deal docs were NOT overridden by web data.
- [ ] **Step 4: TBD loop.** If the deck has TBDs: run "Research the missing info", confirm `tbd-brief.md` lists each TBD, then "Rebuild with research" and confirm the TBD count drops only where high-confidence findings existed. If the deck has no TBDs, temporarily remove one input doc and rebuild to force some.
- [ ] **Step 5: Regression.** Fresh job, no research, normal build — behavior identical to pre-feature (no bridge text consequences, no new UI interference).
- [ ] **Step 6: Honest copy.** Using measured costs, update the research panel's fine-print (e.g. "typically $X–$Y per run" with real numbers) — only claims backed by the measurements.
- [ ] **Step 7: Docs.** HANDOFF.md: add the Research Suite to "The two halves"/facts (what it does, file contract, guardrail values). README-buyer.html: add a short "Let it research the property" section in the buyer's voice.
- [ ] **Step 8: Full test suite + commit**

```bash
cd om-builder/app && npm test
git add -A om-builder
git commit -m "feat(om-builder): research suite E2E-verified; measured cost copy + docs"
```

---

## Self-review notes

- **Spec coverage:** three actions (T1, T5), address field (T5), briefs+sources UI (T5), findings contract (T1), build bridge + conflict rule + endnote slide (T3, T4), TBD loop (T1 `tbd` type, T6), guardrails maxTurns/timeout (T4), failure cleanup of malformed findings only (T4), malformed-findings UI note (T5 `showBrief`), cost honesty via real `total_cost_usd` (T4) + measured copy (T7), unit tests (T1–T3) + keyless route smoke (T4) + E2E & regression (T7), docs (T7). No gaps found.
- **Event-log reset in `runAgent` (T4)** is a deliberate behavior change: SSE replay previously prepended prior runs' events to every new listener; each run now owns its feed. Verify's feed benefits too.
- **Type consistency check:** `researchPrompt(type, address)`, `validateResearchRequest(body)`, `parseFindings(text)`, `hasResearchFindings(jobDir)`, `runResearch(jobId, type, address)`, `attachProgress(opts)`, `startResearch(type)`, `startBuild()`, `fetchBrief(type)` — names match across tasks.
