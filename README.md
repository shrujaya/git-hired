# 🤖 Git-Hired Interviewer System

A comprehensive, intelligent technical interview platform powered by Claude AI, featuring real-time avatar interaction via Tavus, adaptive questioning, and automated report generation.

## 📋 Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Agents](#agents)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)

## ✨ Features

### Core Capabilities

- **📄 Intelligent Resume Analysis**: Automatically extracts and analyzes resume content against job descriptions
- **🎭 Virtual AI Avatar**: Life-like interviewer avatar powered by Tavus
- **🧠 Adaptive Questioning**: Real-time difficulty adjustment based on candidate responses
- **💻 Code Evaluation**: Logic-focused code assessment (syntax-agnostic)
- **📊 Automated Reporting**: Comprehensive interview reports with scoring
- **📧 Email Integration**: Automatic report delivery to hiring managers
- **💬 Real-time Communication**: WebSocket support for live interviews
- **🎙️ Audio/Video Ready**: Integration with LiveKit for multimedia interviews

### Interview Flow

1. **Resume Upload Screen**
   - Candidate uploads PDF resume
   - Selects job role from dropdown
   - Provides job description

2. **Interview Screen**
   - AI avatar interviewer
   - Real-time conversation
   - Adaptive question difficulty
   - Integrated code editor for coding questions
   - Live video feed of candidate

3. **Automated Evaluation**
   - Response quality assessment
   - Code logic evaluation
   - Comprehensive scoring

4. **Report Generation**
   - Detailed performance analysis
   - Technical assessment scoring
   - Hiring recommendations
   - Email delivery to manager

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  • Resume Upload UI     • Interview Interface               │
│  • Code Editor          • Video/Audio Controls              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ HTTP/WebSocket
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   FastAPI Backend                            │
│  • Session Management   • API Endpoints                     │
│  • WebSocket Handler    • File Processing                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┬─────────────┬──────────────┐
        │         │         │             │              │
┌───────▼───┐ ┌──▼────┐ ┌──▼───────┐ ┌──▼────────┐ ┌───▼──────┐
│  Resume   │ │Interview│ │   Code   │ │  Report   │ │  Tavus   │
│ Evaluator │ │  Agent  │ │Evaluator │ │ Generator │ │  Avatar  │
└───────────┘ └─────────┘ └──────────┘ └───────────┘ └──────────┘
     │             │            │              │            │
     └─────────────┴────────────┴──────────────┴────────────┘
                            │
                     ┌──────▼───────┐
                     │  Claude AI   │
                     │  (Anthropic) │
                     └──────────────┘
```

## 🚀 Installation

### Prerequisites

- **Python 3.9–3.12** — mediapipe publishes no wheels for 3.13+
- **Node.js 18+** with npm (for the React frontend)
- An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com/settings/keys))
- Optional: Tavus keys for the avatar, SMTP credentials for emailed reports

### Quick Start

**macOS / Linux** (and Git Bash on Windows):

```bash
git clone <your-repo-url>
cd git-hired
./setup.sh
```

**Windows** (PowerShell):

```powershell
git clone <your-repo-url>
cd git-hired
.\setup.ps1
```

> If PowerShell blocks the script, allow it for this session only:
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

Both scripts do the same thing: create the `.venv` virtualenv, install backend
and frontend dependencies, verify the mediapipe/protobuf combination actually
loads, and seed `server/.env` from the template. They are idempotent — re-run
either any time.

If you have a suitable Python that auto-detection misses (a conda environment,
or an install not registered with the `py` launcher), point at it directly:

```bash
PYTHON_OVERRIDE=/path/to/python3.12 ./setup.sh          # macOS / Linux
```
```powershell
.\setup.ps1 -Python C:\path\to\python.exe               # Windows
```

Then add your key to `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Running

Two terminals.

**macOS / Linux** (and Git Bash on Windows):

