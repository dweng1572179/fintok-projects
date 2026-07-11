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

// Standing guardrail block appended to every freeform build prompt — keeps
// the kit's discipline (grounded numbers, [TBD] over guesses, editability,
// skills usage, branding hygiene) no matter what the buyer types.
const BUILD_GUARDRAILS =
  "\n\nThe files in the current folder are my deal documents (and possibly a template deck to copy the look of). " +
  "Build the result as an editable PowerPoint — real text boxes and real tables. " +
  "Every number must come from my documents; anything missing becomes a visible [TBD] marker, never a guess. " +
  "Use the cre-maps skill for location and comp maps, and the property-photos skill for imagery. " +
  "If I asked for the style of a specific deck, analyze that deck into a reusable template profile first, then build into it. " +
  "Strip only the TEMPLATE deck's branding — the finished deck must carry the branding found in my own deal documents " +
  "(the deal's own firm/broker names and logos as they appear there); never invent a brand or substitute a placeholder brand. " +
  "After building, check every slide for overlapping text frames — titles over subtitles, footnotes over table rows, adjacent " +
  "contact blocks — and fix any collisions; overlapping text is a build defect, not a style choice.";

const VERIFY_PROMPT =
  "Review the deck three ways before I trust it: (1) design fidelity against the original template, page by page; " +
  "(2) every number re-traced to my source documents — recompute the derived ones; " +
  "(3) editability — confirm every word is a real text frame and every table a real table, and scan for any remnant of the template owner's branding. " +
  "Fix what you find and show me proof. The deck and source documents are in the current folder.";

// Used when the buyer leaves the prompt panel empty — files in, OM out with
// zero typing required. Same guardrail block applies either way.
const DEFAULT_BUILD_INSTRUCTION = "Build an offering memorandum from the documents in the current folder.";

// The buyer's freeform text, verbatim, followed by the standing guardrails.
// Blank/missing input falls back to DEFAULT_BUILD_INSTRUCTION — the prompt
// panel is optional, not required.
function buildPrompt(userText) {
  const text = String(userText || "").trim();
  return (text || DEFAULT_BUILD_INSTRUCTION) + BUILD_GUARDRAILS;
}

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

// Replaces (or inserts) the ANTHROPIC_API_KEY= line in the bundle-root env
// file's text, leaving every other line — including comments — untouched.
// Pure so it's unit-testable without touching the filesystem.
// Belt-and-braces: strip CR/LF/NUL from the value even though callers
// validate — a newline embedded in the key would otherwise smuggle an
// attacker-controlled extra line (e.g. LD_PRELOAD=...) into the env file.
function writeKeyLine(envText, key) {
  key = String(key).replace(/[\r\n\0]/g, "");
  const lines = String(envText).split(/\r?\n/);
  const isKeyLine = /^\s*ANTHROPIC_API_KEY\s*=/;
  let found = false;
  const next = lines.map((line) => {
    if (isKeyLine.test(line)) {
      found = true;
      return `ANTHROPIC_API_KEY=${key}`;
    }
    return line;
  });
  if (!found) next.push(`ANTHROPIC_API_KEY=${key}`);
  return next.join("\n");
}

// The only shape a real Anthropic key can have — whole-string match, not a
// prefix check. Anthropic keys are exactly sk-ant- followed by URL-safe
// base64-ish characters; anything else (embedded newlines, spaces, shell
// metacharacters) is rejected so a crafted "key" can never smuggle extra
// env lines or control characters into the env file. Factored out so the
// 400 path is unit-testable without a live server.
function isValidKeyPrefix(key) {
  return typeof key === "string" && /^sk-ant-[A-Za-z0-9_-]+$/.test(key);
}

