#!/bin/bash
# Start OM Builder — double-click me. (First time: right-click → Open.)
cd "$(dirname "$0")"
ARCH=$(uname -m)                       # arm64 or x86_64
[ "$ARCH" = "x86_64" ] && ARCH=x64
NODE="$PWD/runtime/node/$ARCH/bin/node"
if [ ! -x "$NODE" ]; then
  echo "This download doesn't match your Mac ($ARCH). Please re-download the Mac version."; read -r; exit 1
fi
export PATH="$PWD/runtime/python/$ARCH/bin:$PWD/runtime/node/$ARCH/bin:$PATH"
exec "$NODE" app/server.js
