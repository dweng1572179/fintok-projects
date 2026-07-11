# fintok-projects

The public home of **fintok.news/projects** — free, step-by-step guides that teach you to build the same AI workflows FinTok ships, plus (where available) a ready-made bundle if you'd rather not build it yourself.

## Layout

```
web/         The site at fintok.news/projects — a standalone Next.js app,
             reverse-proxied under the /projects path.
om-builder/  Source for the OM Builder product: a local, bring-your-own-key
             (BYOK) desktop app that turns your deal documents into an
             editable offering-memorandum PowerPoint, plus the launchers
             and build script used to package it for distribution.
docs/        Design + implementation notes for the OM Builder product.
```

**OpenProp** — the self-hosted, BYOK property-intelligence app — used to live here
in `openprop/`. It now has its own repo: <https://github.com/dweng1572179/openprop>.

## Running `web/` locally

```
cd web
npm install
npm run dev
```

Open `http://localhost:3000/projects` — the app has `basePath: "/projects"` set, so all routes and assets live under that path even locally.

## Building the OM Builder bundles

The distributable app (a self-contained local web app with vendored Node/Python runtimes and double-click launchers for macOS and Windows) is built with:

```
cd om-builder
bash build.sh
```

macOS only — `build.sh` stages both platform bundles.

Built bundles are **distributed via Gumroad**, not committed to this repo.

## Licensing

Everything in this repo is under **PolyForm Noncommercial 1.0.0** — see
[`LICENSE.md`](LICENSE.md). Free for personal projects and internal business use
(run the tools on your own deals, follow the guides, all day, no fee); you may
copy, modify and share it; you may **not** resell or repackage it as a competing
product. Want a commercial use this doesn't allow? Ask for a separate license.

The OM Builder workflow kit (skills + prompts) is a separate source repository
that `om-builder/build.sh` vendors at build time. It carries its own `LICENSE.md`
— also PolyForm Noncommercial 1.0.0 — which ships inside the built bundle rather
than living in this repo.
