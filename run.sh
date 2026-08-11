#!/usr/bin/env bash
#
# Start the Git-Hired backend or frontend.
#
#   ./run.sh backend     # FastAPI server
#   ./run.sh frontend    # Vite dev server
#
# For macOS, Linux, and Git Bash on Windows. Native PowerShell users want
# run.ps1 instead.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$REPO_ROOT/.venv"

# Windows venvs put the interpreter in Scripts/; everything else uses bin/.
if [ -x "$VENV/bin/python" ]; then
    VPY="$VENV/bin/python"
else
    VPY="$VENV/Scripts/python.exe"
fi

usage() {
    printf 'usage: %s {backend|frontend}\n' "$0" >&2
    exit 2
}

[ $# -ge 1 ] || usage

case "$1" in
    backend)
        if [ ! -x "$VPY" ]; then
            printf 'error: no virtualenv found at .venv - run ./setup.sh first\n' >&2
            exit 1
        fi
        # server.py resolves its own paths, but uvicorn's reloader imports the
        # app by name, so run from the directory that holds it.
        cd "$REPO_ROOT/server/backend"
        exec "$VPY" server.py
        ;;
    frontend)
        if [ ! -d "$REPO_ROOT/agentic-interviewer/node_modules" ]; then
            printf 'error: frontend dependencies missing - run ./setup.sh first\n' >&2
            exit 1
        fi
        cd "$REPO_ROOT/agentic-interviewer"
        exec npm run dev
        ;;
    *)
        usage
        ;;
esac
