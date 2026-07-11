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

## License note

`build.sh` vendors the OM Builder workflow kit (skills + prompts) from a separate source repository at build time. That vendored kit is licensed under **PolyForm Noncommercial 1.0.0** — see the license terms in the vendored source before reusing it commercially.
