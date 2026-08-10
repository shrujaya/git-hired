#!/usr/bin/env bash
#
# Git-Hired development setup.
#
#   ./setup.sh
#
# Idempotent: safe to re-run after pulling changes. Creates .venv/ for the
# Python backend, installs frontend node_modules, and seeds server/.env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

VENV="$REPO_ROOT/.venv"
FRONTEND="$REPO_ROOT/agentic-interviewer"

# --- pretty output ---------------------------------------------------------
if [ -t 1 ]; then
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
    BOLD=''; RED=''; GREEN=''; YELLOW=''; RESET=''
fi
step() { printf '\n%s==> %s%s\n' "$BOLD" "$1" "$RESET"; }
ok()   { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()  { printf '\n%serror:%s %s\n\n' "$RED" "$RESET" "$1" >&2; exit 1; }

# --- 1. find a usable Python ----------------------------------------------
# mediapipe 0.10.21 publishes no wheels for 3.13+, and the repo's floor is 3.9.
step "Locating Python (3.9-3.12)"

PYTHON=""
for candidate in python3.12 python3.11 python3.10 python3.9 python3 python; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if "$candidate" -c 'import sys; sys.exit(0 if (3,9) <= sys.version_info[:2] <= (3,12) else 1)' 2>/dev/null; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    found="$(python3 -V 2>&1 || echo 'none found')"
    die "need Python 3.9-3.12 (mediapipe has no 3.13+ wheels); found: $found
    macOS:  brew install python@3.12
    Ubuntu: sudo apt install python3.12 python3.12-venv"
fi
ok "$($PYTHON -V) at $(command -v "$PYTHON")"

# --- 2. create the virtualenv ---------------------------------------------
step "Creating virtualenv at .venv"

# A venv built from a different interpreter than the one selected above will
# silently install into the wrong Python; rebuild when that happens.
if [ -d "$VENV" ]; then
    if [ ! -x "$VENV/bin/python" ]; then
        warn "existing .venv looks broken - recreating"
        rm -rf "$VENV"
    elif ! "$VENV/bin/python" -c 'import sys; sys.exit(0 if (3,9) <= sys.version_info[:2] <= (3,12) else 1)' 2>/dev/null; then
        warn "existing .venv has an unsupported Python - recreating"
        rm -rf "$VENV"
    fi
fi

if [ -d "$VENV" ]; then
    ok "reusing existing .venv ($("$VENV/bin/python" -V))"
else
    "$PYTHON" -m venv "$VENV" || die "could not create venv.
    On Debian/Ubuntu you may need: sudo apt install python3-venv"
    ok "created ($("$VENV/bin/python" -V))"
fi

# --- 3. install Python dependencies ---------------------------------------
step "Installing Python dependencies"
"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet -r "$REPO_ROOT/requirements.txt" \
    || die "dependency install failed (see output above)"
ok "installed from requirements.txt"

# The failure this guards against is silent at install time and only shows up
# as a RuntimeError when the server imports mediapipe.
step "Verifying mediapipe / protobuf compatibility"
if "$VENV/bin/python" - >/dev/null 2>&1 <<'PY'
import mediapipe as mp
mp.solutions.face_mesh.FaceMesh(max_num_faces=1)
PY
then
    ok "mediapipe loads (protobuf $("$VENV/bin/python" -c 'import google.protobuf as p; print(p.__version__)'))"
else
    die "mediapipe failed to initialise.
    This is usually protobuf 5.x. Fix with:
      .venv/bin/pip install 'protobuf>=4.25.3,<5'"
fi

# --- 4. seed server/.env ---------------------------------------------------
step "Configuring server/.env"
if [ -f "$REPO_ROOT/server/.env" ]; then
    ok ".env already exists - leaving it untouched"
else
    cp "$REPO_ROOT/server/.env.example" "$REPO_ROOT/server/.env"
    ok "created server/.env from .env.example"
    warn "add your ANTHROPIC_API_KEY to server/.env before starting the backend"
fi

# --- 5. frontend -----------------------------------------------------------
step "Installing frontend dependencies"
if ! command -v npm >/dev/null 2>&1; then
    warn "npm not found - skipping frontend."
    warn "Install Node 18+ from https://nodejs.org, then run: cd agentic-interviewer && npm install"
else
    ok "npm $(npm --version) / node $(node --version)"
    (cd "$FRONTEND" && npm install --no-fund --no-audit --loglevel=error) \
        || die "npm install failed (see output above)"
    ok "installed agentic-interviewer/node_modules"
fi

# --- done ------------------------------------------------------------------
KEY_SET=""
if [ -f "$REPO_ROOT/server/.env" ]; then
    KEY_SET="$(grep -E '^ANTHROPIC_API_KEY=.+' "$REPO_ROOT/server/.env" || true)"
fi

printf '\n%s==> Setup complete%s\n\n' "$BOLD" "$RESET"
if [ -z "$KEY_SET" ]; then
    printf '  %s1.%s Add your key to %sserver/.env%s:  ANTHROPIC_API_KEY=sk-ant-...\n' "$BOLD" "$RESET" "$BOLD" "$RESET"
    printf '  %s2.%s Backend:   cd server/backend && ../../.venv/bin/python server.py\n' "$BOLD" "$RESET"
    printf '  %s3.%s Frontend:  cd agentic-interviewer && npm run dev\n\n' "$BOLD" "$RESET"
else
    printf '  %s1.%s Backend:   cd server/backend && ../../.venv/bin/python server.py\n' "$BOLD" "$RESET"
    printf '  %s2.%s Frontend:  cd agentic-interviewer && npm run dev\n\n' "$BOLD" "$RESET"
fi
printf '  Backend  http://localhost:8000  (docs at /docs)\n'
printf '  Frontend http://localhost:5173\n\n'
