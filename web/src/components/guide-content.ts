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

export const GUMROAD_URL = "https://fintok.gumroad.com/l/om-builder";

export const GUIDE_STEPS: GuideStep[] = [
  {
    n: "01",
    title: "Install Claude Code",
    intro:
      "Claude Code is Anthropic's AI assistant, and it runs inside a terminal — a plain text window your computer already has. You don't type any technical commands yourself; you type in plain English, and Claude runs every technical command for you. Any paid Claude plan works.",
    substeps: [
      {
        label: "Install and sign in",
        body: "Go to anthropic.com/claude-code and follow the installer for your computer. When it asks you to sign in, use the same email and password you use for Claude.",
      },
      {
        label: "Open a terminal",
        body: 'Claude Code lives inside a terminal window — a chat with a plain background where you type instead of click. On a Mac, press Cmd+Space, type "Terminal," and press Enter. On Windows, click Start, type "PowerShell," and press Enter. Type claude and press Enter — you\'re now talking to Claude Code.',
      },
    ],
  },
  {
    n: "02",
    title: "Understand what you're building",
    intro:
      "Before you build anything, it helps to see the shape of it. Everything below comes down to two kinds of file working together: three “skills” — instruction packets that teach Claude one narrow, specific job — and three “master prompts” — the messages you actually type once the skills exist. You're about to build all six yourself, from scratch, over the next three steps. Nothing here is downloaded from us — Claude writes every file, on your machine, from instructions you paste in.",
    substeps: [
      {
        label: "The three skills",
        body: "cre-maps draws real location and comp maps by geocoding addresses and pulling real street tiles over the internet — no browser, no fabricated grid. property-photos pulls real property photos out of a deal PDF (or hunts for them on the web for comps) and refuses to ship a photo it can't confirm is the right building. doc-from-template is the conductor: it studies any OM or teaser once — its structure, its design language, its list of deal-specific fields — and saves that as a reusable profile, then fills that profile with a new deal's numbers on demand.",
      },
      {
        label: "The three master prompts",
        body: "Analyze teaches Claude a template's look, once. Fill builds a specific deal into that template, every time you have a new deal. Verify audits the finished deck — design fidelity, sourced numbers, real editability — before you trust it. You'll build the skills in Steps 03–04, then use the master prompts verbatim in Step 05.",
      },
    ],
    callout: {
      title: "Why skills matter",
      body: "A skill is a hard constraint, not a suggestion — and that's what makes the honest path the only path. Without one, a model asked for a map might just draw a plausible-looking street grid with a drawing library and call it done. With the cre-maps skill in place, there's no draw-a-fake-grid shortcut to reach for — only a real geocoder and real map tiles. Same idea everywhere else: a missing number becomes a visible [TBD], never a smooth-sounding guess, because the skill's own rules say so explicitly. A map is either real streets or an obviously blank grid — there's no plausible middle ground for either failure mode to hide in.",
    },
  },
  {
    n: "03",
    title: "Build the maps skill",
    intro:
      "This step has Claude write its own cre-maps skill — a folder at ~/.claude/skills/cre-maps holding a SKILL.md (when to use it) and a Python script that draws the map. You're not writing any code yourself; you're describing exactly what the script must do, in one prompt, and Claude builds it.",
    substeps: [
      {
        label: "Build the skill",
        body: "Paste this into Claude Code. It's a complete spec for the script — what it takes in, how it geocodes, which libraries it uses, and the one rule that can never be broken: a blank grid is a failed run, never a usable map.",
        prompt: {
          label: "Build prompt — paste into Claude Code",
          text: 'Build me a Claude Code skill called cre-maps, saved at ~/.claude/skills/cre-maps/. It needs a SKILL.md with YAML frontmatter (name: cre-maps, and a description of when to use it — real-estate location maps, comp maps, and aerial maps for CRE documents like offering memorandums) plus one script, scripts/make_map.py.\n\nThe script takes a subject street address and an optional semicolon-separated list of comp addresses, plus a style flag (street or aerial), a title, and an output PNG path. For every address, geocode it through OpenStreetMap’s Nominatim API — a real HTTP request with a custom User-Agent header, throttled to at most one request per second, with results cached to a JSON file next to the script so repeat runs don’t re-hit the API. Print each address’s resolved name and its distance from the subject so a mis-geocoded pin is obvious before it ships.\n\nFetch real map tiles over plain HTTP using the staticmap and pillow Python libraries — CARTO’s light basemap for street maps, Esri World Imagery for aerial — and draw a teal star on the subject property and numbered teal pins on every comp, all on top of those real tiles. Never draw a synthetic street grid by hand and never route through a browser, Folium, or Selenium — there is no browser available and a hand-drawn grid is not a map.\n\nBake the attribution caption directly into the image — "© OpenStreetMap contributors © CARTO" for street maps, "Esri, Maxar, Earthstar Geographics" for aerial — it’s legally required, not optional.\n\nAdd one rule to the SKILL.md in capital letters: a run that returns a blank grid with no street names is a FAILED run, not a usable map — never treat it as acceptable output, and always look at the finished PNG yourself before it goes in a document.',
        },
      },
      {
        label: "Smoke-test it",
        body: "Ask Claude to run this — or paste it into your own terminal to watch it happen by hand. It installs the two Python libraries the script needs, then draws a real map for a real Koreatown address with two nearby comp pins.",
        prompt: {
          label: "Terminal — smoke test",
          text: 'pip install --break-system-packages staticmap pillow\n\npython3 ~/.claude/skills/cre-maps/scripts/make_map.py \\\n  --subject "845 S Kenmore Ave, Los Angeles, CA 90005" \\\n  --pins "851 S Kenmore Ave, Los Angeles, CA; 720 S Mariposa Ave, Los Angeles, CA" \\\n  --style street \\\n  --title "SMOKE TEST | 845 S KENMORE AVE" \\\n  --out /tmp/om-builder-smoketest.png',
        },
      },
    ],
    callout: {
      title: "Look at the image — don't skip this",
      body: "Open /tmp/om-builder-smoketest.png (on a Mac: Finder → Cmd+Shift+G → type /tmp) and confirm you can see real Koreatown street names, a teal star on the subject address, two numbered teal pins nearby, and the attribution caption baked into the image. If you see a blank grid with no street names instead, the tiles didn't download — check your internet connection and re-run. Never accept a blank grid as a working map.",
    },
  },
  {
    n: "04",
    title: "Build the photo + template skills",
    intro:
      "Two more skills, same method as Step 03: describe the job completely, in plain English, and have Claude build it. These two do the rest of the work — pulling real photos out of your documents, and turning any OM you admire into a reusable template.",
    substeps: [
      {
        label: "Build the photos skill",
        body: "This one extracts real photos from a deal PDF, and refuses to guess which one is the exterior.",
        prompt: {
          label: "Build prompt — paste into Claude Code",
          text: "Build me a Claude Code skill called property-photos, saved at ~/.claude/skills/property-photos/. It needs a SKILL.md with frontmatter (name: property-photos, description covering: pulling photos out of a deal PDF/OM, and verifying a real-estate photo actually shows the right building) plus one script, scripts/extract_pdf_photos.py.\n\nThe script takes a PDF path and an output folder (default minimum width 800px, overridable). Using pdfplumber, it reads every embedded JPEG image stream directly from the PDF's raw bytes and writes it out verbatim — no re-encoding through PIL, no pdftoppm/pdfimages, no page-cropping (cropping throws bounding-box errors on full-bleed images; a whole-stream dump is the only reliable path). It names each file by page and image index and pixel size (like p3_im1_2400x1600.jpg), flags exact duplicates, and writes a manifest.txt listing everything it found.\n\nThe SKILL.md's ground rule, spelled out explicitly: the biggest image in a deal PDF is often an interior kitchen shot, not the exterior — never pick “the exterior photo” by file size or page order. Always look at the actual image and confirm it against known facts about the building (street number visible, stories, massing) before using it anywhere. If a photo can't be confirmed as the right building, ship a labeled “photo unavailable” placeholder instead of guessing — and if the destination document needs to stay editable, keep that label as a real caption text box, never text baked into the placeholder image itself.",
        },
      },
      {
        label: "Build the template skill",
        body: "This one is the conductor — it learns a deck's design once, then fills it with new deal data forever after, refusing to invent any number it wasn't given.",
        prompt: {
          label: "Build prompt — paste into Claude Code",
          text: "Build me a Claude Code skill called doc-from-template, saved at ~/.claude/skills/doc-from-template/. It needs a SKILL.md with frontmatter (name: doc-from-template, description covering: analyzing a template OM/teaser/BOV once, then generating new documents from it for new deals) and it works in two flows, with no script required — the skill is the instructions themselves, executed by Claude reading and writing files directly.\n\nFlow A — analyze a template (run once per template, whenever I hand it a new OM/teaser/BOV file to learn): read the file, then study it in three layers and write the analysis to templates/<profile-name>/profile.md inside the skill's own folder — (1) structure: every page/section in order and what it's for; (2) design language: fonts, colors as hex codes, heading styles, table styles, and every image slot's position and rough aspect ratio; (3) a field list: every deal-specific value, table, and photo that would change for a new deal, as a table of field name / where it appears / kind (text, number, table, image) / example from the original. Copy the original file in alongside the profile as original.<ext>, untouched — the skill must never modify the source file, and must never silently overwrite an existing profile with the same name; ask first.\n\nFlow B — fill a profile (run once per deal): given a saved profile name and whatever deal documents I've dropped in — rent roll, financial model, comps, photos — map every value it can find onto the profile's field list, then ask me for everything still missing in ONE batched message, never one question at a time. Generate the finished document in the template's original format (or a different editable format if I explicitly ask for one), reproducing the profile's structure and design language, using real text frames and real tables — never text flattened into an image; only photos, maps, and logos may be images. Any field it couldn't fill becomes a literal [TBD: what's needed] marker, never an invented number. Never overwrite an existing output file — append -2, -3, and so on instead.\n\nBefore handing anything back, the skill must always: grep the output for the original template owner's name and branding and strip every trace of it, re-trace every number back to the source documents I actually gave it, and confirm every text element and table is genuinely editable — not a picture of text — then report what it checked.",
        },
      },
    ],
  },
  {
    n: "05",
    title: "The three master prompts",
    intro:
      "With all three skills built, these are the only prompts you'll ever type again. Analyze runs once per template you want to clone the look of; Fill and Verify run once per deal.",
    substeps: [
      {
        label: "Teach it a look",
        body: "Run this once, the first time you want Claude to learn a specific offering memorandum's design. Open the file — the PDF or PowerPoint you want the look copied from — in the same Claude Code conversation, then paste this prompt. Claude studies it in three passes and saves the result as a reusable template profile, alongside an untouched copy of the original so nothing is overwritten. Run it again any time you want to teach it a different look.",
        prompt: {
          label: "Prompt 1 — Analyze",
          text: "Analyze this offering memorandum in three layers: (1) structure — every page and its purpose; (2) design language — colors as hex, fonts, table styles, image slots; (3) variable content — every deal-specific value, table, and photo that would change for a new deal, as a field list. Save the analysis as a reusable template profile with an untouched copy of the original.",
        },
      },
      {
        label: "Build the deck",
        body: "Run this once per deal. Drop your rent roll, financial model, comp set, and photos into the same conversation, then replace [PROPERTY], [PROFILE], and $[X] with your property's name, the profile name you saved in Analyze, and the asking price. Claude builds a full offering memorandum as an editable PowerPoint — every number pulled from your documents, the maps and photos generated by the two skills you built in Step 04, and the original template owner's branding stripped and replaced with yours.",
        prompt: {
          label: "Prompt 2 — Fill",
          text: "Build [PROPERTY] into the [PROFILE] template as an editable PowerPoint at a price of $[X]. Every number must come from my documents — rent roll, financial model, comp analysis — and anything missing becomes a visible [TBD] marker, never a guess. Real text boxes and real tables so I can edit everything. Use the cre-maps skill for the location and comp maps, and the property-photos skill for imagery. Strip all of the original template's branding and replace with mine.",
        },
      },
      {
        label: "Audit before you trust it",
        body: "Run this every time, right after Fill finishes, in the same conversation. It checks three things: the layout still matches your template page for page, every number traces back to your source documents (recalculating anything derived), and every word and table in the file is real and editable — not a picture of text — with no trace of the original template owner's branding left. Claude fixes what it finds and shows you proof.",
        prompt: {
          label: "Prompt 3 — Verify",
          text: "Review the deck three ways before I trust it: (1) design fidelity against the original template, page by page; (2) every number re-traced to my source documents — recompute the derived ones; (3) editability — confirm every word is a real text frame and every table a real table, and scan for any remnant of the template owner's branding. Fix what you find and show me proof.",
        },
      },
    ],
    callout: {
      title: "The [TBD] discipline",
      body: "If a number isn't in the documents you gave it, the tool marks it [TBD] instead of guessing — it will never invent a rent, a cap rate, or a square footage. A deck with [TBD] markers in it isn't broken; it's the tool telling you exactly what's still missing. Track down each one, add the missing document or figure to the conversation, and ask Claude to rebuild that section.",
    },
  },
  {
    n: "06",
    title: "Run it",
    intro:
      "You now have the engine of the paid bundle, built by your own hand: three skills, three prompts. Here's the order to run them in for your first real deal.",
    substeps: [
      {
        label: "Drop your documents in",
        body: "Open a fresh Claude Code conversation in a folder for this deal, and drag in every document you have — rent roll, financial model, comp set, photos, and (if you want a specific look) the template you analyzed in Step 05. No prompt is required to start; dropping the files in is enough for Claude to see them.",
      },
      {
        label: "Run Fill, then always Verify",
        body: "Paste the Fill prompt from Step 05 with your blanks filled in, then — before you do anything else with the deck — paste the Verify prompt in the same conversation. Never send an OM straight from Fill to an investor.",
      },
    ],
    callout: {
      title: "Honest limits",
      body: "Even a clean Verify pass has limits worth knowing. Asking rents (what a landlord lists a unit for) run higher than collected rents (what tenants actually pay) — don't treat one as the other. A comp set of only two or three properties is too small to lean on by itself; widen it where you can. The tool can only check your numbers against the documents you gave it — a rent roll with mistakes in it produces an OM with the same mistakes in it. And a finished deck is a marketing draft for you to review, not a substitute for your own underwriting or legal advice.",
    },
  },
  {
    n: "07",
    title: "Build the app around it",
    intro:
      "After Steps 01–06 you have the engine: it works, but it lives in a terminal. This last step wraps it in the same simple screen the ready-made bundle ships — a page in your browser with a drop zone, one button, and a download link — so the only difference left between what you built and what we sell is zero effort. Same method as before: one prompt that describes the whole app, and Claude builds it.",
    substeps: [
      {
        label: "Build the app",
        body: "Paste this into Claude Code from a fresh folder where you want the app to live. It's the complete behavior contract for the wrapper — the server, the page, the safety rules, and the sealed environment the agent runs in.",
        prompt: {
          label: "Build prompt — paste into Claude Code",
          text: 'Build me a tiny local web app that wraps my OM-building skills, in this folder. Plain Node.js with no framework — only the built-in http module plus the @anthropic-ai/claude-agent-sdk package (npm install that one dependency). One server file, one HTML page, nothing else.\n\nThe server binds to 127.0.0.1 only (never the network), listens on a local port like 3131, and opens my browser to the page when it starts. It reads my Anthropic API key from a one-line file next to it called PUT-YOUR-KEY-HERE.env (a single line: ANTHROPIC_API_KEY=...), re-reading the file on every status check so I can paste the key in without restarting anything.\n\nThe page is friendly enough for someone who has never used a terminal: a status pill that turns green when the key file is filled in; a big drop zone where I drag in my deal documents (each browser session gets its own job folder on disk, and uploaded filenames are sanitized so a name like ../../x can never escape that folder); an optional plain-English box labeled so it is clearly optional — if I leave it empty the build still runs; a big Build button that enables once the key is green and at least one file is in; a live progress feed that shows what the agent is doing in plain words while it works, with the raw technical detail tucked behind a collapsible "show details" toggle; download buttons for every finished .pptx; and a Verify button that appears after a build and asks the agent to re-check the finished deck (design fidelity page by page, every number re-traced to my documents with derived ones recomputed, true editability, and no leftover branding from any template). Refuse to start a second build while one is already running.\n\nWhen I press Build, the server drives the Claude Agent SDK\'s query() function with the job folder as the working directory, model claude-opus-4-8, project-level setting sources, all skills enabled, and permissions bypassed so it runs unattended. The prompt it sends is my typed text word-for-word (or, if I typed nothing, "Build an offering memorandum from the documents in the current folder"), always followed by the same standing rules: the files in the folder are my deal documents, build an editable PowerPoint with real text boxes and real tables, every number must come from my documents and anything missing becomes a visible [TBD] marker — never a guess, use the cre-maps skill for maps and the property-photos skill for imagery, and if I asked for the style of a specific deck, analyze it into a reusable template profile first and strip its branding.\n\nSeal the agent\'s environment so it behaves identically on any machine: create a workspace folder that holds the job folders, copy my three skills (cre-maps, property-photos, doc-from-template) from ~/.claude/skills into workspace/.claude/skills so the app is self-contained, and put an empty .git directory at the workspace root so skill discovery stops there and never climbs into whatever folder surrounds the app. In the query() options, pass an empty MCP-server list with the SDK\'s strict MCP config flag so no MCP servers load from anywhere on my machine, point the CLAUDE_CONFIG_DIR environment variable at a folder inside the workspace, and set CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 — the agent must see only the workspace skills, zero MCP servers, zero outside settings.',
        },
      },
      {
        label: "Paste your key and start it",
        body: "Open the PUT-YOUR-KEY-HERE.env file the build created (any text editor works) and paste your Anthropic API key after the equals sign — one line, one time. Then start the app: ask Claude to run it, or type node server.js in the app's folder yourself. Note the honest difference from Steps 01–06: the terminal workflow runs on your Claude subscription, but this app bills your API key directly — typically a few dollars per OM, the same as the paid bundle.",
      },
      {
        label: "What you should see",
        body: "Your browser opens to the page. The pill goes green once your key is in. Drag in the same deal documents from Step 06, type anything you want it to know — or nothing — and press Build. The progress feed narrates the work in plain words (reading your documents, drawing the map from real tiles, building the deck), and when it finishes, a download button appears with your OM as an editable .pptx. Press Verify before you trust it. That screen is the product: what you sell as convenience, you now own end to end.",
      },
    ],
    callout: {
      title: "Why the seal matters",
      body: "The agent inside the app runs unattended with its permissions bypassed — so it must be boxed in. The seal guarantees it sees exactly three skills and nothing else from your machine: no MCP servers, no personal settings, no stray instruction files from whatever folder the app happens to sit in. That's what makes its behavior reproducible — the same inputs produce the same OM on your laptop, your colleague's, or a buyer's.",
    },
  },
];
