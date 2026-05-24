#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$ROOT_DIR/.openbridge-data"
LOG_FILE="$DATA_DIR/daemon.log"
PID_FILE="$DATA_DIR/daemon.pid"

mkdir -p "$DATA_DIR"

echo "==> Building OpenBridge"
cd "$ROOT_DIR"
pnpm build

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "==> Stopping existing OpenBridge daemon ($OLD_PID)"
    kill "$OLD_PID" || true
    sleep 1
  fi
fi

echo "==> Starting OpenBridge daemon"
nohup node "$ROOT_DIR/packages/daemon/dist/cli/index.js" serve >"$LOG_FILE" 2>&1 &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$PID_FILE"
sleep 2

echo "==> Current status"
node "$ROOT_DIR/packages/daemon/dist/cli/index.js" status

cat <<EOF

OpenBridge MCP config:

{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "$ROOT_DIR/packages/daemon/dist/cli/index.js",
        "mcp"
      ]
    }
  }
}

Daemon log: $LOG_FILE
EOF
