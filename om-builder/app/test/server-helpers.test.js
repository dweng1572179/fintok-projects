// projects/om-builder/app/test/server-helpers.test.js
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const {
  parseEnvFile,
  writeKeyLine,
  isValidKeyPrefix,
  buildPrompt,
  safeName,
  agentOptions,
  ensureWorkspaceBoundary,
  researchPrompt,
  validateResearchRequest,
  parseFindings,
  hasResearchFindings,
} = require("../server.js");

test("parseEnvFile reads the key line, ignores comments/blanks", () => {
  const env = parseEnvFile("# paste below\nANTHROPIC_API_KEY=sk-ant-abc123\n");
  assert.strictEqual(env.ANTHROPIC_API_KEY, "sk-ant-abc123");
});

test("buildPrompt preserves the buyer's text verbatim at the start", () => {
  const user = "Take the Studio Garden Apartment Covina and make it into the template style of the MM Ontario OM";
  const p = buildPrompt(user);
  assert.ok(p.startsWith(user));
});

test("buildPrompt appends the standing guardrail block", () => {
  const p = buildPrompt("Build my OM for 845 S Kenmore at $12,500,000");
  assert.ok(p.includes("editable PowerPoint — real text boxes and real tables"));
  assert.ok(p.includes("[TBD] marker, never a guess"));
  assert.ok(p.includes("cre-maps skill"));
  assert.ok(p.includes("property-photos skill"));
  assert.ok(p.includes("analyze that deck into a reusable template profile first"));
  assert.ok(p.includes("Strip only the TEMPLATE deck's branding"));
  assert.ok(p.includes("the branding found in my own deal documents"));
  assert.ok(p.includes("never invent a brand or substitute a placeholder brand"));
  assert.ok(p.includes("check every slide for overlapping text frames"));
  assert.ok(p.includes("overlapping text is a build defect, not a style choice"));
});

test("buildPrompt trims the buyer's text and leaves no placeholder residue", () => {
  const p = buildPrompt("  Build it plain.  ");
  assert.ok(p.startsWith("Build it plain."));
  assert.ok(!p.includes("[PROPERTY]") && !p.includes("[PROFILE]") && !p.includes("$[X]"));
});

test("buildPrompt falls back to the default instruction when userText is missing or blank", () => {
  const DEFAULT = "Build an offering memorandum from the documents in the current folder.";
  for (const missing of [undefined, null, "", "   ", "\n\t "]) {
    const p = buildPrompt(missing);
    assert.ok(p.startsWith(DEFAULT), `expected default instruction for ${JSON.stringify(missing)}`);
    assert.ok(p.includes("editable PowerPoint — real text boxes and real tables"));
    assert.ok(p.includes("[TBD] marker, never a guess"));
  }
});

