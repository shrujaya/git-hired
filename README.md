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

```bash
git clone <your-repo-url>
cd git-hired
./setup.sh
```

`setup.sh` creates the `.venv` virtualenv, installs backend and frontend
dependencies, verifies the mediapipe/protobuf combination actually loads, and
seeds `server/.env` from the template. It is idempotent — re-run it any time.

Then add your key to `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Running

Two terminals:

```bash
# Backend → http://localhost:8000 (API docs at /docs)
cd server/backend && ../../.venv/bin/python server.py

# Frontend → http://localhost:5173
cd agentic-interviewer && npm run dev
```

### Manual setup

If you'd rather not use the script:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp server/.env.example server/.env   # then add your API key
cd agentic-interviewer && npm install
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
2. Create new replica (upload 2-5 min video)
3. Copy Replica ID to `.env`

## 📖 Usage

### Basic Workflow

1. **Start Backend Server**
   ```bash
   python backend/server.py
   ```

2. **Open Frontend**
   - Navigate to `frontend/index.html`

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
curl -X POST http://localhost:8000/api/session/init \
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
curl -X POST "http://localhost:8000/api/interview/start?session_id=<session_id>"
```

#### Send Message

```bash
curl -X POST http://localhost:8000/api/interview/message \
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

### Issue: "Avatar not loading"

**Solution**:
- Verify TAVUS_API_KEY is set
- Check TAVUS_REPLICA_ID is correct
- Ensure replica is fully processed (10-30 min after creation)

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
curl http://localhost:8000/health
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
- Check API documentation at `http://localhost:8000/docs`

---

**Built with ❤️ using Claude AI, Tavus, and LiveKit**
