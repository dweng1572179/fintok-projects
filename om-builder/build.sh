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

cleanup_on_fail() {
  echo "Build failed — cleaning up stage dirs (downloads/ cache kept)" >&2
  rm -rf dist/stage-mac dist/stage-win
}
trap cleanup_on_fail ERR

fetch() { [ -f "$DL/$2" ] || curl -fL "$1" -o "$DL/$2"; }

# --- 1. sources ---
rm -rf "$DL/kit" "$DL/anthropic-skills"
git clone --depth 1 "$KIT_URL" "$DL/kit"
KIT_COMMIT=$(git -C "$DL/kit" rev-parse HEAD)
git clone --depth 1 "$SKILLS_URL" "$DL/anthropic-skills"

# Claude Agent SDK version the app is pinned to (for bundle-manifest.txt).
SDK_V=$(grep -oE '"@anthropic-ai/claude-agent-sdk": *"[^"]+"' app/package.json | sed -E 's/.*: *"([^"]+)"/\1/')

# --- 2. runtimes ---
# Mac ships BOTH python architectures (mirrors the node arm64/x64 layout) so
# Intel-Mac buyers aren't left with an arm64-only python; the .command
# launcher selects the matching runtime/python/$ARCH at run time.
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
  # anthropics/skills layout verified at build time: skills/{pptx,docx,pdf}
  # (2 levels under the repo root) — maxdepth 3 from $DL/anthropic-skills
  # covers it; no fix needed vs. the original guess.
  for sk in pptx docx pdf; do
    SRC=$(find "$DL/anthropic-skills" -maxdepth 3 -type d -name "$sk" | head -1)
    [ -n "$SRC" ] && cp -R "$SRC" "$S/OM-Builder/workspace/.claude/skills/$sk"
  done
  printf 'kit=%s\nnode=%s\npython=%s+%s\nsdk=%s\n' "$KIT_COMMIT" "$NODE_V" "$PY_V" "$PY_TAG" "$SDK_V" > "$S/OM-Builder/bundle-manifest.txt"
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
# Ship BOTH python architectures — an arm64-only python leaves Intel-Mac
# buyers unable to run the bundle. Layout mirrors runtime/node/{arch}/ and
# "Start OM Builder.command" resolves runtime/python/$ARCH at launch.
mkdir -p "$S/runtime/python/arm64" "$S/runtime/python/x64"
tar -xzf "$DL/py-mac-arm64.tgz" -C "$S/runtime/python/arm64" --strip-components=1
tar -xzf "$DL/py-mac-x64.tgz"   -C "$S/runtime/python/x64"   --strip-components=1
pyinstall "$S/runtime/python/arm64/lib/python3.12/site-packages" macosx_11_0_arm64
pyinstall "$S/runtime/python/x64/lib/python3.12/site-packages"   macosx_11_0_x86_64
cp "launchers/Start OM Builder.command" "$S/" && chmod +x "$S/Start OM Builder.command"
rm -f dist/OM-Builder-Mac.zip
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
rm -f dist/OM-Builder-Windows.zip
( cd dist/stage-win && zip -qry ../OM-Builder-Windows.zip OM-Builder )

trap - ERR
echo "Built: dist/OM-Builder-Mac.zip dist/OM-Builder-Windows.zip (kit $KIT_COMMIT)"