test("agentOptions seals the agent environment — bundle skills only, zero MCP", () => {
  const opts = agentOptions("/somewhere/workspace/jobs/j1");
  // MCP seal: only explicitly-passed servers (none) — ignores project
  // .mcp.json, user settings, plugins, and claude.ai connectors.
  assert.deepStrictEqual(opts.mcpServers, {});
  assert.strictEqual(opts.strictMcpConfig, true);
  // Settings seal: project-only filesystem settings (no user/local), so the
  // bundle's workspace/.claude/skills still load and nothing else does.
  assert.deepStrictEqual(opts.settingSources, ["project"]);
  assert.strictEqual(opts.skills, "all");
  // Global-config + auto-memory are read REGARDLESS of settingSources —
  // both must be neutralized in env.
  assert.strictEqual(opts.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
  assert.ok(
    opts.env.CLAUDE_CONFIG_DIR.endsWith(path.join("workspace", ".claude-config")),
    "CLI global config must be relocated inside the bundle's workspace"
  );
  // Job wiring unchanged.
  assert.strictEqual(opts.cwd, "/somewhere/workspace/jobs/j1");
  assert.strictEqual(opts.permissionMode, "bypassPermissions");
  assert.ok("ANTHROPIC_API_KEY" in opts.env);
});

test("ensureWorkspaceBoundary is exported so boot can pin the skills walk at workspace/", () => {
  // The empty workspace/.git marker stops the project-skills/CLAUDE.md walk
  // from climbing into a surrounding repo. Behavior verified keylessly via
  // the SDK init message; here we lock the export so boot keeps calling it.
  assert.strictEqual(typeof ensureWorkspaceBoundary, "function");
});

test("safeName strips paths", () => {
  assert.strictEqual(safeName("../../etc/passwd"), "passwd");
  assert.strictEqual(safeName("rent roll.xlsx"), "rent roll.xlsx");
});

test("safeName never returns a directory-resolving name", () => {
  // "" / "." / ".." joined onto a job dir resolve to a DIRECTORY —
  // streaming a directory crashed the whole server (EISDIR). Locked to "file".
  assert.strictEqual(safeName(""), "file");
  assert.strictEqual(safeName("."), "file");
  assert.strictEqual(safeName(".."), "file");
  assert.strictEqual(safeName("../.."), "file");
  assert.strictEqual(safeName("/"), "file");
  assert.strictEqual(safeName("a/.."), "file");
});

test("isValidKeyPrefix accepts only real Anthropic-shaped keys", () => {
  assert.strictEqual(isValidKeyPrefix("sk-ant-api03-abc123"), true);
  assert.strictEqual(isValidKeyPrefix("sk-ant-abc_DEF-123"), true);
  assert.strictEqual(isValidKeyPrefix("sk-proj-abc123"), false);
  assert.strictEqual(isValidKeyPrefix("sk-ant-"), false, "prefix alone is not a key");
  assert.strictEqual(isValidKeyPrefix(""), false);
  assert.strictEqual(isValidKeyPrefix(undefined), false);
});

test("isValidKeyPrefix rejects env-line injection — whole-string match, not a prefix check", () => {
  // trim() does NOT remove embedded newlines: "sk-ant-x\nLD_PRELOAD=..."
  // passed the old startsWith check and wrote an attacker-controlled extra
  // line into the env file. The strict charset match kills the class.
  assert.strictEqual(isValidKeyPrefix("sk-ant-x\nLD_PRELOAD=/tmp/evil.so"), false);
  assert.strictEqual(isValidKeyPrefix("sk-ant-x\rEVIL=1"), false);
  assert.strictEqual(isValidKeyPrefix("sk-ant-abc 123"), false, "no spaces");
  assert.strictEqual(isValidKeyPrefix("sk-ant-abc;rm"), false, "no shell metacharacters");
  assert.strictEqual(isValidKeyPrefix("sk-ant-abc\0"), false, "no NUL");
});

test("writeKeyLine strips control chars from the value — belt-and-braces even if callers validate", () => {
  const after = writeKeyLine("ANTHROPIC_API_KEY=\n", "sk-ant-x\nLD_PRELOAD=/tmp/evil.so\r\0");
  const lines = after.split("\n");
  assert.strictEqual(lines[0], "ANTHROPIC_API_KEY=sk-ant-xLD_PRELOAD=/tmp/evil.so");
  assert.strictEqual(lines.length, 2, "the smuggled newline never becomes a new env line");
  assert.ok(!after.includes("\r") && !after.includes("\0"));
});

test("writeKeyLine inserts the key line when missing", () => {
  const before = "# a comment\nSOME_OTHER=1\n";
  const after = writeKeyLine(before, "sk-ant-abc123");
  assert.ok(after.includes("ANTHROPIC_API_KEY=sk-ant-abc123"));
  assert.ok(after.includes("# a comment"));
  assert.ok(after.includes("SOME_OTHER=1"));
});

test("writeKeyLine replaces an existing key line in place, preserving comments", () => {
  const before =
    "# ↓↓↓ Paste your Anthropic API key after the = sign on the next line. That's the only edit you'll ever make. ↓↓↓\n" +
    "ANTHROPIC_API_KEY=\n" +
    "# Get a key at https://console.anthropic.com → API keys → Create key. It starts with sk-ant-";
  const after = writeKeyLine(before, "sk-ant-newkey456");
  const lines = after.split("\n");
  assert.strictEqual(lines[1], "ANTHROPIC_API_KEY=sk-ant-newkey456");
  assert.strictEqual(lines.length, 3, "no line was added or removed, only replaced");
  assert.ok(after.includes("Paste your Anthropic API key"));
  assert.ok(after.includes("Get a key at https://console.anthropic.com"));
});

test("writeKeyLine replaces a previously-set key, not just an empty one", () => {
  const before = "ANTHROPIC_API_KEY=sk-ant-oldkey000\n";
  const after = writeKeyLine(before, "sk-ant-newkey111");
  assert.ok(after.includes("ANTHROPIC_API_KEY=sk-ant-newkey111"));
  assert.ok(!after.includes("oldkey000"));
});

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