function safeName(name) {
  const base = path.basename(String(name)).replace(/[\\/\0]/g, "");
  // path.basename maps "" → "" and passes "." / ".." through; joined onto a
  // job dir those resolve to a DIRECTORY, which must never reach fs calls.
  if (!base || base === "." || base === "..") return "file";
  return base;
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

// ---- environment seal (exported for tests) ----
// GUARANTEE: the agent sees only the bundle's skills — no MCP servers or
// external settings from the buyer's machine. Per the Agent SDK docs
// (code.claude.com/docs/en/agent-sdk/typescript + /claude-code-features):
// - `strictMcpConfig: true` + `mcpServers: {}` — use ONLY explicitly-passed
//   MCP servers (none), ignoring project .mcp.json, user settings, plugins,
//   and claude.ai connectors. Kills the observed leak class (a supabase MCP
//   server inherited from a repo surrounding the bundle).
// - `settingSources: ["project"]` — no user/local settings. Project skills
//   resolve from cwd (workspace/jobs/<id>) upward to the NEAREST repository
//   root; ensureWorkspaceBoundary() pins that root at workspace/ itself, so
//   the walk still finds workspace/.claude/skills but can never climb into
//   a surrounding repo's .claude/skills or CLAUDE.md.
// - `CLAUDE_CONFIG_DIR` — the CLI's global config (~/.claude.json) is read
//   regardless of settingSources; relocate it inside the bundle.
// - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` — per-directory auto-memory is also
//   read regardless of settingSources; off.
// Verified keylessly via the SDK's init message: unsealed options showed a
// decoy .mcp.json server + a surrounding repo's skill; sealed options showed
// mcp_servers: [] and the bundle's workspace skill only.
function agentOptions(jobDir) {
  return {
    cwd: jobDir,
    model: "claude-opus-4-8",
    settingSources: ["project"],
    skills: "all",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    mcpServers: {},
    strictMcpConfig: true,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: readKey(),
      CLAUDE_CONFIG_DIR: path.join(WORKSPACE, ".claude-config"),
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    },
  };
}

// The project-skills walk climbs from the job dir to the nearest repository
// root. An empty .git directory at workspace/ pins that boundary INSIDE the
// bundle — a bundle unzipped into someone's git repo (or our own e2e copy
// inside the fintok repo) never inherits that repo's .claude/skills or
// CLAUDE.md. Git ignores empty directories, so a surrounding repo never sees
// it, and no git binary is required on the buyer's machine.
function ensureWorkspaceBoundary() {
  fs.mkdirSync(path.join(WORKSPACE, ".git"), { recursive: true });
}

// Friendly progress translation: assistant text → "line"; tool chatter → "detail".
function describeToolUse(name, input) {
  if (name === "Bash" && /make_map/.test(input?.command || "")) return "Drawing the location map from real map tiles…";
  if (name === "Bash" && /extract_pdf_photos/.test(input?.command || "")) return "Pulling property photos from your PDF…";
  if (name === "Write" || name === "Edit") return "Building the deck…";
  if (name === "Read") return "Reading your documents…";
  return null;
}

// Runs one or more sequential agent phases in the same job dir with the same
// options. `phases` is an array of { intro?: string, prompt: string }. Build
// and Verify are each a single phase today; the machinery stays multi-phase
// (with abort-on-error) so chained flows remain cheap to add.
async function runAgent(jobId, phases) {
  const job = jobs.get(jobId);
  const jobDir = path.join(JOBS, jobId);
  job.running = true;
  let failed = false;
  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    for (const phase of phases) {
      if (phase.intro) emit(job, "line", phase.intro);
      // agentOptions() carries the environment seal: the agent sees only the
      // bundle's skills — no MCP servers or external settings from the
      // buyer's machine.
      const q = query({ prompt: phase.prompt, options: agentOptions(jobDir) });
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
          }
        }
      }
      if (failed) break; // never run a later phase on top of a failed one
    }
    if (!failed) emit(job, "done", "Done.");
  } catch (err) {
    emit(job, "error", `Something went wrong: ${err.message}`);
  } finally {
    job.running = false;
  }
}