```bash
./run.sh backend      # → http://localhost:8100 (API docs at /docs)
./run.sh frontend     # → http://localhost:5173
```

**Windows** (PowerShell):

```powershell
.\run.ps1 backend     # → http://localhost:8100 (API docs at /docs)
.\run.ps1 frontend    # → http://localhost:5173
```

<details>
<summary>Running without the helper scripts</summary>

The backend must be started from `server/backend` — uvicorn's reloader imports
the app by name.

```bash
cd server/backend && ../../.venv/bin/python server.py            # macOS / Linux
```
```powershell
cd server\backend; ..\..\.venv\Scripts\python.exe server.py      # Windows
```

Note the path differences on Windows: a virtualenv puts the interpreter in
`Scripts\python.exe` rather than `bin/python`, and Command Prompt cannot launch
an executable through a forward-slash relative path (`../../.venv/...` fails
with `'..' is not recognized`) — use backslashes there.
</details>

### Changing the port

The backend defaults to port **8100**. Port 8000 is a common default and is
frequently already taken; on Windows a service holding it surfaces as
`[WinError 10013] An attempt was made to access a socket in a way forbidden by
its access permissions` rather than a plain "address in use".

To use a different port, set it in **both** places so they agree:

```env
# server/.env
PORT=8200
```
```env
# agentic-interviewer/.env.local   (copy from .env.example)
VITE_API_BASE_URL=http://localhost:8200
```

The frontend derives its WebSocket URL from `VITE_API_BASE_URL`, so that is the
only value to change on that side.

### Manual setup

If you'd rather not use the scripts:

```bash
# macOS / Linux
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp server/.env.example server/.env   # then add your API key
cd agentic-interviewer && npm install
```

```powershell
# Windows
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item server\.env.example server\.env   # then add your API key
cd agentic-interviewer; npm install
```

> **Note:** install into a dedicated virtualenv. mediapipe 0.10.21 requires
> protobuf 4.x, and a base environment carrying protobuf 5.x fails at import
> with `RuntimeError: Failed to parse: node {`.

### Configuration

All configuration lives in `server/.env` — see `server/.env.example` for the
full list. The Claude model is set once via `CLAUDE_MODEL` and is not hardcoded
anywhere in the source. To run without the avatar or email features, set
`ENABLE_AVATAR=false` / `ENABLE_EMAIL_NOTIFICATIONS=false`.

## ⚙️ Configuration

### Interview Settings

Edit `config/settings.py` to customize:

```python
class InterviewConfig:
    max_duration = 45  # minutes
    warmup_questions = 2
    core_questions = 5
    advanced_questions = 3
    question_timeout = 300  # seconds
    coding_question_timeout = 600
    max_coding_score = 10
```

### Email Settings

Configure in `.env`:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SENDER_EMAIL=your_email@gmail.com
SENDER_PASSWORD=your_app_password
MANAGER_EMAIL=hiring@company.com
```

**Note**: For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833)

### Avatar Settings

Create your Tavus avatar:

1. Go to [tavus.io/dashboard](https://tavus.io/dashboard)
2. Create a new **face** (upload 2-5 min video), or use one of Tavus's stock faces
3. Copy the face id to `server/.env` as `TAVUS_FACE_ID=r...`

Leave `TAVUS_PAL_ID` blank and the server provisions an echo-mode PAL on first
use, printing its id so you can pin it (otherwise a new one is created each
restart). List what your account has:

```bash
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=user"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_type=system"
curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/pals?pal_type=user"
```

> **Naming:** Tavus renamed *replica* → **face** and *persona* → **PAL**. Face
> ids start with `r`, PAL ids with `p`. A legacy `TAVUS_REPLICA_ID` is still
> read as a face id.

**How it works**: the conversation is hands-free — no push-to-talk. Tavus owns
the voice pipeline (microphone, `sparrow-1` turn detection, barge-in), and
this repo's `InterviewerAgent` still decides every word the interviewer says.
They are joined by pointing the PAL's **LLM layer** at this backend:

```
candidate speaks
   → Tavus STT + sparrow-1 decides the turn is over
      → POST <TAVUS_LLM_BASE_URL>/v1/chat/completions   (this backend)
         → InterviewerAgent picks the next question, adapts difficulty
      → streamed back as OpenAI SSE
   → Tavus speaks it through the avatar, lip-synced
   → candidate can talk over it to interrupt
