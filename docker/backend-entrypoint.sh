#!/usr/bin/env bash
#
# Resolve the public tunnel URL, then start the backend.
#
# Tavus does not receive audio from us - it calls INTO this backend at
# <public-url>/v1/chat/completions for every interviewer line. So the backend
# has to know its own public address, and with a cloudflared quick tunnel that
# address is different on every boot. Pasting it into server/.env by hand is
# the step this script exists to delete.
#
# Order matters: cloudflared is up and has a hostname before uvicorn imports
# config/settings.py, which snapshots the environment at import time.

set -euo pipefail

# Where cloudflared publishes its metrics API (see docker-compose.yml).
TUNNEL_METRICS_URL="${TUNNEL_METRICS_URL:-http://tunnel:2000}"
TUNNEL_WAIT_SECONDS="${TUNNEL_WAIT_SECONDS:-90}"
# Survives container restarts so a stable tunnel keeps its PAL and secret.
STATE_DIR="${STATE_DIR:-/state}"

log() { printf '[entrypoint] %s\n' "$1"; }

# Match config/settings.py env_bool() exactly, so ENABLE_AVATAR is not true
# here and false ten lines later inside Python.
is_true() {
    case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

mkdir -p "$STATE_DIR"

# --- 1. no avatar, no tunnel ----------------------------------------------
# ENABLE_AVATAR=false is the offline/CI path: nothing calls in from outside,
# so waiting on cloudflared would be 90s of pure delay.
if ! is_true "${ENABLE_AVATAR:-true}"; then
    log "ENABLE_AVATAR is false - skipping tunnel discovery"
    exec "$@"
fi

# --- 2. find the public URL ------------------------------------------------
if [ -n "${TUNNEL_HOSTNAME:-}" ]; then
    # Named tunnel (docker-compose.named-tunnel.yml): the hostname is a
    # DNS record you own, so it is known up front and never changes.
    PUBLIC_URL="https://${TUNNEL_HOSTNAME}"
    TUNNEL_IS_EPHEMERAL=0
    log "using named tunnel hostname: $PUBLIC_URL"
else
    # Quick tunnel: cloudflared invents a *.trycloudflare.com hostname at
    # startup and reports it on its metrics server. Poll until it appears -
    # registering the tunnel with Cloudflare takes a second or two.
    log "waiting for cloudflared to publish a quick-tunnel hostname..."
    TUNNEL_IS_EPHEMERAL=1
    deadline=$(( $(date +%s) + TUNNEL_WAIT_SECONDS ))
    hostname=""
    while [ -z "$hostname" ]; do
        if [ "$(date +%s)" -ge "$deadline" ]; then
            log "ERROR: no tunnel hostname after ${TUNNEL_WAIT_SECONDS}s."
            log "  Check the tunnel container:  docker compose logs tunnel"
            log "  Cloudflare rate-limits quick tunnels; retrying later usually works."
            log "  To run without the avatar instead, set ENABLE_AVATAR=false."
            exit 1
        fi
        # The payload is a single flat key: {"hostname":"foo.trycloudflare.com"}
        hostname="$(
            curl -fsS --max-time 3 "${TUNNEL_METRICS_URL}/quicktunnel" 2>/dev/null \
                | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p'
        )" || hostname=""
        [ -n "$hostname" ] || sleep 1
    done
    PUBLIC_URL="https://${hostname}"
    log "tunnel is up: $PUBLIC_URL"
fi

# This is the whole point of the script. It overrides whatever TAVUS_LLM_BASE_URL
# server/.env happens to hold, so a stale hand-pasted URL cannot win.
export TAVUS_LLM_BASE_URL="$PUBLIC_URL"

# --- 3. shared secret for the internet-facing endpoint ---------------------
# /v1/chat/completions is exposed to the public internet by the tunnel, so it
# is never left unauthenticated. If nobody set a key, mint one and keep it -
# it must stay stable, because it is baked into every PAL created with it.
KEY_FILE="${STATE_DIR}/llm-api-key"
if [ -z "${TAVUS_LLM_API_KEY:-}" ]; then
    if [ ! -s "$KEY_FILE" ]; then
        python -c "import secrets; print(secrets.token_urlsafe(32))" > "$KEY_FILE"
        chmod 600 "$KEY_FILE"
        log "generated a TAVUS_LLM_API_KEY (stored in the docker volume, not in git)"
    fi
    TAVUS_LLM_API_KEY="$(cat "$KEY_FILE")"
    export TAVUS_LLM_API_KEY
fi

# --- 4. invalidate a PAL pinned to a different URL -------------------------
# A Tavus PAL stores the LLM base_url it was created with. Reusing one from a
# previous quick tunnel points Tavus at a dead hostname, and the failure mode
# is silent: the avatar appears, listens, and never speaks. A quick-tunnel URL
# is new on every boot, so any pinned TAVUS_PAL_ID is guaranteed stale.
#
# The server re-uses a PAL across restarts via TAVUS_PAL_CACHE, which is keyed
# by URL and therefore safe.
if [ "$TUNNEL_IS_EPHEMERAL" -eq 1 ] && [ -n "${TAVUS_PAL_ID:-}" ]; then
    log "ignoring pinned TAVUS_PAL_ID - it belongs to a previous tunnel URL"
    export TAVUS_PAL_ID=""
fi

exec "$@"