// The workspace's project skills must be visible from each job dir: jobs live
// UNDER workspace/, and the SDK discovers .claude/ from cwd ancestors up to
// the nearest repo root (pinned at workspace/ by ensureWorkspaceBoundary) —
// so workspace/.claude/skills serves every job. (Verified in Task 9 E2E and
// re-verified keylessly after the environment seal.)

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// CSRF guard for the JSON-body POST routes (/api/key, /api/build,
// /api/verify): a malicious web page can fire cross-origin "simple"
// requests (text/plain or form-encoded POSTs need no CORS preflight) at
// 127.0.0.1 while the buyer has the app open. Requiring an application/json
// Content-Type forces a preflight, which the browser then blocks — no
// same-origin page is affected because our own UI always sends it.
function requireJson(req, res) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (ct.startsWith("application/json")) return true;
  json(res, 400, { error: "expected application/json" });
  return false;
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
  if (req.method === "POST" && url.pathname === "/api/key") {
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
      const key = String(parsed.key || "").trim();
      if (!isValidKeyPrefix(key)) {
        // Never echo the submitted value back — it may be a near-miss key.
        return json(res, 400, { error: "That doesn't look like an Anthropic key — it should start with sk-ant-" });
      }
      let current = "";
      try {
        current = fs.readFileSync(ENV_FILE, "utf8");
      } catch {
        current = "";
      }
      fs.writeFileSync(ENV_FILE, writeKeyLine(current, key));
      return json(res, 200, { ok: true });
    });
    return;
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
    out.on("error", () => {
      if (!res.headersSent) json(res, 500, { error: "upload failed" });
    });
    req.pipe(out).on("finish", () => json(res, 200, { ok: true, name }));
    return;
  }
  if (req.method === "POST" && (url.pathname === "/api/build" || url.pathname === "/api/verify")) {
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
      const { job: id, prompt } = parsed;
      const j = jobs.get(id);
      if (!j) return json(res, 404, { error: "unknown job" });
      if (j.running) return json(res, 409, { error: "already running" });
      let phases;
      if (url.pathname === "/api/verify") {
        phases = [{ prompt: VERIFY_PROMPT }];
      } else {
        // Prompt is optional — buildPrompt() supplies a sane default when
        // the buyer leaves it blank, so no empty-prompt 400 here.
        phases = [{ prompt: buildPrompt(prompt) }];
      }
      runAgent(id, phases);
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
    const dir = path.join(JOBS, jobId);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".pptx"))
      .map((name) => {
        let size = 0;
        try {
          size = fs.statSync(path.join(dir, name)).size;
        } catch {
          // file vanished between readdir and stat — report 0, still listed
        }
        return { name, size };
      });
    return json(res, 200, { files });
  }
  if (req.method === "GET" && url.pathname === "/api/download") {
    const rawName = url.searchParams.get("name") || "";
    // Belt-and-suspenders: safeName already maps ""/"."/".." to "file", but
    // reject directory-resolving names here too so this route can NEVER
    // stream a directory (unhandled EISDIR kills the whole process).
    if (!rawName || rawName === "." || rawName === "..") return json(res, 404, { error: "not found" });
    const name = safeName(rawName);
    const file = path.join(JOBS, jobId, name);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return json(res, 404, { error: "not found" });
    }
    if (!stat.isFile()) return json(res, 404, { error: "not found" });
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}"`,
    });
    const stream = fs.createReadStream(file);
    stream.on("error", (err) => {
      console.error("[om-builder] download stream error:", err.message);
      if (!res.headersSent) json(res, 500, { error: "download failed" });
      else res.destroy();
    });
    return stream.pipe(res);
  }
  json(res, 404, { error: "not found" });
});

module.exports = {
  parseEnvFile,
  writeKeyLine,
  isValidKeyPrefix,
  buildPrompt,
  safeName,
  agentOptions,
  ensureWorkspaceBoundary,
  researchPrompt,
  validateResearchRequest,
  RESEARCH_TYPES,
  parseFindings,
  hasResearchFindings,
};

if (require.main === module) {
  // Defense in depth: this is a single-user local appliance with zero ops
  // support — a stray unhandled error should be logged, never fatal.
  process.on("uncaughtException", (err) => console.error("[om-builder] recovered:", err));
  fs.mkdirSync(JOBS, { recursive: true });
  ensureWorkspaceBoundary();
  // OM_PORT override exists only so a smoke test can run a second instance
  // on a spare port without colliding with a real bundle's 3131. Buyers
  // never set it — the launcher scripts never pass it.
  const PORT = process.env.OM_PORT || 3131;
  server.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}`;
    console.log(`OM Builder running at ${url}`);
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    execFile(opener, args, () => {});
  });
}