```

Because Tavus calls *in*, the backend needs a public URL — see
[Live conversation setup](#live-conversation-setup).

If the avatar is disabled or fails to start, the interview falls back to the
original push-to-talk flow with browser speech recognition and text-to-speech,
so a broken avatar never blocks an interview. The Tavus conversation is ended
automatically when the interview ends so it stops consuming credits.

### Live conversation setup

Tavus's servers must reach your backend. In production that is just your
deployed hostname; locally you need a tunnel.

**Install `cloudflared`** (free, no account needed for quick tunnels):

```bash
brew install cloudflared                        # macOS
winget install --id Cloudflare.cloudflared      # Windows
```

<details>
<summary>Linux, or macOS without Homebrew</summary>

```bash
# Debian / Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# macOS without Homebrew (Apple Silicon; use -amd64 for Intel)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz | tar xz
sudo mv cloudflared /usr/local/bin/
```
</details>

Verify, then run it:

```bash
cloudflared --version

# terminal 1 - backend
./run.sh backend

# terminal 2 - tunnel (leave it open; closing it kills the tunnel)
cloudflared tunnel --url http://localhost:8100
```

It prints a boxed URL — that is the value you want:

```
+----------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:         |
|  https://random-words-here.trycloudflare.com              |
+----------------------------------------------------------+
```

`ngrok http 8100` works too, if you already have ngrok set up.

Copy the public `https://…` URL into `server/.env` and restart the backend:

```env
TAVUS_LLM_BASE_URL=https://your-tunnel-hostname.trycloudflare.com
TAVUS_LLM_API_KEY=<long random string>
```

> The tunnel exposes `/v1/chat/completions` to the internet. `TAVUS_LLM_API_KEY`
> is the bearer token that guards it — the endpoint rejects anything else, so
> do not leave it blank. Generate one with
> `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

Then confirm Tavus can actually reach you — `404 Session not found` is the
**healthy** answer here (it means auth passed; `401` means the key is wrong,
and a timeout means the tunnel is down):

```bash
curl -X POST https://<tunnel-host>/v1/chat/completions \
  -H "Authorization: Bearer $TAVUS_LLM_API_KEY" \
  -H "Content-Type: application/json" -d '{"messages":[]}'
```

The tunnel hostname changes each time you restart `cloudflared`, so update
`TAVUS_LLM_BASE_URL` and clear `TAVUS_PAL_ID` when it does — the PAL stores the
URL, so a stale one leaves the avatar silent.

<details>
<summary>Getting a hostname that does not change</summary>

Quick tunnels get a random hostname every run. A free Cloudflare account plus a
domain gives you a stable one, so you stop re-editing `.env`:

```bash
cloudflared tunnel login                     # opens a browser
cloudflared tunnel create git-hired
cloudflared tunnel route dns git-hired git-hired.yourdomain.com
cloudflared tunnel run --url http://localhost:8100 git-hired
```

Then set `TAVUS_LLM_BASE_URL=https://git-hired.yourdomain.com` once and pin
`TAVUS_PAL_ID` permanently.
</details>

**Tuning the feel** (all optional, in `server/.env`):

| Variable | Default | Effect |
| --- | --- | --- |
| `TAVUS_TURN_TAKING_PATIENCE` | `high` | `high` waits through thinking pauses; `low` replies faster |
| `TAVUS_INTERRUPTIBILITY` | `medium` | How readily the avatar yields when talked over |
| `TAVUS_IDLE_ENGAGEMENT` | `off` | `off` never prompts during silence |
| `TAVUS_VOICE_ISOLATION` | `near` | Filters background noise from the mic |

