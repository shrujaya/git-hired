# 🎙️ Voice Interview System - User Guide

## Overview

The AI Interviewer conducts **VOICE interviews**, not text chat. The system uses:
- **Speech Recognition**: Listens to your spoken answers
- **Text-to-Speech**: AI interviewer speaks questions to you
- **Tavus Avatar**: Realistic video avatar of the interviewer
- **LiveKit**: Real-time video/audio communication
- **Text Editor**: ONLY appears for coding questions

## How It Works

### 1. Interview Setup
- Upload your resume (PDF)
- Select job role
- Enter job description
- Click "Start Interview"

### 2. Voice Interview Begins

```
┌─────────────────────────────────────────┐
│  AI Avatar (Tavus)                      │
│  [Speaking interviewer face]            │
│                                         │
│  Your Camera                            │
│  [Your video feed]                      │
│                                         │
│  🎤 Listening... / 🔊 Speaking...      │
└─────────────────────────────────────────┘
```

### 3. Interview Flow

**STEP 1**: AI interviewer speaks question
- Avatar speaks using text-to-speech
- Question appears in transcript on right

**STEP 2**: You speak your answer
- Click "Start Speaking" or it auto-starts
- Speak naturally into your microphone
- System transcribes your speech
- Answer appears in transcript

**STEP 3**: AI evaluates and asks next question
- System evaluates your response quality
- Adjusts difficulty automatically
- AI speaks next question
- Cycle repeats

### 4. Coding Question (ONLY TIME YOU TYPE)

When coding question appears:
- **Code editor** appears on screen
- Type your solution (or pseudocode)
- Focus on LOGIC, not syntax
- Click "Submit Code"
- Return to voice interview

## User Interface

### Left Side: Video Section
```
┌─────────────────────────┐
│   AI Interviewer        │
│   [Avatar Video]        │
│                         │
│   Your Camera           │
│   [Your Video]          │
│                         │
│   Voice Status          │
│   🎤 Listening...       │
│   🔊 Speaking...        │
└─────────────────────────┘
```

### Right Side: Transcript Section
```
┌─────────────────────────────┐
│  Interview Transcript       │
│  ─────────────────────────  │
│  👔 Interviewer (Voice)     │
│  "Tell me about your        │
│   experience..."            │
│                             │
│  👤 You (Voice)             │
│  "I have 5 years of         │
│   Python development..."    │
│                             │
│  [Scrollable history]       │
│                             │
│  🎤 Start Speaking          │
│  🔴 End Interview           │
└─────────────────────────────┘
```

### Code Editor (Only for Coding Questions)
```
┌─────────────────────────────┐
│  💻 Code Editor             │
│  ─────────────────────────  │
│  Type your solution:        │
│                             │
│  ┌───────────────────────┐ │
│  │ def solution():       │ │
│  │     # your code here  │ │
│  │                       │ │
│  └───────────────────────┘ │
│                             │
│  [Submit Code] [Cancel]     │
└─────────────────────────────┘
```

## Browser Requirements

### Required Features
- ✅ **Microphone access** (for speech input)
- ✅ **Camera access** (for video)
- ✅ **Speech Recognition API** (Chrome, Edge)
- ✅ **Text-to-Speech API** (all modern browsers)

### Recommended Browsers
1. **Chrome** - Best support (recommended)
2. **Edge** - Full support
3. **Safari** - Partial support
4. **Firefox** - Limited speech recognition

### Permissions Required
When you start the interview, grant:
- 🎤 **Microphone** permission
- 📹 **Camera** permission

## Interview Controls

### During Voice Interview

**🎤 Start Speaking Button**
- Click to activate microphone
- Speak your answer clearly
- System auto-transcribes

**⏸️ Stop Listening Button**
- Click to pause microphone
- Use between answers

**🔴 End Interview Button**
- Ends interview
- Generates report
- Sends email to manager

### During Coding Question

**Submit Code**
- Submits your typed solution
- Gets evaluated (logic only)
- Returns to voice interview

**Cancel**
- Closes code editor
- Returns to voice interview

## Tips for Best Experience

