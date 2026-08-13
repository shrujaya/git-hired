#!/usr/bin/env bash
#
# Git-Hired development setup.
#
#   ./setup.sh
#   PYTHON_OVERRIDE=/path/to/python3.12 ./setup.sh   # pick the interpreter
#
# For macOS, Linux, and Git Bash on Windows. Native PowerShell users want
# setup.ps1 instead.
#
# Idempotent: safe to re-run after pulling changes. Creates .venv/ for the
# Python backend, installs frontend node_modules, and seeds server/.env.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

VENV="$REPO_ROOT/.venv"
FRONTEND="$REPO_ROOT/agentic-interviewer"

# Windows lays a venv out as Scripts/python.exe; everything else uses
# bin/python. Probe rather than branch on uname - Git Bash reports MINGW but
# can also be driving a venv created by a POSIX-layout Python.
venv_python() {
    if [ -x "$VENV/bin/python" ]; then
        printf '%s' "$VENV/bin/python"
    else
        printf '%s' "$VENV/Scripts/python.exe"
    fi
}

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

# --- 1. virtualenv ---------------------------------------------------------
# mediapipe 0.10.21 publishes no wheels for 3.13+, and the repo's floor is 3.9.
step "Setting up virtualenv at .venv"

VERSION_CHECK='import sys; sys.exit(0 if (3,9) <= sys.version_info[:2] <= (3,12) else 1)'

# A venv built from a different interpreter than the one selected below will
# silently install into the wrong Python; rebuild when that happens.
if [ -d "$VENV" ]; then
    VPY="$(venv_python)"
    if [ ! -x "$VPY" ]; then
        warn "existing .venv looks broken - recreating"
        rm -rf "$VENV"
    elif ! "$VPY" -c "$VERSION_CHECK" 2>/dev/null; then
        warn "existing .venv has an unsupported Python - recreating"
        rm -rf "$VENV"
    fi
fi

# Only go looking for a system interpreter when one is actually needed. A
# working .venv is enough to re-run setup, even on a machine whose only
# PATH Python is too new.
if [ -d "$VENV" ]; then
    ok "reusing existing .venv ($("$(venv_python)" -V))"
else
    PYTHON=""
    PYTHON_ARGS=""

    # An explicit PYTHON=... wins over detection, and is the escape hatch when
    # the only suitable interpreter lives somewhere this would never look.
    if [ -n "${PYTHON_OVERRIDE:-}" ]; then
        "$PYTHON_OVERRIDE" -c "$VERSION_CHECK" 2>/dev/null \
            || die "PYTHON_OVERRIDE=$PYTHON_OVERRIDE is not a working Python 3.9-3.12"
        PYTHON="$PYTHON_OVERRIDE"
    fi

    # An activated conda/virtual environment is a deliberate choice by whoever
    # is running this, so prefer it over whatever happens to be on PATH.
    if [ -z "$PYTHON" ]; then
        for prefix in "${CONDA_PREFIX:-}" "${VIRTUAL_ENV:-}"; do
            [ -n "$prefix" ] || continue
            for rel in bin/python python.exe Scripts/python.exe; do
                if [ -x "$prefix/$rel" ] && "$prefix/$rel" -c "$VERSION_CHECK" 2>/dev/null; then
                    PYTHON="$prefix/$rel"
                    break 2
                fi
            done
        done
    fi

    if [ -z "$PYTHON" ]; then
        for candidate in python3.12 python3.11 python3.10 python3.9 python3 python; do
            command -v "$candidate" >/dev/null 2>&1 || continue
            if "$candidate" -c "$VERSION_CHECK" 2>/dev/null; then
                PYTHON="$candidate"
                break
            fi
        done
    fi

    # Windows installs are usually not on PATH as pythonX.Y - the py launcher
    # is how you reach a specific version.
    if [ -z "$PYTHON" ] && command -v py >/dev/null 2>&1; then
        for ver in 3.12 3.11 3.10 3.9; do
            if py "-$ver" -c "$VERSION_CHECK" >/dev/null 2>&1; then
                PYTHON="py"
                PYTHON_ARGS="-$ver"
                break
            fi
        done
    fi

    if [ -z "$PYTHON" ]; then
        found="$(python3 -V 2>&1 || python -V 2>&1 || echo 'none found')"
        die "need Python 3.9-3.12 (mediapipe has no 3.13+ wheels); found: $found
    macOS:   brew install python@3.12
    Ubuntu:  sudo apt install python3.12 python3.12-venv
    Windows: winget install Python.Python.3.12

    Already have one somewhere this did not look? Point at it directly:
      PYTHON_OVERRIDE=/path/to/python ./setup.sh"
    fi
    ok "using $($PYTHON $PYTHON_ARGS -V) at $(command -v "$PYTHON")"

    $PYTHON $PYTHON_ARGS -m venv "$VENV" || die "could not create venv.
    On Debian/Ubuntu you may need: sudo apt install python3-venv"
    ok "created ($("$(venv_python)" -V))"
fi

VPY="$(venv_python)"
[ -x "$VPY" ] || die "venv created but $VPY is missing - delete .venv and re-run"

# --- 2. install Python dependencies ---------------------------------------
step "Installing Python dependencies"
"$VPY" -m pip install --quiet --upgrade pip
"$VPY" -m pip install --quiet -r "$REPO_ROOT/requirements.txt" \
    || die "dependency install failed (see output above)"
ok "installed from requirements.txt"

# The failure this guards against is silent at install time and only shows up
# as a RuntimeError when the server imports mediapipe.
step "Verifying mediapipe / protobuf compatibility"
if "$VPY" - >/dev/null 2>&1 <<'PY'
import mediapipe as mp
mp.solutions.face_mesh.FaceMesh(max_num_faces=1)
PY
then
    ok "mediapipe loads (protobuf $("$VPY" -c 'import google.protobuf as p; print(p.__version__)'))"
else
    die "mediapipe failed to initialise.
    This is usually protobuf 5.x. Fix with:
      $VPY -m pip install 'protobuf>=4.25.3,<5'"
fi

# --- 3. seed server/.env ---------------------------------------------------
step "Configuring server/.env"
if [ -f "$REPO_ROOT/server/.env" ]; then
    ok ".env already exists - leaving it untouched"
else
    cp "$REPO_ROOT/server/.env.example" "$REPO_ROOT/server/.env"
    ok "created server/.env from .env.example"
    warn "add your ANTHROPIC_API_KEY to server/.env before starting the backend"
fi

# --- 4. frontend -----------------------------------------------------------
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

PORT="$(grep -E '^PORT=[0-9]+' "$REPO_ROOT/server/.env" 2>/dev/null | tail -1 | cut -d= -f2 || true)"
PORT="${PORT:-8100}"

printf '\n%s==> Setup complete%s\n\n' "$BOLD" "$RESET"
n=1
if [ -z "$KEY_SET" ]; then
    printf '  %s%d.%s Add your key to %sserver/.env%s:  ANTHROPIC_API_KEY=sk-ant-...\n' "$BOLD" "$n" "$RESET" "$BOLD" "$RESET"
    n=$((n + 1))
fi
printf '  %s%d.%s Backend:   ./run.sh backend\n' "$BOLD" "$n" "$RESET"
n=$((n + 1))
printf '  %s%d.%s Frontend:  ./run.sh frontend   (separate terminal)\n\n' "$BOLD" "$n" "$RESET"
printf "  Backend  http://localhost:%s  (docs at /docs)\n" "$PORT"
printf '  Frontend http://localhost:5173\n\n'