## 📖 Usage

### Basic Workflow

1. **Start Backend Server**
   ```bash
   ./run.sh backend      # Windows PowerShell: .\run.ps1 backend
   ```

2. **Start the Frontend** (second terminal)
   ```bash
   ./run.sh frontend     # Windows PowerShell: .\run.ps1 frontend
   ```
   Then open <http://localhost:5173>

3. **Upload Resume**
   - Enter candidate name
   - Select job role
   - Paste job description
   - Upload PDF resume

4. **Conduct Interview**
   - System analyzes resume (30-60 seconds)
   - Avatar loads automatically
   - Click "Begin Interview"
   - Answer questions conversationally
   - Submit code when prompted

5. **End Interview**
   - Click "End Interview" button
   - Report generates automatically
   - Email sent to manager

### API Usage

#### Initialize Session

```bash
curl -X POST http://localhost:8100/api/session/init \
  -H "Content-Type: application/json" \
  -d '{
    "resume_base64": "<base64_pdf>",
    "job_description": "...",
    "candidate_name": "John Doe",
    "job_role": "Senior Backend Engineer"
  }'
```

#### Start Interview

```bash
curl -X POST "http://localhost:8100/api/interview/start?session_id=<session_id>"
```

#### Send Message

```bash
curl -X POST http://localhost:8100/api/interview/message \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "<session_id>",
    "message": "I have 5 years of Python experience..."
  }'
```

## 📁 Project Structure

```
git-hired/
├── agents/                            # AI Agents
│   ├── resume_evaluator.py            # Resume analysis agent
│   ├── interviewer.py                 # Interview conductor agent
│   ├── code_evaluator.py              # Code assessment agent
│   └── report_generator.py            # Report creation agent
├── backend/
│   └── server.py                      # FastAPI server
├── config/
│   └── settings.py                    # Configuration management
├── frontend/
│   └── index.html                     # React application
├── prompts/
│   └── agent_prompts.py               # All agent prompts
├── logs/                              # Interview transcripts
│   └── <session_id>/
│       ├── resume_analysis.txt
│       ├── interview_transcript.txt
│       └── code_evaluation.txt
├── reports/                           # Generated reports
│   └── <session_id>/
│       └── interview_report.md
├── requirements.txt                   # Python dependencies
├── .env.example                       # Environment template
└── README.md                          # This file
```

## 🔧 Agents

### 1. Resume Evaluator Agent

**Purpose**: Analyzes resume against job description

**Input**:
- Resume PDF (base64)
- Job description text

**Output**:
- Candidate profile summary
- Skills match analysis
- Interview focus areas
- Recommended difficulty level
- Warm-up topics

**File**: `agents/resume_evaluator.py`

### 2. Interviewer Agent

**Purpose**: Conducts adaptive technical interview

**Features**:
- Real-time difficulty adjustment
- Response quality evaluation
- Adaptive questioning strategy
- Conversation history management

**Adaptive Logic**:
- Excellent (90-100%): +2 difficulty levels
- Good (70-89%): +1 level
- Right direction (50-69%): Maintain level
- Partially wrong (30-49%): -1 level
- Wrong (0-29%): -2 levels

**File**: `agents/interviewer.py`

### 3. Code Evaluator Agent

**Purpose**: Evaluates coding solutions

**Scoring Criteria**:
- Correctness (40%): Logic solves problem
- Approach (30%): Problem-solving method
- Quality (20%): Code organization
- Completeness (10%): Edge cases handled

**Note**: Focuses on LOGIC, not syntax

**File**: `agents/code_evaluator.py`

### 4. Report Generator Agent

**Purpose**: Creates comprehensive interview reports