### Voice Quality
- ✅ Use good microphone (headset recommended)
- ✅ Quiet environment
- ✅ Speak clearly and naturally
- ✅ Pause between thoughts
- ❌ Don't speak too fast
- ❌ Avoid background noise

### Camera Setup
- ✅ Good lighting on your face
- ✅ Camera at eye level
- ✅ Clean background
- ✅ Professional appearance

### Technical Setup
- ✅ Test mic before interview
- ✅ Check camera works
- ✅ Stable internet connection
- ✅ Close other tabs/apps
- ✅ Use Chrome or Edge browser

## What Gets Logged

### Transcript File
All voice interactions are transcribed and logged:
```
[Timestamp] Interviewer: "Tell me about..."
[Timestamp] You (Voice): "I have experience with..."
[Timestamp] Interviewer: "Great! How would you..."
[Timestamp] You (Voice): "I would approach it by..."
```

### Code Submission
When you type code, it's saved separately:
```
Question: "Write a function to..."
Your Code: 
    def solution():
        # your typed code
Score: 8/10
```

## Interview Flow Example

```
1. 🎙️ AI Speaks: "Hi! Let's start. Tell me about your Python experience."
   
2. 🎤 You Speak: "I have 5 years of Python development experience..."
   
3. 💭 AI Thinks: [Evaluates response: Score 85/100, increase difficulty]
   
4. 🎙️ AI Speaks: "Good! How would you optimize a slow database query?"
   
5. 🎤 You Speak: "I would first check the execution plan..."
   
6. 💭 AI Thinks: [Evaluates response: Score 90/100, ask coding question]
   
7. 🎙️ AI Speaks: "Excellent! Now, please write a function to find duplicates in an array. Use the code editor."
   
8. ⌨️  You Type: [Code editor appears, you type solution]
   
9. 💻 Submit Code: [System evaluates logic, scores 9/10]
   
10. 🎙️ AI Speaks: "Great solution! Let's discuss edge cases..."
    
11. 🎤 You Speak: "For edge cases, I would handle..."
```

## Troubleshooting

### "Microphone not detected"
- Check browser permissions
- Allow microphone access
- Try different browser (Chrome/Edge)
- Check system microphone settings

### "Speech recognition not working"
- Use Chrome or Edge browser
- Check microphone is working
- Speak clearly and at normal pace
- Check browser console for errors

### "Avatar not loading"
- Wait 30-60 seconds for initialization
- Check internet connection
- Verify Tavus API key is configured
- Refresh page and try again

### "Audio echo or feedback"
- Use headphones
- Mute other audio sources
- Check speaker volume

### "Can't hear AI interviewer"
- Check speaker volume
- Unmute browser tab
- Check system audio settings
- Try different browser

## Privacy & Data

### What's Recorded
- ✅ Voice transcriptions (text only)
- ✅ Video feed (for avatar sync, not stored)
- ✅ Code submissions
- ✅ Interview transcript

### What's NOT Stored
- ❌ Audio recordings
- ❌ Video recordings
- ❌ Biometric data

### Data Usage
- Transcript sent to hiring manager
- Report generated from transcript
- Code evaluated for logic only
- All data in interview report

## Best Practices

### Before Interview
1. Test microphone and camera
2. Choose quiet location
3. Close unnecessary apps
4. Check internet connection
5. Have resume ready (if needed)

### During Interview
1. Listen carefully to questions
2. Speak clearly and confidently
3. Take time to think before answering
4. Ask for clarification if needed
5. Focus on the avatar (eye contact)

### For Coding Questions
1. Read problem carefully
2. Plan before typing
3. Focus on logic over syntax
4. Add comments for clarity
5. Test mentally with examples

## Technical Architecture

```
User Speech → Browser Speech Recognition → Text
                                           ↓
                        Backend (FastAPI) Process
                                           ↓
                        Claude AI Evaluates
                                           ↓
                        Generates Next Question
                                           ↓
Text → Text-to-Speech → Audio → Avatar Speaks
```

## Support

If you experience issues:
1. Check browser console (F12)
2. Verify all permissions granted
3. Try different browser
4. Check internet connection
5. Contact technical support

---

**Remember**: This is a VOICE interview. Only type for coding questions!
