# 📘 AI Virtual Avatar Interviewer - Complete Project Guide

## 🎯 Project Overview

This is a **production-ready AI-powered technical interview system** that combines:
- **Claude AI** for intelligent conversation and analysis
- **Tavus** for realistic AI avatar interviewer
- **FastAPI** for robust backend architecture
- **React** for interactive frontend interface

## 🏆 Key Features

### What Makes This Special

1. **Fully Autonomous Interview Process**
   - Analyzes resume automatically
   - Adapts questions based on performance
   - Evaluates code logic (not syntax)
   - Generates comprehensive reports
   - Emails results to hiring manager

2. **Production-Quality Code**
   - Modular agent architecture
   - Comprehensive error handling
   - Detailed logging
   - WebSocket support for real-time
   - RESTful API design

3. **Enterprise Features**
   - Session management
   - Multi-interview support
   - Configurable settings
   - Email notifications
   - Detailed analytics

## 📂 Complete File Structure

```
ai-interviewer/
│
├── agents/                          # 🤖 AI Agent Implementations
│   ├── __init__.py
│   ├── resume_evaluator.py         # Analyzes resume vs job description
│   ├── interviewer.py               # Conducts adaptive interview
│   ├── code_evaluator.py           # Evaluates coding solutions
│   └── report_generator.py         # Creates & emails reports
│
├── backend/
│   └── server.py                    # 🚀 FastAPI backend server
│                                      - Session management
│                                      - WebSocket support
│                                      - RESTful API endpoints
│
├── config/
│   ├── __init__.py
│   └── settings.py                  # ⚙️ Configuration management
│                                      - Environment variables
│                                      - Interview settings
│                                      - Feature flags
│
├── frontend/
│   └── index.html                   # 💻 React application
│                                      - Resume upload UI
│                                      - Interview interface
│                                      - Code editor
│                                      - Avatar display
│
├── prompts/
│   ├── __init__.py
│   └── agent_prompts.py             # 📝 All AI prompts
│                                      - Resume evaluator prompt
│                                      - Interviewer prompt
│                                      - Code evaluator prompt
│                                      - Report generator prompt
│
├── logs/                            # 📁 Generated during runtime
│   └── <session_id>/
│       ├── resume_analysis.txt
│       ├── interview_transcript.txt
│       └── code_evaluation.txt
│
├── reports/                         # 📊 Generated during runtime
│   └── <session_id>/
│       └── interview_report_*.md
│
├── .env.example                     # 🔐 Environment template
├── requirements.txt                 # 📦 Python dependencies
├── README.md                        # 📖 Full documentation
├── QUICKSTART.md                    # ⚡ 5-minute setup guide
└── PROJECT_GUIDE.md                 # 📘 This file
```

## 🔧 Technical Architecture

### Data Flow

```
1. User Upload (Frontend)
   ↓
2. Backend Receives (FastAPI)
   ↓
3. Resume Evaluator Agent
   - Extracts PDF text (Claude)
   - Analyzes vs job description
   - Creates interview strategy
   ↓
4. Interviewer Agent
   - Starts interview
   - Asks adaptive questions
   - Evaluates responses in real-time
   - Adjusts difficulty dynamically
   ↓
5. Code Evaluator Agent (when coding question asked)
   - Receives code from frontend
   - Evaluates logic (not syntax)
   - Scores out of 10
   ↓
6. Report Generator Agent
   - Compiles all data
   - Generates comprehensive report
   - Emails to manager
   ↓
7. User sees completion message
```

### Agent Communication

```
┌─────────────────┐
│  Resume Eval    │ → Creates interview strategy
└────────┬────────┘
         │
         ↓ (strategy text file)
┌────────▼────────┐
│  Interviewer    │ → Conducts interview
└────────┬────────┘
         │
         ↓ (transcript file)
┌────────▼────────┐
│  Code Eval      │ → Scores coding
└────────┬────────┘
         │
         ↓ (score file)
┌────────▼────────┐
│  Report Gen     │ → Final report + email
└─────────────────┘
```

## 🎭 Agent Descriptions

### 1. Resume Evaluator Agent (`agents/resume_evaluator.py`)

**Purpose**: First step in the pipeline - analyzes candidate fitness

**Key Methods**:
- `extract_text_from_pdf()`: Uses Claude to extract text from PDF
- `analyze_resume()`: Analyzes resume against JD
- `save_analysis()`: Saves to file for interviewer agent

**Output**: 
- Candidate profile summary
- Skills match analysis
- Interview focus areas
- Recommended starting difficulty
- Warm-up topics

**Special Feature**: Uses Claude's native PDF processing capability

### 2. Interviewer Agent (`agents/interviewer.py`)

**Purpose**: Conducts the actual interview with adaptive questioning

**Key Methods**:
- `start_interview()`: Opens with greeting and first question
- `get_next_question()`: Gets next question based on previous answer
- `evaluate_response_quality()`: Scores each response 0-100
- `adjust_difficulty()`: Changes difficulty based on score
- `end_interview()`: Closes gracefully