**Report Sections**:
1. Executive Summary
2. Technical Assessment (/40 points)
3. Problem-Solving Skills (/30 points)
4. Communication (/20 points)
5. Coding Assessment (/10 points)
6. Detailed Analysis
7. Recommendations

**File**: `agents/report_generator.py`

## 🎨 Customization

### Modify Prompts

Edit `prompts/agent_prompts.py`:

```python
INTERVIEWER_AGENT_PROMPT = """
Your custom interviewer personality and instructions...
"""
```

### Add Custom Job Roles

Edit `frontend/index.html`, add to select options:

```html
<option value="Your Custom Role">Your Custom Role</option>
```

### Adjust Scoring Weights

Edit `prompts/agent_prompts.py` in Report Generator prompt:

```
Technical Assessment: 40% (adjust as needed)
Problem-Solving: 30%
Communication: 20%
Coding: 10%
```

### Change Interview Duration

Edit `config/settings.py`:

```python
max_duration = 60  # Change from 45 to 60 minutes
```

## 🐛 Troubleshooting

### Issue: "Failed to initialize session"

**Solution**:
- Check ANTHROPIC_API_KEY is valid
- Ensure PDF is properly formatted
- Check backend server is running

### Issue: "Avatar not loading" / `Tavus conversation failed (400): Invalid replica_uuid`

The backend prints the exact Tavus rejection at session init. `Invalid
replica_uuid` almost always means the wrong *kind* of id is configured.

**Solution**:
- Verify `TAVUS_API_KEY` is set
- `TAVUS_FACE_ID` must be a **face** id (starts with `r`), not a PAL id
  (starts with `p`). Confirm it exists:
  `curl -H "x-api-key: $TAVUS_API_KEY" "https://tavusapi.com/v2/faces?face_ids=<id>"`
- `TAVUS_PAL_ID`, if set, must be a PAL id (`p...`) in `pipeline_mode: echo`
- Ensure the face is fully processed (`status: completed`)

The interview still runs in voice-only mode when the avatar fails, so a broken
avatar never blocks an interview.

### Issue: Avatar connects but never speaks / says it cannot reach its brain

Tavus could not call this backend. The PAL stores `TAVUS_LLM_BASE_URL` at
creation time, so a stale tunnel hostname is the usual cause.

**Solution**:
- Confirm the tunnel is still running and the URL still resolves
- Check the endpoint answers from outside:
  `curl -X POST https://<tunnel-host>/v1/chat/completions -H "Authorization: Bearer $TAVUS_LLM_API_KEY" -H "Content-Type: application/json" -d '{"messages":[]}'`
  (404 "Session not found" is a healthy response here — it means auth passed)
- After changing `TAVUS_LLM_BASE_URL`, **clear `TAVUS_PAL_ID`** so a new PAL is
  provisioned against the new URL, then restart the backend

### Issue: The avatar asks its own questions instead of the agent's

`TAVUS_PAL_ID` is pointing at a PAL whose LLM layer is not aimed at this
backend — for example a hand-made PAL from the Tavus dashboard. Clear
`TAVUS_PAL_ID` and let the server provision one.

### Issue: The avatar interrupts too eagerly, or waits too long

