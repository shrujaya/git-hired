# Troubleshooting

Longer-form notes that would have crowded the [README](../README.md). Most of
these were expensive to work out once; none of them should have to be worked
out twice.

## Avatar

### Connects, but never speaks

Tavus could not call this backend. A PAL stores `TAVUS_LLM_BASE_URL` at creation
time, so a stale tunnel hostname is the usual cause — and the failure is silent:
the avatar appears, listens, and says nothing.

1. Confirm the tunnel is still running and the URL still resolves.
2. Check the endpoint answers from outside:

   ```bash
   curl -X POST https://<tunnel-host>/v1/chat/completions \
     -H "Authorization: Bearer $TAVUS_LLM_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"messages":[]}'
   ```

   A `404 Session not found` is a *healthy* response here — it means auth
   passed. A `401` means the key does not match.
3. After changing `TAVUS_LLM_BASE_URL`, clear `TAVUS_PAL_ID` so a new PAL is
   provisioned against the new URL, then restart.

Under `docker compose` this is handled automatically: the URL is re-resolved
each boot and a pinned PAL id is discarded when it belongs to a previous tunnel.

### `Tavus conversation failed (400): Invalid replica_uuid`

The backend prints the exact Tavus rejection at session init. This one almost
always means the wrong *kind* of id is configured.

- `TAVUS_FACE_ID` must be a **face** id (starts with `r`), not a PAL id
  (starts with `p`).
- `TAVUS_PAL_ID`, if set, must be a **PAL** id (`p…`).
- The face must be fully processed (`status: completed`).

List what the account actually has:

```bash
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=user"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=system"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/pals?pal_type=user"
```

> Tavus renamed *replica* → **face** and *persona* → **PAL**. A legacy
> `TAVUS_REPLICA_ID` is still read as a face id.

### It asks its own questions instead of the agent's

`TAVUS_PAL_ID` points at a PAL whose LLM layer is not aimed at this backend —
typically one made by hand in the Tavus dashboard. Clear it and let the server
provision its own.

### It interrupts too eagerly, or waits too long

Tune `TAVUS_TURN_TAKING_PATIENCE` and `TAVUS_INTERRUPTIBILITY`, then clear
`TAVUS_PAL_ID` so the PAL is rebuilt with the new values. They are baked in at
creation and cannot be changed on an existing PAL.

## Reports and email

Report generation is a slow Claude call that runs *after* `/api/interview/end`
responds. Poll `/api/interview/report-status/{session_id}` for the outcome.

A `535 Username and Password not accepted` is a credentials problem, not a code
problem. Gmail has not accepted account passwords over SMTP since 2022 — you
need a 16-character App Password from an account with 2-Step Verification. The
report is written to disk before the send is attempted, so it is never lost:
look in `server/reports/<session_id>/`.

## Docker

**The build takes minutes on Apple Silicon.** The backend image is
`linux/amd64` and runs under Rosetta, because mediapipe publishes no
`linux/arm64` wheel and building it from source is a multi-hour Bazel job. Face
tracking runs at 2 frames/second, so the emulation is not a problem at runtime.

**`docker compose exec` shows the wrong `TAVUS_LLM_BASE_URL`.** It is not wrong.
`exec` starts a new process with the container's *declared* environment, which
still holds whatever is in `server/.env`. The entrypoint's exports only exist in
the process tree it started. To see what the server actually has:

```bash
docker compose exec backend sh -c 'tr "\0" "\n" < /proc/1/environ | grep TAVUS'
```

**Frontend dependency changes need `docker compose down -v`.** `node_modules`
lives in a named volume so the container's Linux binaries are not shadowed by
the host's macOS ones; rebuilding the image alone will not refresh it.

**`pynput` is not installed in the image.** It builds `evdev` from source on
Linux, and the module that imports it is deliberately not wired into the backend
anyway — it watches the keyboard of the machine it runs on, which in a container
is the server rather than the candidate. See the docstring in
`server/agents/proctoring.py`.

## Windows

### `npm.ps1 cannot be loaded because running scripts is disabled`

PowerShell's default execution policy is `Restricted`, which blocks every
`.ps1` — including npm's own wrapper.

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

`RemoteSigned` allows local scripts and still requires a signature on anything
downloaded. Alternatives: use the `.cmd` shim (`npm.cmd install`), which is not
subject to the policy, or `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
for the current window only.

### `'..' is not recognized as an internal or external command`

Command Prompt cannot launch an executable via a forward-slash relative path —
it splits on `/` and tries to run `..`. Use backslashes, or the run script:

```
cd server\backend && ..\..\.venv\Scripts\python.exe server.py
```
```powershell
.\run.ps1 backend
```

### `[WinError 10013] An attempt was made to access a socket in a way forbidden…`

The Windows equivalent of "address already in use" — another process, often a
background service, holds the port.

```
netstat -ano | findstr :8100
tasklist /FI "PID eq <pid_from_above>"
```

Then stop it, or change `PORT` in `server/.env` **and** `VITE_API_BASE_URL` in
`agentic-interviewer/.env.local` to match.

### `UnicodeEncodeError: 'charmap' codec can't encode character`

A legacy console codepage cannot encode the emoji in the status output. The
server calls `enable_unicode_output()` at startup to prevent this. Standalone
scripts under `server/src/` need the same call, or `PYTHONUTF8=1`.

### `.venv/bin/python: No such file or directory`

Windows virtualenvs use `Scripts\python.exe`, not `bin/python`. The `run` and
`setup` scripts detect the layout automatically.

## Digging into a session

Everything for one interview lands in a single directory:

```bash
ls server/logs/<session_id>/
cat server/logs/<session_id>/interview_transcript.txt
```

Continuous eye and input tracking is in `server/logs/tracking/`. Reports are in
`server/reports/<session_id>/`.

Paths come from `LOGS_DIR` / `TRACKING_DIR` / `REPORTS_DIR` in
`server/config/settings.py` and are anchored to `server/`, never to the working
directory — so they resolve identically from the repo root, `server/backend`, or
an IDE with its own cwd.
