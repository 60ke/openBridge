#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.openbridge-data"
LOG_FILE="$DATA_DIR/daemon.log"
WS_PORT="${OPENBRIDGE_WS_PORT:-10087}"
API_PORT="${OPENBRIDGE_API_PORT:-10088}"
INSTALL_SKILL=1
START_DAEMON=1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()  { echo -e "${RED}  ✗${NC} $*"; }

wait_for_local_api() {
  local port="$1"
  local attempts="${2:-20}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

usage() {
  cat <<EOF
Usage: ./install.sh [options]

Options:
  --no-skill   Build and start OpenBridge, but skip skill installation
  --no-start   Build and install skill, but do not start the daemon
  -h, --help   Show this help

Environment:
  OPENBRIDGE_WS_PORT   WebSocket port, default 10087
  OPENBRIDGE_API_PORT  Local API port, default 10088
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-skill)
      INSTALL_SKILL=0
      shift
      ;;
    --no-start)
      START_DAEMON=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

install_skill_to_dir() {
  local target_root="$1"
  local skill_dir="$target_root/skills/openbridge-webbridge"
  local template="$ROOT_DIR/skills/openbridge-webbridge/SKILL.md.template"

  if [[ ! -f "$template" ]]; then
    warn "Skill template not found: $template"
    return 1
  fi

  mkdir -p "$skill_dir"
  sed \
    -e "s|{{ROOT_DIR}}|$ROOT_DIR|g" \
    -e "s|{{API_PORT}}|$API_PORT|g" \
    "$template" > "$skill_dir/SKILL.md"
  ok "Installed OpenBridge skill: $skill_dir/SKILL.md"
}

install_skills() {
  info "Installing OpenBridge skill..."

  local installed=0

  if [[ -n "${CODEX_HOME:-}" ]]; then
    install_skill_to_dir "$CODEX_HOME" && installed=1
  fi

  install_skill_to_dir "$HOME/.codex" && installed=1

  if [[ -d "$HOME/.agents" ]]; then
    install_skill_to_dir "$HOME/.agents" && installed=1
  fi

  if [[ "$installed" -eq 0 ]]; then
    warn "No supported skill runtime found. You can copy the template from:"
    echo "  $ROOT_DIR/skills/openbridge-webbridge/SKILL.md.template"
  fi
}

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

if [[ "$INSTALL_SKILL" -eq 1 ]]; then
  install_skills
fi

if [[ "$START_DAEMON" -eq 1 ]]; then
  info "Starting OpenBridge daemon..."
  node "$ROOT_DIR/packages/daemon/dist/cli/index.js" restart \
    --port "$WS_PORT" \
    --api-port "$API_PORT"

  RUNTIME_FILE="$DATA_DIR/runtime.json"
  if [[ -f "$RUNTIME_FILE" ]]; then
    API_PORT="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(r.apiPort)" "$RUNTIME_FILE")"
    WS_PORT="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(r.wsPort)" "$RUNTIME_FILE")"
    DAEMON_PID="$(node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log(r.pid)" "$RUNTIME_FILE")"
  else
    DAEMON_PID=""
  fi

  if ! curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
    fail "Daemon failed to start. Check log: $LOG_FILE"
    cat "$LOG_FILE"
    exit 1
  fi
  ok "Daemon started (PID $DAEMON_PID)"

  info "Running health check..."
  if wait_for_local_api "$API_PORT" 10; then
    ok "Local API is responding"
  else
    warn "Local API not responding yet (may need a moment)"
  fi
else
  DAEMON_PID=""
  warn "Skipped daemon startup (--no-start)"
fi

echo ""
if [[ -n "${DAEMON_PID:-}" ]]; then
  echo -e "${GREEN}OpenBridge is running!${NC}"
else
  echo -e "${GREEN}OpenBridge is installed!${NC}"
fi
echo ""
if [[ -n "${DAEMON_PID:-}" ]]; then
  echo "  Daemon PID:    $DAEMON_PID"
fi
echo "  WebSocket:     ws://127.0.0.1:$WS_PORT/bridge"
echo "  Local API:     http://127.0.0.1:$API_PORT"
echo "  Log file:      $LOG_FILE"
echo ""
echo "Next steps:"
echo "  1. Load the extension in Chrome from: $ROOT_DIR/packages/extension/.output/chrome-mv3"
echo "     (chrome://extensions -> Developer mode -> Load unpacked)"
echo "  2. The extension should authorize automatically once loaded."
echo "  3. In Codex, use the installed openbridge-webbridge skill."
echo ""
echo "Optional MCP config:"
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
if [[ -n "${DAEMON_PID:-}" ]]; then
  echo "To stop: node $ROOT_DIR/packages/daemon/dist/cli/index.js stop"
else
  echo "To start: node $ROOT_DIR/packages/daemon/dist/cli/index.js start"
fi
echo "To diagnose: node $ROOT_DIR/packages/daemon/dist/cli/index.js doctor"