Tune `TAVUS_TURN_TAKING_PATIENCE` and `TAVUS_INTERRUPTIBILITY` (see
[Live conversation setup](#live-conversation-setup)), then clear
`TAVUS_PAL_ID` so the PAL is rebuilt with the new values.

### Issue: "Email not sending"

**Solution**:
- Verify SMTP settings
- For Gmail, use App Password, not regular password
- Check SENDER_EMAIL and MANAGER_EMAIL are set
- Test SMTP connection separately

### Issue: "Code evaluation fails"

**Solution**:
- Check coding question was asked
- Verify code is not empty
- Review logs in `logs/<session_id>/code_evaluation.txt`

### Issue (Windows): `npm.ps1 cannot be loaded because running scripts is disabled on this system`

PowerShell's default execution policy is `Restricted`, which blocks every
`.ps1` — including npm's own wrapper and this repo's scripts.

**Solution** (recommended, one time, no admin needed):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

`RemoteSigned` allows scripts you wrote locally and still requires a signature
on anything downloaded from the internet.

To avoid changing any setting, use the `.cmd` shim instead — it is not subject
to the policy:

```powershell
npm.cmd install
```

Or allow scripts for the current window only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Issue (Windows): `'..' is not recognized as an internal or external command`

You are in Command Prompt, which cannot launch an executable via a
forward-slash relative path — it splits on `/` and tries to run `..`.

**Solution**: use backslashes, or just use the run script:

```
cd server\backend && ..\..\.venv\Scripts\python.exe server.py
```
```powershell
.\run.ps1 backend
```

### Issue (Windows): `[WinError 10013] An attempt was made to access a socket in a way forbidden by its access permissions`

Another process — often a background service — already holds the port. This is
the Windows equivalent of "address already in use".

**Solution**: find the owner, then either stop it or change `PORT` in
`server/.env` (and `VITE_API_BASE_URL` in `agentic-interviewer/.env.local`):

```
netstat -ano | findstr :8100
tasklist /FI "PID eq <pid_from_above>"
```

### Issue (Windows): `UnicodeEncodeError: 'charmap' codec can't encode character`

The console is on a legacy codepage and cannot encode the emoji in the status
output. The server calls `enable_unicode_output()` at startup to prevent this;
if you hit it in a standalone script under `server/src/`, add the same call, or
run with `PYTHONUTF8=1`.

### Issue: `.venv/bin/python: No such file or directory` on Windows

Windows virtualenvs use `Scripts\python.exe`, not `bin/python`.

**Solution**: use `.venv\Scripts\python.exe`, or the run scripts, which detect
the layout automatically.

### Issue: "CORS errors in browser"

**Solution**:
- Ensure backend is running on correct port
- Check API_URL in frontend matches backend URL
- Serve frontend from HTTP server, not file://

### Check Logs

```bash
# View session logs
ls logs/<session_id>/

# View specific log
cat logs/<session_id>/interview_transcript.txt
```

### Test API Health

```bash
curl http://localhost:8100/health
```

## 📊 Interview Metrics

The system tracks:

- **Response Quality Scores**: 0-100 for each answer
- **Difficulty Progression**: How difficulty adjusts
- **Average Response Time**: Time per question
- **Code Score**: 0-10 for coding questions
- **Overall Score**: 0-100 composite score

## 🔐 Security Considerations

1. **API Keys**: Never commit `.env` to version control
2. **HTTPS**: Use HTTPS in production
3. **CORS**: Configure allowed origins appropriately
4. **Authentication**: Add user authentication for production
5. **Rate Limiting**: Implement rate limits on API endpoints

## 📈 Performance Tips

1. **Use Claude Sonnet**: Faster than Opus, sufficient for interviews
2. **Cache Resume Analysis**: Reuse for multiple interview attempts
3. **Optimize PDF Size**: Keep resumes under 5MB
4. **Database**: Add database for production (PostgreSQL recommended)
5. **Load Balancing**: Use multiple backend instances for scale

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is provided as-is for educational and commercial use.

## 🙏 Acknowledgments

- **Anthropic**: Claude AI for natural language processing
- **Tavus**: AI avatar technology
- **LiveKit**: Real-time communication infrastructure
- **FastAPI**: Modern, fast web framework
- **React**: Frontend UI library

## 📧 Support

For issues and questions:
- Check [Troubleshooting](#troubleshooting) section
- Review logs in `logs/` directory
- Check API documentation at `http://localhost:8100/docs`

---

**Built with ❤️ using Claude AI, Tavus, and LiveKit**
