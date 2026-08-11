# Change log — cross-platform setup, Tavus API migration, live conversation, interview structure

**Baseline:** [`2f346e3`](https://github.com/shrujaya/git-hired/commit/2f346e37174a03c38a1b6e725dc44778e8142f59)
— *"feat: add setup script and environment configuration…"* (Shruti Jayaraman, 2026-08-09)
**Branch:** `v2.0` · **Date:** 2026-08-10

The work landed in three batches:

| Batch | Contents | State |
| --- | --- | --- |
| **1** | Cross-platform setup, Tavus API migration, live conversation (§1–5) | Committed as [`7eca195`](https://github.com/shrujaya/git-hired/commit/7eca195) |
| **2** | Interview-page redesign, working device controls, conversation-quality fixes (§6–7) | Committed as [`fe16b0c`](https://github.com/shrujaya/git-hired/commit/fe16b0c) |
| **3** | Interview structure, coding-round assessment, transcript log (§8–§12) | Uncommitted working tree |

`git diff 2f346e3` reproduces all three batches together.

---

## TL;DR for the next person

Seven things happened, each triggered by the previous one failing:

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
6. **The interview had no shape.** It opened mid-question, ran past its own
   question budget forever because nothing compared the counter to it, and
   treated the coding round as a single scored submission. Now: a three-beat
   opening, a hint loop on the coding question, and an interview that ends
   itself and prompts the candidate to leave (§8–§9).
7. **Nothing was ever written down.** `save_transcript()` was only reachable
   from an endpoint nothing calls, so no interview had ever produced a
   transcript. It autosaves every turn now — and the first real log immediately
   exposed three bugs (Known issues 10–12) (§10).

**If you only read one thing:** the backend needs a **public URL**
(`TAVUS_LLM_BASE_URL`) for the avatar to work at all. Locally that means running
a tunnel. See [Live conversation setup](README.md#live-conversation-setup).

**If you only fix one thing:** Known issue 10 — the resume analysis and the
interview are saved under two different session ids, which is why report
generation has never once succeeded.

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

## 8. The interview now has a shape

*(Batch 3 — uncommitted)*

Two structural gaps, both of which a live run made obvious.

### The opening was one turn; it is now three

The greeting and the first question arrived glued together, so the candidate's
very first spoken input was an answer to a technical question. The opening is
now a scripted three-beat warm-up, one beat per candidate turn:

1. **Greeting only** — "Hi Shruti, thanks for joining me today, how are you?"
2. Candidate replies → **"tell me a bit about yourself"**
3. Candidate introduces themselves → **first real question**, picking up on what
   they just said

`opening_stage` walks `awaiting_ack → awaiting_intro → done`
([`interviewer.py`](server/agents/interviewer.py)). Both warm-up turns route
through `_non_question_turn()`, the same path coding hints use.

**Accounting matters here.** The greeting used to *be* question 1, so
`current_question_num` now starts at **0** and the first real question is Q1 —
the candidate still gets the full set. Neither warm-up turn is scored:
`evaluate_response_quality` would otherwise grade "I'm good thanks" as a
technical answer and drag the difficulty down before the interview started.

### The interview never ended

`questions_remaining` was passed into the prompt as advice and compared against
nothing, so the interviewer generated questions past its own budget forever.
The turn after the last planned question now sets `is_final`, instructs the
model to close out rather than ask again, and is logged as a `closing`. It does
not consume a question number.

The frontend learns about it over the control channel (`interview_complete`)
and, after a ~6s delay so the avatar can finish speaking, shows a dialog
offering **End interview** / **Not yet — I have a question**. Dismissing is not
a dead end: a green *Interview complete* pill in the header reopens it. The
delay and the dismiss option both exist because the closing line invites final
questions.

---

## 9. Coding round: assessment, hints, and a locked editor

*(Batch 3 — uncommitted)*

Previously: submit code → `CodeEvaluatorAgent` scored it → the UI announced
*"Score: 7/10"* to the candidate mid-interview → nothing else happened. The
score leak alone changes how a candidate answers everything after it.

Now the round is a conversation. **Submitting only records the code**; the
candidate then explains their logic aloud, and that spoken turn is what gets
assessed — code and explanation together, via the new
[`CodeEvaluatorAgent.assess_attempt()`](server/agents/code_evaluator.py):

| Verdict | Behaviour |
| --- | --- |
| Correct | Brief acknowledgement **plus the next question in the same spoken turn** |
| Incorrect, hints left | One hint naming the flaw without giving the fix; question number does **not** advance |
| Incorrect, hints exhausted | Warm close naming what they got right, then move on |

`CODING_MAX_HINTS` (default 3) bounds it. A candidate who explains before
submitting is nudged rather than skipped, capped at the same limit.

- **One round trip per turn.** `assess_attempt` returns `is_correct` *and* the
  spoken line together via structured outputs — asking for a verdict and then
  generating a line would double the silence. `output_config` carries `effort`
  and a `json_schema` `format` in the same object.
- **Hints must not consume questions**, or three hints would burn three
  interview questions and drag the round into the closing.
- **The rubric still runs** for the report — once, in a background thread, when
  the round closes. `/api/interview/end` prefers `interviewer.coding_score`.
- **A parse failure is treated as correct**, so a logging-level problem can
  never strand a candidate mid-round.

### Editor gating

The editor opens on the coding question and **greys out on submit** (button
reads *Submitted*), because the submitted code is what the interviewer is
assessing — editing it underneath them would make the hint refer to code that
no longer exists. A hint reopens and unlocks it via a new `coding_hint` control
event, and reopens the Code tab: the candidate has usually switched to the
transcript while explaining.

---

## 10. Transcript log

*(Batch 3 — uncommitted)*

`save_transcript()` was only reachable from `/api/interview/end`, which nothing
calls (§ Known issues), so **no interview had ever produced a transcript**. It
would also have raised `KeyError` on the newer entry types if it had run.

The agent now autosaves after every turn — the log is complete and current even
if the candidate just closes the tab — and covers every turn type: greeting,
introduction request, each question with its difficulty, the coding question,
every code submission *with the code*, each hint, and the closing. Header
carries candidate/start/question count; footer carries the average score and
the coding outcome. The JSON gained `coding.attempts`, `coding.score` and
`interview_complete` for the report generator.

Two fixes came with it: the **candidate line now prints before the
interviewer's** (an entry pairs a reply with the answer that prompted it, so
the old order read the conversation backwards), and a failing write is caught —
a logging problem must never interrupt a live interview.

`interviewer.session_id` is now set at session creation rather than at first
code submission.

---

## 11. UI fixes

*(Batch 3 — uncommitted)*

- **The opening appeared twice in the transcript.** It has two independent
  sources — seeded from `/api/interview/start`, and again as the Tavus utterance
  for the `custom_greeting`, which is the same text. Whichever lands first now
  wins; adjacent same-speaker duplicates are dropped, which also absorbs
  duplicate utterance events from turn retries. Comparison is
  whitespace/punctuation-insensitive, since ASR output rarely matches our
  generated text byte for byte.
- **The transcript did not autoscroll.** The effect looked correct, but the
  panel *unmounts* when it is not the active tab: lines arriving while the Code
  tab is open hit a detached ref, and switching back never re-ran the effect.
  `activePanel`/`sidePanelOpen` are now dependencies, and it sets `scrollTop` on
  the container rather than calling `scrollIntoView` on a sentinel — that also
  scrolls every scrollable ancestor and can shift the call layout.
- **The results-page timer never stopped.** It ran a `setInterval` against
  `sessionStart` (set at *device check*, before the landing page), so "Time
  Spent" both over-reported and kept climbing while the candidate read the page.
  The duration is now measured once when the interview ends and simply
  displayed. The in-call timer is also derived from a start timestamp rather
  than an incrementing counter, which backgrounded tabs throttle.
- **Confetti never stopped** on the results page: an early `return` inside
  `if (startTime)` meant the 3s hide was never scheduled for any real session.

---

## 12. Control-channel events

*(Batch 3 — uncommitted)*

Tavus speaks the interviewer's lines, so the browser learns about state changes
only over `/ws/{session_id}`. Batch 3 adds two to the existing
`coding_question`:

| Event | Fires when | UI effect |
| --- | --- | --- |
| `coding_hint` | The interviewer asks for another attempt | Reopens + unlocks the editor |
| `interview_complete` | The closing line has been delivered | Shows the end-of-interview prompt |

All three are gated behind `fresh_turn`. **This matters:** Tavus retries turns,
and without the gate a retry would re-unlock a submitted editor or pop the end
prompt repeatedly.

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
| `CODING_MAX_HINTS` | `3` | Hints offered on the coding question before the interview moves on (§9) |

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

**Modified (batch 3)** — `server/agents/interviewer.py` (+348/−… — opening
stages, coding hint loop, auto-close, transcript writer/autosave),
`server/agents/code_evaluator.py` (`assess_attempt`),
`server/prompts/agent_prompts.py` (three-beat opening, coding-assessment
prompt), `server/backend/server.py` (`coding_hint` / `interview_complete`
events, `/code/submit` records instead of scoring, agent gets `session_id`),
`server/config/settings.py` (`CODING_MAX_HINTS`),
`agentic-interviewer/src/pages/InterviewPage.tsx` (editor gating, end prompt,
transcript dedup + autoscroll), `ResultsPage.tsx` (frozen duration, confetti).

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

**Batch 3:** 93 assertions across five stubbed-agent suites, no network except
where noted.

- **30** coding round: correct/hint/exhausted branches, hints never advance the
  question counter, resubmission replaces the original, parse failure still
  moves on, non-coding turns untouched.
- **20** opening: greeting and introduction request consume no questions,
  neither is scored, real answers resume scoring, and **all 10 questions are
  still asked** after the warm-up.
- **14** auto-close: exactly one closing turn, at the budget and not before;
  the counter stops at 10; the coding question is never the closing turn.
- **19** transcript log: a full interview played end to end, then the real files
  inspected — every turn type present in both formats, both code attempts
  logged, chronological ordering, the file updating per-turn, and a deliberately
  broken save not breaking the interview.
- **10** control events, driven through `/v1/chat/completions` with
  `TestClient`: each event fires on the right turn and **retries do not
  re-fire** it.
- **Live against the Anthropic key**: `assess_attempt` on a wrong brute-force
  solution produced a hint naming the real bug without giving the fix; a correct
  one-pass hash map got a 10-word acknowledgement. This also confirmed
  `output_config` accepts `effort` and a `json_schema` `format` together.
- `tsc --noEmit` clean; production build passes.
- **One live end-to-end interview** (session `307379fb…`) exercised the whole
  batch and produced a complete transcript — see Known issues 10–12 for what it
  exposed.

**Not verified in any batch:** the live in-browser call — it needs a real
microphone, camera permissions, and a running tunnel. In particular the
**transcript field names are unconfirmed** (§7) and the rendered layout of §6
and the §8 end-prompt dialog were never seen in a browser from this session.
Residual risk is mostly *tuning*
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

### Found by the batch-3 live run — all still open

The interview at 22:53 produced a full transcript, and the transcript is what
exposed these. Fix 10 first; it is one line and it unblocks reports.

10. **The resume analysis is filed under a different session id than the
    interview.** [`server.py`](server/backend/server.py) mints a UUID, saves
    `resume_analysis.*` under it, then *reassigns* `session_id` from
    `create_session()`, which mints a second one. One interview lands in two
    directories (`ca878e8d…` has the resume analysis, `307379fb…` has everything
    else). This is why report generation fails with `FileNotFoundError: Resume
    analysis not found` — the same failure the Nov 2025 sessions show.
11. **Tavus placeholder text is stored as the candidate's words.**
    `[the user did not respond]` is treated as a real answer — it consumes a
    question, triggers a hint and gets scored — and
    `<user_audio_analysis>…</user_audio_analysis>` blocks are prepended to
    answers and saved verbatim, so they reach the score and the report as if
    spoken. Both want sanitising on the way in.
12. **The interviewer can ask a coding question off-script.** When the candidate
    asked to skip ahead it offered one at Q2, but `is_coding_question` is
    decided purely by the question counter, so no `coding_question` event fired
    and the editor stayed shut — *"Where do I type? There's no coding editor."*
    The scheduled coding question at Q5 opened it correctly.
13. **`/api/interview/end` is never called.** The endpoint is fully implemented,
    but the only frontend caller is `endInterview()` in `AiInterview.tsx` — a
    page that is not in the router and whose call is explicitly suppressed with
    `void endInterview;`. `handleExitInterview` just navigates to `/results`.
    The transcript no longer depends on it (§10), but the **report, the manager
    email, the Tavus conversation teardown** (so conversations keep consuming
    credits after the candidate leaves) **and session cleanup** all still do.
    The §8 end-of-interview dialog makes this much more visible, since it is now
    the main way out of an interview.

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
