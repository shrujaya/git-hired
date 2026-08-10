# Change log — cross-platform setup, Tavus API migration, live conversation

**Baseline:** [`2f346e3`](https://github.com/shrujaya/git-hired/commit/2f346e37174a03c38a1b6e725dc44778e8142f59)
— *"feat: add setup script and environment configuration…"* (Shruti Jayaraman, 2026-08-09)
**Branch:** `v2.0` · **Date:** 2026-08-10 · **Author:** Claude Code session (uncommitted working tree)

Everything below is **uncommitted** at the time of writing. `git diff` against
`2f346e3` reproduces it exactly.

---

## TL;DR for the next person

Three things happened, in order, each triggered by the previous one failing:

1. **The repo did not run on Windows.** Fixed the setup/run scripts, the venv
   layout assumption, a console crash, and CWD-dependent config.
2. **The Tavus avatar was dead code.** The backend paid for a Tavus conversation
   on every interview and the frontend threw the URL away. Wired it up — which
   surfaced that Tavus had renamed half its API.
3. **The interview had a push-to-talk button.** Replaced with Tavus's real
   turn-taking, which required inverting the integration: Tavus now calls *into*
   this backend as its LLM.

**If you only read one thing:** the backend now needs a **public URL**
(`TAVUS_LLM_BASE_URL`) for the avatar to work at all. Locally that means running
a tunnel. See [Live conversation setup](README.md#live-conversation-setup).

---

## 1. Cross-platform (Windows + macOS/Linux)

### What was broken

| Symptom | Cause |
| --- | --- |
| `'..' is not recognized as an internal or external command` | Command Prompt cannot launch an exe via a forward-slash relative path |
| `.venv/bin/python: No such file or directory` | Windows venvs use `Scripts\python.exe`, not `bin/python` |
| `[WinError 10013] …socket…forbidden` | Port 8000 held by a background service; on Windows that surfaces as "forbidden", not "in use" |
| `UnicodeEncodeError: 'charmap' codec…` (latent) | Emoji in startup output vs. the legacy Windows console codepage — reproduced, would have crashed the server at startup |
| Config resolving differently per launch dir | `load_dotenv()` searched the CWD; eye-tracking log path was CWD-relative |

### What changed

- **[`setup.ps1`](setup.ps1)** (new) and **[`run.ps1`](run.ps1)** (new) — native
  PowerShell entry points. **[`setup.sh`](setup.sh)** fixed and
  **[`run.sh`](run.sh)** added for macOS/Linux/Git Bash.
  - `run.{sh,ps1} backend|frontend` replaces the error-prone
    `cd server/backend && ../../.venv/bin/python server.py`.
  - Setup now checks for a usable `.venv` **before** hunting for a system
    interpreter, so re-runs work on machines whose only PATH Python is too new.
  - Escape hatch for undiscoverable interpreters (conda envs, unregistered
    installs): `PYTHON_OVERRIDE=/path/to/python ./setup.sh` /
    `.\setup.ps1 -Python C:\path\to\python.exe`. Also auto-detects an active
    `CONDA_PREFIX` / `VIRTUAL_ENV`.
- **Default port 8000 → 8100**, now env-driven via `HOST` / `PORT`
  ([settings.py `ServerConfig`](server/config/settings.py#L120)). The server
  pre-binds and prints an actionable message instead of a traceback.
- **[`server/config/console.py`](server/config/console.py)** (new) — forces UTF-8
  on stdout/stderr. Called first thing in `server.py`, before anything prints.
  Fixes the emoji crash without editing ~8 files of emoji.
- **CWD independence** — `.env` is loaded from `server/.env` by absolute path;
  the eye-tracking log is anchored to the repo. Config now resolves identically
  from the repo root, `server/backend`, or an IDE.

### PowerShell gotchas encoded in the scripts

Worth knowing before editing `setup.ps1`:

- Windows PowerShell wraps **native-exe stderr** in `ErrorRecord`s, which
  `$ErrorActionPreference='Stop'` turns fatal — mediapipe logs to stderr *on
  success*. Hence `Invoke-Native` / `Invoke-NativeQuiet` helpers.
- A PS function returns **everything** written to the output stream, so
  `$rc = Invoke-Native …` would return an array of log lines with the exit code
  buried at the end. Hence `| Out-Host`.
- `Start-Process -ArgumentList` does **not** quote arguments — it split a
  `python -c "…"` snippet across argv and made every interpreter look broken.
  Version checks use the call operator instead.
- Bare `npm` resolves to `npm.ps1`, blocked under the default `Restricted`
  execution policy. Scripts use `npm.cmd`.

---

## 2. Config that was documented but never read

`server/.env.example` advertised `ENABLE_AVATAR`, `SMTP_SERVER`,
`MAX_INTERVIEW_DURATION`, question counts — and
[`settings.py`](server/config/settings.py) **read none of them**. Feature flags
were hardcoded `True`.

Concretely: `ENABLE_LIVEKIT=false` in `.env` was silently `true`, and setting
`ENABLE_AVATAR=false` could not disable the avatar.

Added `env_bool()` / `env_int()` helpers
([settings.py#L29](server/config/settings.py#L29)) and wired every documented
variable. `/health` now reflects reality.

**Migration note:** if you relied on a flag being ignored, it is no longer
ignored. Check your `.env`.

---

## 3. Frontend URL centralisation

The backend URL was hardcoded in 5 files, so a port change broke the UI.

- **[`agentic-interviewer/src/config.ts`](agentic-interviewer/src/config.ts)**
  (new) — single source of truth. `apiUrl()` / `wsUrl()`; the WebSocket origin is
  **derived** from `VITE_API_BASE_URL`, so there is only one value to change.
- **[`agentic-interviewer/.env.example`](agentic-interviewer/.env.example)**
  (new) — copy to `.env.local`.

---

## 4. Tavus: dead integration → working avatar

### The bug

The backend created a Tavus conversation on **every** session init
(consuming credits) and returned `avatar_url`.
[`api.utils.ts`](agentic-interviewer/src/utils/api.utils.ts) stored it in
`localStorage`… and **nothing ever read it back**. The UI rendered a hardcoded
placeholder reading *"AI Avatar — Coming Soon"*.

The conversation was also never ended, so it kept running server-side at Tavus
after the candidate left.

### Tavus renamed its API

This is the part most likely to confuse you:

| Old name | Current name | ID prefix |
| --- | --- | --- |
| replica | **face** | `r…` |
| persona | **PAL** | `p…` |

`POST /v2/conversations` now takes **`pal_id` + `face_id`**. The retired
`replica_id` field rejects current IDs with `400 Invalid replica_uuid` — which
is exactly the error this project hit, because a PAL id (`p9b31cbf80c1`) had
been put in the `TAVUS_REPLICA_ID` slot.

`TAVUS_REPLICA_ID` is still accepted as a **legacy alias for the face id**.

Reference: [Tavus API overview](https://docs.tavus.io/api-reference/overview) ·
[Create Conversation](https://docs.tavus.io/api-reference/conversations/create-conversation) ·
[List Faces](https://docs.tavus.io/api-reference/faces/list-faces) ·
[List PALs](https://docs.tavus.io/api-reference/pals/list-pals)

### Useful commands

```bash
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=user"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=system"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/pals?pal_type=user"
```

`test_mode: true` on conversation creation validates a payload **without
consuming credits** — use it when experimenting.

---

## 5. Live conversation (the big architectural change)

### The problem with the obvious approach

Two designs both fail:

- **Embed the Tavus conversation directly** → Tavus runs its own LLM and
  conducts a *second* interview alongside `InterviewerAgent`. Two interviewers
  talking over each other.
- **Echo mode** (`pipeline_mode: "echo"`, browser publishes no mic) → the avatar
  only lip-syncs text we send. Correct output, but Tavus never hears the
  candidate, so there is no turn detection — hence the push-to-talk button.

*(Echo mode was implemented first and then replaced. If you find references to
`conversation.echo`, they are historical.)*

### The design that works

Tavus's PAL exposes an **LLM layer with a custom `base_url`**. Point it at this
backend and the split becomes clean — Tavus owns the ears and mouth,
`InterviewerAgent` owns the brain:

```
candidate speaks
  → Tavus mic + sparrow-1 turn detection decides the thought is finished
  → POST <TAVUS_LLM_BASE_URL>/v1/chat/completions        ← this backend
       → InterviewerAgent: scores the answer, adapts difficulty,
         picks the next question (unchanged logic)
  → streamed back as OpenAI SSE
  → Tavus speaks it through the avatar, lip-synced
  → candidate can talk over it → barge-in interrupt
```

Adaptive difficulty, the coding-question trigger, transcripts and reports all
still come from this repo. No interview logic was rewritten.

### Backend

- **[`POST /v1/chat/completions`](server/backend/server.py#L570)** — OpenAI-compatible,
  SSE-streaming, bearer-guarded. Ignores the requested model and returns
  `InterviewerAgent`'s line.
  - **Session routing:** Tavus has *no per-conversation LLM config*, so the
    session id rides inside `conversational_context` as
    `[git-hired-session: <uuid>]`, which Tavus replays in the system message.
    Recovered by [`_extract_session_id`](server/backend/server.py#L517).
  - The agent's blocking Claude call runs via `asyncio.to_thread`, so one
    candidate cannot stall another's audio.
  - Replies are split on sentence boundaries
    ([`_split_for_speech`](server/backend/server.py#L552)) so Tavus starts
    speaking sooner.
- **[`ensure_tavus_pal`](server/backend/server.py#L165)** — provisions a
  `pipeline_mode: "full"` PAL with `conversational_flow`
  (`sparrow-1`, patience, interruptibility, voice isolation) and the custom LLM
  layer. Logs its id to pin in `TAVUS_PAL_ID`.
  - `speculative_inference: false` **on purpose** — it pre-runs the model on a
    guessed end-of-turn; a discarded speculation would still advance the
    question counter and cost a Claude call.
- **[`end_tavus_conversation`](server/backend/server.py#L289)** — called from
  `/api/interview/end` so conversations stop consuming credits.
- **[`notify_session`](server/backend/server.py#L355)** — questions now reach the
  candidate as *speech*, so the existing `/ws/{session_id}` socket doubles as a
  control channel to open the code editor and keep the on-screen transcript in
  step.
- The interview's opening line is generated at session init and passed as the
  Tavus `custom_greeting`, so the avatar **starts talking on join** — no
  "Start Interview" round trip.

### Frontend

- **[`useTavusAvatar.ts`](agentic-interviewer/src/hooks/useTavusAvatar.ts)** (new)
  — joins the Daily room **publishing the mic** (`audioSource: true`), consumes
  `conversation.utterance` / `conversation.started_speaking` events, exposes
  `interrupt()` and `toggleMic()`. StrictMode-safe (Daily allows one call object
  per page).
- **[`InterviewPage.tsx`](agentic-interviewer/src/pages/InterviewPage.tsx)** —
  push-to-talk replaced by a live status line ("Interviewer speaking — just talk
  to cut in") plus Mute / Interject. The transcript builds itself from real
  speech events.
- Browser `SpeechRecognition` is **disabled while the avatar is live** —
  two recognisers on one mic fight each other. The entire original push-to-talk
  path is retained as the no-avatar fallback.
- New dependency: **`@daily-co/daily-js@^0.91.0`** (Tavus rooms are Daily rooms).

### ⚠️ Operational trap

**The PAL stores `TAVUS_LLM_BASE_URL` at creation time.** When your tunnel
hostname changes, you must update `TAVUS_LLM_BASE_URL` **and clear
`TAVUS_PAL_ID`**, then restart. Otherwise the avatar connects and sits there
silently, pointing at a dead URL.

Health check for the tunnel — `404 Session not found` is the **good** answer
(it means auth passed; `401` means the key is wrong):

```bash
curl -X POST https://<tunnel-host>/v1/chat/completions \
  -H "Authorization: Bearer $TAVUS_LLM_API_KEY" \
  -H "Content-Type: application/json" -d '{"messages":[]}'
```

---

## New environment variables

All in [`server/.env.example`](server/.env.example).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8100` | Bind address |
| `RELOAD` | `true` | Auto-restart on source change |
| `TAVUS_FACE_ID` | stock face | Avatar appearance (`r…`); `TAVUS_REPLICA_ID` still read as alias |
| `TAVUS_PAL_ID` | *(blank)* | Auto-provisioned if unset; pin the logged id |
| `TAVUS_LLM_BASE_URL` | *(blank)* | **Required for avatar.** Public URL Tavus calls |
| `TAVUS_LLM_API_KEY` | *(blank)* | **Required for avatar.** Guards the internet-facing endpoint |
| `TAVUS_TURN_TAKING_PATIENCE` | `high` | `high` waits through thinking pauses |
| `TAVUS_INTERRUPTIBILITY` | `medium` | How readily the avatar yields when talked over |
| `TAVUS_IDLE_ENGAGEMENT` | `off` | `off` never prompts during silence |
| `TAVUS_VOICE_ISOLATION` | `near` | Background-noise filtering |

Frontend: `VITE_API_BASE_URL` in `agentic-interviewer/.env.local`.

**After changing turn-taking values, clear `TAVUS_PAL_ID`** — they are baked
into the PAL at creation.

---

## Files

**Added**

| Path | Purpose |
| --- | --- |
| [`setup.ps1`](setup.ps1) · [`run.ps1`](run.ps1) | Native Windows entry points |
| [`run.sh`](run.sh) | macOS/Linux/Git Bash launcher |
| [`server/config/console.py`](server/config/console.py) | UTF-8 console bootstrap |
| [`agentic-interviewer/src/config.ts`](agentic-interviewer/src/config.ts) | Backend URL single source of truth |
| [`agentic-interviewer/src/hooks/useTavusAvatar.ts`](agentic-interviewer/src/hooks/useTavusAvatar.ts) | Live avatar conversation |
| [`agentic-interviewer/.env.example`](agentic-interviewer/.env.example) | Frontend env template |

**Modified** — `server/backend/server.py` (+411/−41), `server/config/settings.py`,
`server/agents/report_generator.py` (missing `encoding='utf-8'` on a transcript
read — would break on Windows with accented names), `setup.sh`, `README.md`,
`.gitignore`, and the frontend pages/types/utils listed in `git status`.

---

## Verification performed

- **20/20** endpoint contract tests (stubbed agent, no network): auth rejection,
  session routing, OpenAI response shape, SSE framing + `[DONE]`,
  coding-question propagation, marker-parsing edge cases.
- **Live against the Tavus account:** created a full-pipeline PAL and read it
  back — `sparrow-1`, patience, interruptibility, `speculative_inference: false`
  and the custom LLM URL all persisted. Test PALs deleted afterwards.
- **Tunnel verified end-to-end** from the public internet: `/health` → healthy,
  `/v1/chat/completions` → `404` with a valid key (auth passed), `401` without.
- Both setup scripts run clean; backend serves `/health`, `/`, `/docs`;
  `tsc --noEmit` clean; production build passes.

**Not verified:** the live in-browser call — it needs a real microphone,
camera permissions, and a running tunnel. Every layer beneath it is verified,
so residual risk is mostly *tuning* (`TAVUS_TURN_TAKING_PATIENCE` /
`TAVUS_INTERRUPTIBILITY`) rather than plumbing.

---

## Known issues / follow-ups

1. **`server/src/logs/eye_tracking_log.jsonl` is tracked in git** and gained 96
   lines of runtime data during testing. It is generated output and should be
   `.gitignore`d and `git rm --cached`ed. *(Not done here — it would touch a file
   others may have local changes to.)*
2. **`server/.env` contains live secrets.** It is correctly gitignored, but the
   Anthropic and Tavus keys in it have been visible in a working session — rotate
   if that concerns you. `server/.env.example` is the shareable template.
3. **Tunnel hostname churn** — a free Cloudflare account gives a *named* tunnel
   with a fixed hostname, which removes the clear-`TAVUS_PAL_ID` dance. Worth
   doing if iterating often.
4. **`server/src/eye_tracker.py` / `input_tracker.py`** still have CWD-relative
   log paths and `open()` without `encoding`. They are standalone scripts not
   imported by the server, so they were left alone.
5. **Bundle size** — `@daily-co/daily-js` pushes the JS bundle past 500 kB.
   Consider `manualChunks` or a dynamic import if it matters.
6. **`/api/interview/message`** (the old REST turn endpoint) is now unused when
   the avatar is live. Left in place for the fallback path.

---

## Quick start for a new collaborator

```bash
# 1. install
./setup.sh                 # macOS / Linux / Git Bash
.\setup.ps1                # Windows PowerShell

# 2. secrets — add ANTHROPIC_API_KEY (+ Tavus keys for the avatar)
cp server/.env.example server/.env

# 3. run — three terminals
./run.sh backend                                  # → http://localhost:8100
cloudflared tunnel --url http://localhost:8100    # → paste URL into TAVUS_LLM_BASE_URL
./run.sh frontend                                 # → http://localhost:5173
```

Windows PowerShell: `.\run.ps1 backend` / `.\run.ps1 frontend`. If PowerShell
blocks scripts, run once:
`Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

Without `TAVUS_LLM_BASE_URL` the interview still works — it falls back to
push-to-talk with browser TTS.

Full detail lives in [`README.md`](README.md); the Troubleshooting section now
covers every failure mode hit while making this work.
