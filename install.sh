#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$ROOT_DIR/.openbridge-data"
LOG_FILE="$DATA_DIR/daemon.log"
PID_FILE="$DATA_DIR/daemon.pid"
WS_PORT="${OPENBRIDGE_WS_PORT:-10087}"
API_PORT="${OPENBRIDGE_API_PORT:-10088}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()  { echo -e "${RED}  ✗${NC} $*"; }

mkdir -p "$DATA_DIR"

info "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  fail "Node.js is not installed"
  echo "  Install from https://nodejs.org (v18+ required)"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.version.slice(1).split('.')[0])")
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  fail "Node.js $NODE_MAJOR is too old (need 18+)"
  exit 1
fi
ok "Node.js $(node --version)"

if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found, installing..."
  npm install -g pnpm
  if ! command -v pnpm &>/dev/null; then
    fail "Failed to install pnpm"
    exit 1
  fi
fi
ok "pnpm $(pnpm --version)"

info "Installing dependencies..."
cd "$ROOT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

info "Building OpenBridge..."
pnpm build

ok "Build complete"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${OLD_PID}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    info "Stopping existing OpenBridge daemon (PID $OLD_PID)..."
    kill "$OLD_PID" || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

info "Starting OpenBridge daemon on WS port $WS_PORT, API port $API_PORT..."
OPENBRIDGE_NO_MCP=1 nohup node "$ROOT_DIR/packages/daemon/dist/cli/index.js" serve \
  --port "$WS_PORT" \
  --api-port "$API_PORT" \
  >"$LOG_FILE" 2>&1 &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$PID_FILE"

sleep 2

if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
  fail "Daemon failed to start. Check log: $LOG_FILE"
  cat "$LOG_FILE"
  exit 1
fi
ok "Daemon started (PID $DAEMON_PID)"

info "Running health check..."
sleep 1
HEALTH=$(curl -s "http://127.0.0.1:$API_PORT/health" 2>/dev/null || echo "")
if [[ -n "$HEALTH" ]]; then
  ok "Local API is responding"
else
  warn "Local API not responding yet (may need a moment)"
fi

echo ""
echo -e "${GREEN}OpenBridge is running!${NC}"
echo ""
echo "  Daemon PID:    $DAEMON_PID"
echo "  WebSocket:     ws://127.0.0.1:$WS_PORT/bridge"
echo "  Local API:     http://127.0.0.1:$API_PORT"
echo "  Log file:      $LOG_FILE"
echo ""
echo "Next steps:"
echo "  1. Load the extension in Chrome from: $ROOT_DIR/packages/extension/.output/chrome-mv3"
echo "     (chrome://extensions → Developer mode → Load unpacked)"
echo "  2. Click the OpenBridge extension icon and press Pair"
echo "  3. Add this MCP config to your AI client:"
echo ""
cat <<EOF
{
  "mcpServers": {
    "openbridge": {
      "command": "node",
      "args": [
        "$ROOT_DIR/packages/daemon/dist/cli/index.js",
        "mcp",
        "--api-port",
        "$API_PORT"
      ]
    }
  }
}
EOF
echo ""
echo "To stop: kill $DAEMON_PID  (or: kill \$(cat $PID_FILE))"
echo "To diagnose: node $ROOT_DIR/packages/daemon/dist/cli/index.js doctor"
