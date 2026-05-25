#!/usr/bin/env bash
set -euo pipefail

SCRIPT_SOURCE="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" && pwd)"
LOCAL_INSTALLER="$SCRIPT_DIR/scripts/install-local.sh"

OPENBRIDGE_REPO="${OPENBRIDGE_REPO:-60ke/openBridge}"
OPENBRIDGE_REF="${OPENBRIDGE_REF:-master}"
OPENBRIDGE_INSTALL_ROOT="${OPENBRIDGE_INSTALL_ROOT:-$HOME/.openbridge}"
OPENBRIDGE_INSTALL_DIR="${OPENBRIDGE_INSTALL_DIR:-$OPENBRIDGE_INSTALL_ROOT/repo}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}==>${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC} $*"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $*"; }
fail()  { echo -e "${RED}  ✗${NC} $*"; }

usage() {
  cat <<EOF
Usage:
  ./install.sh [options]
  curl -fsSL https://raw.githubusercontent.com/${OPENBRIDGE_REPO}/${OPENBRIDGE_REF}/install.sh | bash

Options:
  --no-skill   Build and start OpenBridge, but skip skill installation
  --no-start   Build and install skill, but do not start the daemon
  -h, --help   Show this help

Environment:
  OPENBRIDGE_REPO          GitHub repo, default ${OPENBRIDGE_REPO}
  OPENBRIDGE_REF           Git ref to install, default ${OPENBRIDGE_REF}
  OPENBRIDGE_INSTALL_ROOT  Base install dir, default ${OPENBRIDGE_INSTALL_ROOT}
  OPENBRIDGE_INSTALL_DIR   Repo checkout dir, default ${OPENBRIDGE_INSTALL_DIR}
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

if [[ -f "$LOCAL_INSTALLER" && -d "$SCRIPT_DIR/packages" && -d "$SCRIPT_DIR/skills" ]]; then
  exec bash "$LOCAL_INSTALLER" "$@"
fi

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required for network installation"
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  fail "tar is required for network installation"
  exit 1
fi

ARCHIVE_URL="https://github.com/${OPENBRIDGE_REPO}/archive/refs/heads/${OPENBRIDGE_REF}.tar.gz"
TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="$TMP_DIR/openbridge.tar.gz"
EXTRACT_DIR="$TMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

info "Downloading OpenBridge from ${ARCHIVE_URL}..."
curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"

info "Extracting archive..."
tar -xzf "$ARCHIVE_PATH" -C "$EXTRACT_DIR"

SOURCE_DIR="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$SOURCE_DIR" || ! -f "$SOURCE_DIR/scripts/install-local.sh" ]]; then
  fail "Downloaded archive does not contain a valid OpenBridge installer"
  exit 1
fi

mkdir -p "$(dirname "$OPENBRIDGE_INSTALL_DIR")"
rm -rf "$OPENBRIDGE_INSTALL_DIR"
mv "$SOURCE_DIR" "$OPENBRIDGE_INSTALL_DIR"
ok "OpenBridge downloaded to $OPENBRIDGE_INSTALL_DIR"

exec bash "$OPENBRIDGE_INSTALL_DIR/scripts/install-local.sh" "$@"