**Adaptive Logic**:
```python
Score 90-100: +2 difficulty levels
Score 70-89:  +1 difficulty level
Score 50-69:  Maintain level (with hints)
Score 30-49:  -1 difficulty level
Score 0-29:   -2 difficulty levels
```

**Special Features**:
- Maintains conversation history
- Tracks response scores
- Saves complete transcript
- Knows when to ask coding question

### 3. Code Evaluator Agent (`agents/code_evaluator.py`)

**Purpose**: Evaluates coding solutions on LOGIC not syntax

**Scoring Breakdown**:
- Correctness (40%): Does it solve the problem?
- Approach (30%): Good problem-solving method?
- Quality (20%): Clear, organized code?
- Completeness (10%): Handles edge cases?

**Key Methods**:
- `evaluate_code()`: Main evaluation logic
- `save_evaluation()`: Saves detailed feedback

**Special Feature**: Accepts pseudocode and focuses only on logical thinking

### 4. Report Generator Agent (`agents/report_generator.py`)

**Purpose**: Creates final report and emails to manager

**Report Sections**:
1. Executive Summary (hire/no-hire recommendation)
2. Technical Assessment (/40 points)
3. Problem-Solving Skills (/30 points)
4. Communication (/20 points)
5. Coding Assessment (/10 points)
6. Detailed Analysis with examples
7. Recommendations

**Key Methods**:
- `generate_report()`: Creates markdown report
- `save_report()`: Saves to files
- `send_email()`: Emails via SMTP

**Email Feature**: Automatically attaches report and sends to manager

## 🔌 Backend API (FastAPI)

### Endpoints

#### POST `/api/session/init`
Initialize new interview session
- Processes resume PDF
- Analyzes against JD
- Creates interviewer agent
- Initializes Tavus avatar

**Request**:
```json
{
  "resume_base64": "...",
  "job_description": "...",
  "candidate_name": "John Doe",
  "job_role": "Senior Backend Engineer"
}
```

**Response**:
```json
{
  "session_id": "uuid",
  "status": "ready",
  "avatar_url": "https://tavus.io/..."
}
```

#### POST `/api/interview/start`
Start the interview

**Response**:
```json
{
  "opening": "Hi! I've reviewed your resume...",
  "question_number": 1
}
```

#### POST `/api/interview/message`
Send candidate response and get next question

**Request**:
```json
{
  "session_id": "uuid",
  "message": "I have 5 years of Python..."
}
```

**Response**:
```json
{
  "response": "Great! Can you explain...",
  "is_coding_question": false,
  "question_number": 2,
  "difficulty_level": 2
}
```

#### POST `/api/interview/code/submit`
Submit coding solution

**Request**:
```json
{
  "session_id": "uuid",
  "code": "def solution():\n    ..."
}
```

**Response**:
```json
{
  "status": "evaluated",
  "score": 8,
  "feedback": "Good solution..."
}
```

#### POST `/api/interview/end`
End interview and generate report

**Response**:
```json
{
  "status": "completed",
  "closing": "Thank you...",
  "report_generated": true,
  "email_sent": true,
  "report_file": "/path/to/report.md"
}
```

#### WebSocket `/ws/{session_id}`
Real-time communication for live interview

## 💻 Frontend Components

### Screen 1: Upload Interface
- Candidate name input
- Job role dropdown
- Job description textarea
- PDF file upload with drag-drop
- Visual feedback on file selection

### Screen 2: Interview Interface

**Left Side**: Avatar Section
- Tavus avatar iframe
- User video feed
- Status indicators

**Right Side**: Chat Section
- Message history (scrollable)
- Input box for answers
- Code editor (appears for coding questions)
- Send and End Interview buttons

### UI Features
- Responsive design
- Real-time message updates
- Loading states
- Error handling
- Success notifications

## 🔐 Configuration System

### Environment Variables (.env)

**Required**:
```env
ANTHROPIC_API_KEY=sk-ant-...
TAVUS_API_KEY=...
TAVUS_REPLICA_ID=...
SENDER_EMAIL=...
SENDER_PASSWORD=...
MANAGER_EMAIL=...
```

