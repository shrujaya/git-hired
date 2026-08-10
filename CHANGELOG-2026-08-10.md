# Change log — cross-platform setup, Tavus API migration, live conversation

**Baseline:** [`2f346e3`](https://github.com/shrujaya/git-hired/commit/2f346e37174a03c38a1b6e725dc44778e8142f59)
— *"feat: add setup script and environment configuration…"* (Shruti Jayaraman, 2026-08-09)
**Branch:** `v2.0` · **Date:** 2026-08-10

The work landed in two batches:

| Batch | Contents | State |
| --- | --- | --- |
| **1** | Cross-platform setup, Tavus API migration, live conversation (§1–5) | Committed as [`7eca195`](https://github.com/shrujaya/git-hired/commit/7eca195) |
| **2** | Interview-page redesign, working device controls, conversation-quality fixes (§6–7) | Uncommitted working tree |

`git diff 2f346e3` reproduces both batches together.

---

## TL;DR for the next person

Five things happened, each triggered by the previous one failing:

1. **The repo did not run on Windows.** Fixed the setup/run scripts, the venv
   layout assumption, a console crash, and CWD-dependent config.
2. **The Tavus avatar was dead code.** The backend paid for a Tavus conversation
   on every interview and the frontend threw the URL away. Wired it up — which
   surfaced that Tavus had renamed half its API.
3. **The interview had a push-to-talk button.** Replaced with Tavus's real
   turn-taking, which required inverting the integration: Tavus now calls *into*
   this backend as its LLM.
4. **The interview page didn't look like a call.** Rebuilt as a meeting-app
   layout; mic and camera became real controls.
5. **The live conversation didn't feel human.** Long silences between turns, a
   monologue opening, and the coding question firing after one answer — all
   traced to concrete causes and fixed (§7).

**If you only read one thing:** the backend needs a **public URL**
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

## 6. Interview page rebuilt as a meeting app

*(Batch 2 — uncommitted)*

The page was a light-blue three-card dashboard. It is now a video-call layout:
full-bleed dark shell, the interviewer as the main stage, the candidate's own
camera bottom-right over it, a control bar, and a right-hand panel.

- **Full-bleed** — the old shell was capped at `max-w-[1560px]` with page
  padding, leaving a grey border around the app.
- **Self-view** sits bottom-right at `w-56 → w-64 → w-80`, with its ring
  encoding state: green while you speak, amber if your face leaves frame, red
  when the camera is off. The mic level is overlaid inside it.
- **Side panel** replaces the old chat box: a **Transcript** tab (conversation
  bubbles built from real speech events) and a **Code** tab that stays disabled
  until a coding question is actually asked — at which point the panel opens and
  switches itself.
- **Removed by request:** the Mute and Interject buttons that had been added
  alongside the avatar card.

### Mic and camera are real controls now

They started as status indicators. Making them work exposed a trap worth
knowing: **there are two separate audio captures.** `getUserMedia` feeds the
level meter and the face-tracking frames, while Daily runs its *own* microphone
capture for what Tavus actually hears. Muting only the local track would look
muted while the interviewer kept listening — a bad failure in an interview. So
`handleToggleMic` disables the local track **and** calls `avatar.setMic(false)`.

The hook's `toggleMic()` became `setMic(enabled)` plus an intent ref, so a mute
chosen while the avatar is still connecting is re-applied on join instead of
being silently reset.

Camera-off also had to stop the face-tracking frames: black frames are scored by
the backend as "candidate left the frame". `captureAndSendFrame` now reads the
track's live `enabled` state rather than React state, because it runs inside a
`setInterval` closure that would otherwise see a stale value.

---

## 7. Making the conversation feel human

*(Batch 2 — uncommitted)*

Four complaints from the first live run, each with a distinct cause.

### Multi-second delay between turns → **measured 4.6s to 2.1s**

Not one slow call — **two sequential Claude calls per turn**. Every answer ran
`evaluate_response_quality` (1.9s) and *then* `get_next_question` (2.7s), with
the candidate sitting in silence through both.

- **Scoring moved off the critical path.** It only feeds difficulty for *later*
  questions, so it never had to land before the current one is asked. It now
  runs in a daemon thread and applies when it arrives.
- **`max_tokens` 8192 → 1024 + `effort: "low"`** for conversational turns.
  A spoken turn is 2–4 sentences; the 8192 budget exists for report generation,
  and adaptive thinking expands to fill whatever headroom it is given. Report
  generation keeps the large budget.

### Coding question after a single answer

**Tavus calls `/v1/chat/completions` more than once per candidate turn** — a
retry, plus an opening call carrying no answer yet — and every call advanced
`current_question_num`. Four calls reached the coding gate (`warmup + 2`) after
one real answer, and billed a Claude call each time.

The endpoint is now **idempotent per answer**: an empty call holds the floor
without consuming a question, and a repeated answer replays the cached reply
instead of advancing. UI events (transcript push, code-editor open) only fire on
a genuinely fresh turn.

### Opening was a long unstoppable monologue

Two causes: the 8192-token budget, and
[`agent_prompts.py`](server/prompts/agent_prompts.py) literally prescribing the
preamble ("No trick questions… take your time"). Both fixed — the template now
says that preamble *is* the monologue problem.

Measured: **~110 words (~45s spoken) → 41 words (~16s)**.
`TAVUS_INTERRUPTIBILITY=high` so the avatar yields the moment you speak, and
`TAVUS_IDLE_ENGAGEMENT=off` so it waits through a thinking pause.

### Transcript only showed the first message

The opening is seeded from `/api/interview/start`; everything after depends on
Tavus `conversation.utterance` events, which were not being read.

> ⚠️ **This fix is defensive, not confirmed.** The Tavus event-schema pages do
> not return their JSON payloads through WebFetch (three URLs tried), so the
> exact transcript key is unverified. The hook reads
> `properties.speech ?? text ?? transcript ?? content` and the speaker from
> `role ?? speaker`, and **logs any unreadable utterance and any unhandled
> event type to the console** under `[avatar]`. If the transcript is still empty,
> those log lines name the real field — pin it and delete the fallbacks.

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
| `TAVUS_INTERRUPTIBILITY` | `medium` | How readily the avatar yields when talked over (local `.env` runs `high`) |
| `TAVUS_IDLE_ENGAGEMENT` | `off` | `off` never prompts during silence |
| `TAVUS_VOICE_ISOLATION` | `near` | Background-noise filtering |
| `REPLY_MAX_TOKENS` | `1024` | Budget for **one spoken turn** — reports keep the 8192 budget |
| `REPLY_EFFORT` | `low` | Effort for conversational turns; the main latency lever |

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

**Modified (batch 1)** — `server/backend/server.py`, `server/config/settings.py`,
`server/agents/report_generator.py` (missing `encoding='utf-8'` on a transcript
read — would break on Windows with accented names), `setup.sh`, `README.md`,
`.gitignore`, and the frontend pages/types/utils.

**Modified (batch 2)** — `InterviewPage.tsx` (+935/−… — the layout rebuild),
`useTavusAvatar.ts` (device control + defensive utterance parsing),
`server/backend/server.py` (turn idempotency + timing logs),
`server/agents/interviewer.py` (background scoring, reply budget),
`server/config/settings.py` (`REPLY_*`), `server/prompts/agent_prompts.py`
(opening template), `README.md` (cloudflared install + tunnel health check).

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
- **Tunnel install verified**: `cloudflared` installed via winget and a quick
  tunnel proven to reach the backend from the public internet.

**Batch 2:**

- **7/7 turn-idempotency tests** (stubbed agent): an empty call consumes no
  question, a repeated answer replays rather than re-asks, and the coding
  question lands on the 4th answer instead of the 1st.
- **Latency measured against the live Anthropic key**: scoring call 1.9s,
  reply 2.7s → 2.1s. Total blocking work per turn 4.6s → 2.1s.
- **Opening length measured**: 41 words / ~16s spoken (was ~110 words / ~45s).
- `tsc --noEmit` clean; production build passes; Vite transforms both changed
  modules at runtime.

**Not verified in either batch:** the live in-browser call — it needs a real
microphone, camera permissions, and a running tunnel. In particular the
**transcript field names are unconfirmed** (§7) and the rendered layout of §6
was never seen in a browser from this session. Residual risk is mostly *tuning*
and field naming rather than plumbing.

---

## Known issues / follow-ups

1. **`server/src/logs/eye_tracking_log.jsonl` is tracked in git** and has now
   been *committed* with ~160 lines of runtime test data (96 in `7eca195`, ~63
   more uncommitted). It is generated output: `.gitignore` it and
   `git rm --cached` it. Every test run dirties the working tree until then.
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
7. **Transcript field names unconfirmed** (§7) — the hook reads four candidate
   keys and logs what it cannot parse. First person to run a live interview:
   check the console for `[avatar]` lines, pin the real key, drop the fallbacks.
8. **Side panel is `hidden md:flex`** — below ~768px it disappears rather than
   squashing the video. An overlay drawer would be the fix if mobile matters.
9. **Difficulty scoring is now asynchronous** (§7). A score can land after the
   next question was already chosen, so adaptation lags by up to one turn. That
   is the deliberate trade for halving the silence; if strict ordering ever
   matters, await the score for the *following* question rather than inline.

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
