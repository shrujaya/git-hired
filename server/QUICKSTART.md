# 🚀 Quick Start Guide

Get your AI Interview System running in 5 minutes!

## Prerequisites Checklist

- [ ] Python 3.9+ installed
- [ ] Anthropic API key ([get one here](https://console.anthropic.com))
- [ ] Tavus API key ([sign up here](https://tavus.io))
- [ ] Tavus Replica created
- [ ] Email account for sending reports (Gmail recommended)

## Installation Steps

### 1. Install Dependencies (1 minute)

```bash
pip install -r requirements.txt
```

### 2. Configure Environment (2 minutes)

```bash
# Copy template
cp .env.example .env

# Edit .env file and add your keys:
nano .env
```

**Required values:**
```env
ANTHROPIC_API_KEY=sk-ant-xxxxx          # From console.anthropic.com
TAVUS_API_KEY=your_tavus_key            # From tavus.io
TAVUS_REPLICA_ID=your_replica_id        # From tavus.io/dashboard
SENDER_EMAIL=your_email@gmail.com        # Your Gmail
SENDER_PASSWORD=your_app_password        # Gmail App Password
MANAGER_EMAIL=manager@company.com        # Where reports go
```

### 3. Start Backend Server (30 seconds)

```bash
cd backend
python server.py
```

You should see:
```
✓ Server ready!
   Avatar: enabled
   Email: enabled
   Logs: /path/to/logs
   Reports: /path/to/reports
```

### 4. Open Frontend (30 seconds)

**Option A: Direct file**
```bash
# Just open in browser
open frontend/index.html  # macOS
xdg-open frontend/index.html  # Linux
start frontend/index.html  # Windows
```

**Option B: HTTP Server (recommended)**
```bash
cd frontend
python -m http.server 3000
# Then open http://localhost:3000 in browser
```

### 5. Test Interview (1 minute)

1. Enter candidate name
2. Select job role (e.g., "Senior Backend Engineer")
3. Paste job description
4. Upload PDF resume
5. Click "Start Interview"
6. Wait 30-60 seconds for initialization
7. Click "Begin Interview"
8. Type your first answer!

## Verification

✅ **Backend Running**: Visit http://localhost:8000/health

✅ **API Docs**: Visit http://localhost:8000/docs

✅ **Frontend**: Should see upload screen

## First Interview Test

Use this sample data for testing:

**Job Description:**
```
We're looking for a Senior Backend Engineer with:
- 5+ years Python experience
- Strong API development skills (Django/FastAPI)
- Cloud platform experience (AWS/GCP)
- Database design and optimization
- Team leadership experience
```

**Job Role:** Senior Backend Engineer

**Resume:** Use any technical resume PDF

## Common Quick Issues

### Issue: "Module not found"
```bash
pip install -r requirements.txt --force-reinstall
```

### Issue: "API key invalid"
- Double-check `.env` file has correct keys
- No spaces around `=` sign
- Keys are on correct lines

### Issue: "Port already in use"
```bash
# Change port in server.py:
uvicorn.run("server:app", port=8001)  # Changed from 8000
```

### Issue: "Avatar not loading"
- Wait 30 seconds (Tavus initialization takes time)
- Check TAVUS_REPLICA_ID is correct
- Verify replica is "Active" in Tavus dashboard

### Issue: "Email not sending"
For Gmail:
1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password (not regular password) in .env

## Next Steps

Once working:

1. **Customize Prompts**: Edit `prompts/agent_prompts.py`
2. **Adjust Settings**: Modify `config/settings.py`
3. **Review Logs**: Check `logs/` directory
4. **Check Reports**: See `reports/` directory

## Quick Commands Reference

```bash
# Start backend
cd backend && python server.py

# Start frontend HTTP server
cd frontend && python -m http.server 3000

# Check health
curl http://localhost:8000/health

# View logs
ls logs/

# View reports
ls reports/

# Test API
curl http://localhost:8000/

# View API docs
open http://localhost:8000/docs
```

## File Locations

After first interview, find files here:

```
logs/<session-id>/
  ├── resume_analysis.txt       # Resume evaluation
  ├── interview_transcript.txt  # Full conversation
  └── code_evaluation.txt       # Code assessment

reports/<session-id>/
  └── interview_report_*.md     # Final report
```

## Gmail App Password Setup

1. Go to: https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to: https://myaccount.google.com/apppasswords
4. Select "Mail" and "Other (Custom name)"
5. Copy generated password
6. Use in `.env` as SENDER_PASSWORD

## Tavus Replica Setup

1. Go to: https://tavus.io/dashboard
2. Click "Create Replica"
3. Upload 2-5 minute video:
   - Clear audio
   - Good lighting
   - Face visible
   - Natural speaking
4. Wait 10-30 minutes for processing
5. Copy Replica ID
6. Paste in `.env` as TAVUS_REPLICA_ID

## Testing Without Avatar

To test without Tavus:

1. Edit `.env`:
   ```env
   ENABLE_AVATAR=false
   ```

2. System will work without avatar (text-only)

## Testing Without Email

To test without email:

1. Edit `.env`:
   ```env
   ENABLE_EMAIL_NOTIFICATIONS=false
   ```

2. Reports still generated, just not emailed

## Quick Troubleshooting

**Problem:** Nothing happens after clicking "Start Interview"
- Open browser console (F12)
- Look for errors
- Check if backend is running
- Verify API_URL in frontend matches backend

**Problem:** "Session not found" error
- Session might have expired
- Refresh page and try again
- Check backend logs

**Problem:** Slow initialization
- First time takes longer (60-90 seconds)
- Resume analysis + avatar initialization
- Subsequent interviews are faster

## Performance Tips

- Keep resume PDFs under 5MB
- Use simple, clean resume formatting
- Stable internet connection
- Chrome/Firefox recommended

## Support

- **Documentation**: See README.md
- **API Docs**: http://localhost:8000/docs
- **Logs**: Check `logs/` directory
- **Test Health**: `curl http://localhost:8000/health`

---

You're all set! Start your first interview now! 🎉