**Optional**:
```env
MAX_INTERVIEW_DURATION=45
ENABLE_AVATAR=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

### Config Object (config/settings.py)

```python
config.interview.max_duration        # 45 minutes
config.interview.warmup_questions    # 2
config.interview.core_questions      # 5
config.interview.advanced_questions  # 3
config.interview.max_coding_score    # 10
```

## 📝 Prompt Engineering

All prompts are in `prompts/agent_prompts.py`

### Interviewer Prompt Highlights

```
- Be supportive yet rigorous
- Focus on understanding over memorization
- Adapt difficulty in real-time
- Keep responses concise (2-4 sentences)
- Never give away answers
- Build conversational environment
```

### Code Evaluator Prompt Highlights

```
- IGNORE syntax errors
- Focus ONLY on logical approach
- Pseudocode is acceptable
- Consider interview pressure context
- Be fair and encouraging
```

### Report Generator Prompt Highlights

```
- Professional tone for hiring manager
- Specific examples from transcript
- Objective assessment
- Clear recommendations
- Actionable feedback
```

## 🎨 Customization Guide

### Change Interview Duration

Edit `config/settings.py`:
```python
max_duration = 60  # Change from 45 to 60 minutes
```

### Add Custom Job Roles

Edit `frontend/index.html`:
```html
<option value="ML Engineer">ML Engineer</option>
<option value="Your Role">Your Custom Role</option>
```

### Modify Question Distribution

Edit `config/settings.py`:
```python
warmup_questions = 3     # Was 2
core_questions = 7       # Was 5
advanced_questions = 5   # Was 3
```

### Adjust Scoring Weights

Edit `prompts/agent_prompts.py`, modify report generator prompt:
```
Technical Assessment: 35%  (was 40%)
Problem-Solving: 35%       (was 30%)
Communication: 20%
Coding: 10%
```

### Change Avatar Personality

Edit `prompts/agent_prompts.py`:
```python
INTERVIEWER_AGENT_PROMPT = """
You are a friendly, casual interviewer...  # Customize this
"""
```

## 🐛 Debugging Tips

### Enable Debug Logging

Add to `backend/server.py`:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Check Session Data

```python
# In server.py, add endpoint:
@app.get("/debug/session/{session_id}")
async def debug_session(session_id: str):
    return session_manager.get_session(session_id)
```

### Monitor Real-time

```bash
# Watch logs in real-time
tail -f logs/*/interview_transcript.txt
```

### Test Individual Agents

Each agent can run standalone:
```bash
cd agents
python resume_evaluator.py    # Test resume analysis
python interviewer.py          # Test interviewer
python code_evaluator.py       # Test code eval
```

## 📊 Performance Metrics

Expected timing:
- Resume analysis: 30-60 seconds
- Each question/response: 3-10 seconds
- Code evaluation: 10-20 seconds
- Report generation: 20-30 seconds
- Total interview: 30-45 minutes

Optimization tips:
- Use Claude Sonnet (faster than Opus)
- Keep resume PDFs under 5MB
- Cache resume analysis
- Use connection pooling for production

## 🚀 Deployment Guide

### Local Development
```bash
python backend/server.py
```

### Production with Gunicorn
```bash
gunicorn backend.server:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Docker Deployment
```dockerfile
FROM python:3.9
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["python", "backend/server.py"]
```

### Environment Variables for Production
- Use secrets management (AWS Secrets Manager, etc.)
- Enable HTTPS
- Configure CORS properly
- Add authentication
- Implement rate limiting

## 📈 Scaling Considerations

For high-volume use:
1. Add PostgreSQL for session storage
2. Use Redis for caching
3. Deploy multiple backend instances
4. Add load balancer
5. Use Celery for async tasks
6. Implement job queue for reports

## 🎓 Learning Path

**Week 1**: Understand the flow
- Run a complete interview
- Review all generated files
- Study agent prompts

**Week 2**: Customize
- Modify prompts
- Add new job roles
- Adjust scoring

**Week 3**: Extend
- Add new agent capabilities
- Implement additional features
- Optimize performance

## 💡 Advanced Features to Add

Ideas for extension:
- [ ] Multi-language support
- [ ] Video recording of interviews
- [ ] Candidate feedback collection
- [ ] Interview analytics dashboard
- [ ] Integration with ATS systems
- [ ] Bulk interview scheduling
- [ ] Custom rubric creation
- [ ] Interview replay feature
- [ ] Real-time collaboration (multiple interviewers)
- [ ] Mobile app

## 🤝 Integration Examples

### With ATS (Applicant Tracking System)
```python
# Add webhook endpoint
@app.post("/webhook/ats")
async def ats_webhook(candidate_data: dict):
    # Auto-create interview session
    pass
```

### With Calendar
```python
# Schedule interviews
from google.calendar import Calendar
# Integrate scheduling
```

### With Slack
```python
# Send notifications
from slack_sdk import WebClient
# Send interview updates
```

## 📚 Additional Resources

- **Anthropic Docs**: https://docs.anthropic.com
- **Tavus Docs**: https://docs.tavus.io
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **React Docs**: https://react.dev

## ✅ Final Checklist

Before going live:
- [ ] All API keys configured
- [ ] Email sending tested
- [ ] Avatar working properly
- [ ] Logs directory writable
- [ ] Reports directory writable
- [ ] HTTPS enabled (production)
- [ ] CORS configured
- [ ] Error handling tested
- [ ] Interview flow tested end-to-end
- [ ] Manager receives emails
- [ ] Reports are comprehensive
- [ ] Code evaluation works

---

**You now have a complete, production-ready AI interview system!** 🎉

Start with QUICKSTART.md, then explore and customize to your needs.
