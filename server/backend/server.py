"""
FastAPI Backend Server for AI Interviewer System
Handles resume upload, interview management, and avatar integration
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
BACKEND_DIR = Path(__file__).resolve().parent
SERVER_DIR = BACKEND_DIR.parent
sys.path.append(str(SERVER_DIR))

# Must run before anything prints: the status output below contains emoji,
# which raises UnicodeEncodeError on a legacy Windows console.
from config.console import enable_unicode_output
enable_unicode_output()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import uuid
import asyncio
import aiohttp
from datetime import datetime
import base64
import numpy as np 
import cv2
import mediapipe as mp
import time



# Import agents
from agents.resume_evaluator import ResumeEvaluatorAgent
from agents.interviewer import InterviewerAgent
from agents.report_generator import ReportGeneratorAgent

# Import config
from config.settings import config, validate_config

# Tavus integration
import anthropic


# Mediapipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)


# Log file setup. Anchored to the repo rather than the working directory so
# the logs land in the same place no matter where the server was launched from.
log_dir = SERVER_DIR / "src" / "logs"
log_dir.mkdir(parents=True, exist_ok=True)

log_file = log_dir / "eye_tracking_log.jsonl"

def write_log(event_type, duration=None):
    log_entry = {
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "event": event_type,
        "duration": duration
    }
    # Explicit encoding: Windows would otherwise write cp1252 and choke on
    # any non-ASCII content.
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

# Eye landmark indices
LEFT_EYE_INDICES = [33, 133]
RIGHT_EYE_INDICES = [362, 263]




# Pydantic models
class SessionInitRequest(BaseModel):
    resume_base64: str
    job_description: str
    job_role: str
    # Optional: the name is read off the resume. Only used as a fallback when
    # the resume has no identifiable name.
    candidate_name: Optional[str] = None


class SessionInitResponse(BaseModel):
    session_id: str
    status: str
    message: str
    avatar_url: Optional[str] = None
    # Needed by the client to drive the avatar in echo mode (it addresses
    # interaction messages to this conversation).
    avatar_conversation_id: Optional[str] = None
    # Name read off the resume, so the client can display the real candidate.
    candidate_name: str
    candidate_first_name: str


class InterviewMessage(BaseModel):
    session_id: str
    message: str
    is_coding_response: bool = False


class InterviewResponse(BaseModel):
    response: str
    is_coding_question: bool = False
    question_number: int
    difficulty_level: int


class CodingSubmission(BaseModel):
    session_id: str
    code: str


class EndInterviewRequest(BaseModel):
    session_id: str


# FastAPI app
app = FastAPI(
    title="AI Interviewer System",
    description="Virtual AI Avatar Interview System with Resume Analysis",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state management
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.tavus_client: Optional[aiohttp.ClientSession] = None
        # Resolved once per process; see ensure_tavus_pal().
        self.tavus_pal_id: Optional[str] = None
    
    async def initialize_tavus(self):
        """Initialize Tavus HTTP client"""
        if config.enable_avatar and config.api.tavus_api_key:
            self.tavus_client = aiohttp.ClientSession(
                headers={
                    "x-api-key": config.api.tavus_api_key,
                    "Content-Type": "application/json"
                }
            )
    
    async def ensure_tavus_pal(self) -> Optional[str]:
        """Return the PAL id to render the avatar with, provisioning if needed.

        The PAL runs Tavus's full pipeline so the conversation feels live:
        sparrow-1 decides when the candidate has actually finished a thought,
        and the avatar yields the floor when talked over. Its LLM layer is
        pointed back at this backend, so Tavus supplies the ears and mouth
        while InterviewerAgent remains the brain.
        """
        if config.api.tavus_pal_id:
            return config.api.tavus_pal_id
        if self.tavus_pal_id:
            return self.tavus_pal_id
        if not self.tavus_client:
            return None
        if not config.api.tavus_llm_base_url:
            print(
                "Cannot create Tavus PAL: TAVUS_LLM_BASE_URL is unset, so Tavus "
                "would have no way to reach this backend for interview questions"
            )
            return None

        flow = config.conversation
        try:
            async with self.tavus_client.post(
                "https://tavusapi.com/v2/pals",
                json={
                    "pal_name": "Git-Hired Interviewer",
                    "pipeline_mode": "full",
                    "default_face_id": config.api.tavus_face_id,
                    # Our endpoint ignores this and always replies with the
                    # InterviewerAgent's line, but Tavus requires a prompt.
                    "system_prompt": (
                        "You are a technical interviewer. Ask one question at a "
                        "time and listen to the candidate's full answer."
                    ),
                    "layers": {
                        "conversational_flow": {
                            "turn_detection_model": flow.turn_detection_model,
                            "turn_taking_patience": flow.turn_taking_patience,
                            "pal_interruptibility": flow.pal_interruptibility,
                            "voice_isolation": flow.voice_isolation,
                            "idle_engagement": flow.idle_engagement,
                        },
                        "llm": {
                            "model": "git-hired-interviewer",
                            # Tavus appends /chat/completions itself.
                            "base_url": f"{config.api.tavus_llm_base_url}/v1",
                            "api_key": config.api.tavus_llm_api_key,
                            # Off: speculative inference pre-runs the model on a
                            # guessed end-of-turn. Our replies are not free
                            # (Claude call + difficulty scoring), and a discarded
                            # speculation would still advance the question count.
                            "speculative_inference": False,
                        },
                    },
                },
            ) as response:
                data = await response.json()
                if response.status >= 400:
                    print(f"Tavus PAL creation failed ({response.status}): {data}")
                    return None
                self.tavus_pal_id = data.get("pal_id")
                print(
                    f"Created Tavus PAL {self.tavus_pal_id} - "
                    f"set TAVUS_PAL_ID={self.tavus_pal_id} in server/.env to reuse it"
                )
                return self.tavus_pal_id
        except Exception as e:
            print(f"Error creating Tavus PAL: {e}")
            return None

    async def create_tavus_conversation(
        self,
        session_id: str,
        greeting: Optional[str] = None,
    ) -> Optional[Dict[str, str]]:
        """Create Tavus avatar conversation.

        Returns {"url": ..., "conversation_id": ...} or None.
        """
        if not self.tavus_client or not config.api.tavus_face_id:
            return None

        pal_id = await self.ensure_tavus_pal()
        if not pal_id:
            return None

        try:
            payload = {
                # Tavus v2 takes pal_id + face_id; replica_id/persona_id are
                # the retired names and reject current ids.
                "pal_id": pal_id,
                "face_id": config.api.tavus_face_id,
                "conversation_name": f"git-hired-{session_id[:8]}",
                # Tavus replays this context in the system message it sends to
                # our LLM endpoint, which is how a request gets matched back to
                # its interview - there is no per-conversation LLM config.
                "conversational_context": f"[{SESSION_MARKER} {session_id}]",
                # The agent's own opening line, so the first thing the
                # candidate hears is already part of the interview.
                "custom_greeting": greeting or "Hello! Thanks for joining today.",
            }

            async with self.tavus_client.post(
                "https://tavusapi.com/v2/conversations",
                json=payload
            ) as response:
                data = await response.json()
                if response.status >= 400:
                    # Typical causes: bad key, unknown face/PAL id, out of
                    # credits. Surface the reason instead of a silent None.
                    print(f"Tavus conversation failed ({response.status}): {data}")
                    return None
                conversation_id = data.get("conversation_id")
                self.sessions[session_id]["tavus_conversation_id"] = conversation_id
                return {
                    "url": data.get("conversation_url"),
                    "conversation_id": conversation_id,
                }
        except Exception as e:
            print(f"Error creating Tavus conversation: {e}")
            return None

    async def end_tavus_conversation(self, session_id: str):
        """End the session's Tavus conversation so it stops consuming credits.

        Without this the conversation keeps running server-side at Tavus until
        its idle timeout, long after the candidate has left.
        """
        session = self.sessions.get(session_id) or {}
        conversation_id = session.get("tavus_conversation_id")
        if not self.tavus_client or not conversation_id:
            return

        try:
            async with self.tavus_client.post(
                f"https://tavusapi.com/v2/conversations/{conversation_id}/end"
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    print(f"Tavus end-conversation failed ({response.status}): {body}")
                else:
                    print(f"Ended Tavus conversation {conversation_id}")
        except Exception as e:
            print(f"Error ending Tavus conversation: {e}")
    
    async def close_tavus(self):
        """Close Tavus client"""
        if self.tavus_client:
            await self.tavus_client.close()
    
    def create_session(
        self,
        candidate_name: str,
        job_role: str,
        resume_analysis: str,
        interviewer_agent: InterviewerAgent
    ) -> str:
        """Create new interview session"""
        session_id = str(uuid.uuid4())
        
        self.sessions[session_id] = {
            "candidate_name": candidate_name,
            "job_role": job_role,
            "resume_analysis": resume_analysis,
            "interviewer_agent": interviewer_agent,
            "created_at": datetime.now().isoformat(),
            "status": "active",
            "coding_question": None,
            "coding_submitted": False
        }
        
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        """Get session data"""
        return self.sessions.get(session_id)
    
    def end_session(self, session_id: str):
        """End interview session"""
        if session_id in self.sessions:
            self.sessions[session_id]["status"] = "completed"
            self.sessions[session_id]["ended_at"] = datetime.now().isoformat()


# Global session manager
session_manager = SessionManager()


async def notify_session(session_id: Optional[str], payload: Dict[str, Any]):
    """Push an event to the browser over the session's control WebSocket.

    With Tavus running the voice pipeline, questions reach the candidate as
    speech rather than through our socket, so this channel is what keeps the
    on-screen transcript and the code editor in step with the conversation.
    Best-effort: a candidate with no socket attached still gets the interview.
    """
    if not session_id:
        return
    session = session_manager.get_session(session_id)
    websocket = (session or {}).get("control_ws")
    if not websocket:
        return
    try:
        await websocket.send_json(payload)
    except Exception as e:
        print(f"Control channel send failed for {session_id}: {e}")
        session["control_ws"] = None


@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    print("\n" + "="*80)
    print("🚀 Starting AI Interviewer System")
    print("="*80)
    
    # Validate config
    if not validate_config(config):
        print("\n⚠️  Warning: Configuration validation failed")
        print("Some features may not work correctly\n")
    
    # Initialize Tavus
    await session_manager.initialize_tavus()
    
    print(f"\n✅ Server ready!")
    print(f"   Avatar: {'enabled' if config.enable_avatar else 'disabled'}")
    print(f"   Email: {'enabled' if config.enable_email_notifications else 'disabled'}")
    print(f"   Logs: {config.logs_dir}")
    print(f"   Reports: {config.reports_dir}")
    print("\n" + "="*80 + "\n")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    await session_manager.close_tavus()
    print("✅ Server shutdown complete")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "AI Interviewer System API",
        "version": "1.0.0",
        "status": "running"
    }




#video tracking
@app.websocket("/ws/video")
async def receive_video(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connection accepted")

    out_of_view = False
    out_start_time = None
    try:
        while True:
            frame_bytes = await websocket.receive_bytes()
            np_frame = np.frombuffer(frame_bytes, dtype=np.uint8)
            frame = cv2.imdecode(np_frame, cv2.IMREAD_COLOR)

            if frame is None:
                continue

            h, w, _ = frame.shape
            margin_x = int(0.20 * w)
            safe_zone = ((margin_x, 0), (w - margin_x, h))

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)

            eyes_detected = False
            face_in_center = False

            if results.multi_face_landmarks:
                for face_landmarks in results.multi_face_landmarks:
                    face_center = face_landmarks.landmark[1]
                    cx, cy = int(face_center.x * w), int(face_center.y * h)

                    if margin_x < cx < (w - margin_x) and 0 < cy < h:
                        face_in_center = True

                    left_eye_points = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in LEFT_EYE_INDICES]
                    right_eye_points = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in RIGHT_EYE_INDICES]

                    if len(left_eye_points) == 2 and len(right_eye_points) == 2:
                        eyes_detected = True
            
            if not eyes_detected or not face_in_center:
                if not out_of_view:
                    out_of_view = True
                    out_start_time = time.time()
            elif eyes_detected and face_in_center and out_of_view:
                out_of_view = False
                out_duration = time.time() - out_start_time
                write_log("Out of view", duration=out_duration)
                print(f"[LOG] Out of frame duration: {out_duration:.2f}s")
                await websocket.send_text("face_in_frame") 

            if eyes_detected and face_in_center:
                await websocket.send_text("face_in_frame")
            else:
                await websocket.send_text("face_out_of_frame")

    except Exception as e:
        print("Disconnected:", e)

    finally:
        if out_of_view and out_start_time:
            total_duration = time.time() - out_start_time
            write_log("Out of view", duration=total_duration)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "features": {
            "avatar": config.enable_avatar,
            "email": config.enable_email_notifications,
            "livekit": config.enable_livekit
        }
    }


# ---------------------------------------------------------------------------
# OpenAI-compatible endpoint that Tavus calls as its "LLM"
#
# This is the hinge of the live-conversation design. Tavus owns the voice
# pipeline - microphone, sparrow-1 turn detection, barge-in - and whenever the
# candidate finishes a thought it POSTs the conversation here. We ignore the
# model it asks for and return whatever InterviewerAgent decides to say next,
# so adaptive difficulty and the coding-question flow still come from this
# repo. Tavus then speaks the reply through the avatar with lip-sync.
#
# It is internet-facing (Tavus has to reach it), hence the bearer check.
# ---------------------------------------------------------------------------

# Lets us map an inbound Tavus request back to the interview it belongs to.
# Tavus has no per-conversation LLM config, so the id rides along inside the
# conversational context, which it replays to us in the system message.
SESSION_MARKER = "git-hired-session:"


def _extract_session_id(messages: list) -> Optional[str]:
    """Recover our session id from the marker Tavus echoes back."""
    for message in messages:
        content = message.get("content")
        if not isinstance(content, str) or SESSION_MARKER not in content:
            continue
        after = content.split(SESSION_MARKER, 1)[1]
        # The id is followed by a bracket/newline depending on where Tavus
        # spliced the context in.
        session_id = after.strip().split()[0].strip("]}\"',.")
        if session_id:
            return session_id
    return None


def _latest_candidate_message(messages: list) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return ""


def _sse_chunk(chunk_id: str, model: str, delta: dict, finish_reason=None) -> str:
    payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": model,
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}],
    }
    return f"data: {json.dumps(payload)}\n\n"


def _split_for_speech(text: str):
    """Yield sentence-ish pieces.

    Tavus starts speaking the first chunk it receives, so emitting whole
    sentences rather than one blob shortens the silence before the avatar
    replies, without chopping words mid-phrase.
    """
    buffer = ""
    for char in text:
        buffer += char
        if char in ".!?\n" and len(buffer.strip()) > 12:
            yield buffer
            buffer = ""
    if buffer.strip():
        yield buffer


@app.post("/v1/chat/completions")
async def tavus_llm_completions(request: Request):
    """Serve Tavus the next interviewer line, in OpenAI's response shape."""
    expected = config.api.tavus_llm_api_key
    provided = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    if not expected or provided != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")

    body = await request.json()
    messages = body.get("messages") or []
    model = body.get("model") or "git-hired-interviewer"
    stream = bool(body.get("stream", True))

    session_id = _extract_session_id(messages)
    session = session_manager.get_session(session_id) if session_id else None
    if not session:
        print(f"⚠️  Tavus LLM call for unknown session: {session_id!r}")
        raise HTTPException(status_code=404, detail="Session not found")

    interviewer = session["interviewer_agent"]
    candidate_response = _latest_candidate_message(messages)

    # Tavus can call this more than once for the same candidate turn (a retry,
    # or an opening call carrying no answer yet). Every call used to advance
    # the question counter, which is what made the interview jump to the coding
    # question after a single answer - and it billed a Claude call each time.
    # Replay the previous reply instead of advancing.
    fresh_turn = False
    previous = session.get("last_answered")
    if previous is not None and candidate_response == previous:
        reply = session.get("last_reply", "")
        result = session.get("last_result", {})
        print(f"↩️  Replaying reply for duplicate turn (session {session_id[:8]})")
    elif not candidate_response:
        # No answer to respond to yet: hold the floor without consuming a
        # question. The opening was already spoken as the Tavus greeting.
        reply = session.get("last_reply") or session.get("opening") or (
            "Take your time - whenever you're ready."
        )
        result = session.get("last_result", {})
    else:
        # get_next_question does blocking HTTP to Anthropic; keep the event
        # loop free so other sessions' audio/websockets are not stalled behind it.
        started = time.time()
        result = await asyncio.to_thread(interviewer.get_next_question, candidate_response)
        reply = result["question"]
        print(
            f"🗣️  Q{result.get('question_number')} in {time.time() - started:.1f}s "
            f"(session {session_id[:8]})"
        )
        session["last_answered"] = candidate_response
        session["last_reply"] = reply
        session["last_result"] = result
        fresh_turn = True

    # Only push UI events for a genuinely new turn: a replayed reply would
    # otherwise duplicate the transcript entry and re-open the code editor.
    if fresh_turn and result.get("is_coding_question"):
        session["coding_question"] = reply
        # The question reaches the candidate as speech through Tavus, so the
        # editor has to be opened over our own control channel.
        await notify_session(session_id, {
            "type": "coding_question",
            "content": reply,
            "question_number": result.get("question_number"),
        })

    if fresh_turn and result.get("is_coding_hint"):
        # A hint is an invitation to revise, so the editor has to become
        # editable again. The candidate only hears the hint spoken by Tavus -
        # without this the UI would stay locked after their submission.
        await notify_session(session_id, {
            "type": "coding_hint",
            "content": reply,
        })

    if fresh_turn and result.get("is_final"):
        # The interviewer has just said the interview is over. Tavus speaks
        # that line, so the UI only learns about it here - without this the
        # candidate would be left sitting on a finished interview.
        session["interview_complete"] = True
        await notify_session(session_id, {
            "type": "interview_complete",
            "content": reply,
        })

    if fresh_turn:
        await notify_session(session_id, {
            "type": "question",
            "content": reply,
            "question_number": result.get("question_number"),
            "difficulty_level": result.get("difficulty_level"),
        })

    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"

    if not stream:
        return JSONResponse({
            "id": chunk_id,
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": reply},
                "finish_reason": "stop",
            }],
        })

    async def event_stream():
        yield _sse_chunk(chunk_id, model, {"role": "assistant", "content": ""})
        for piece in _split_for_speech(reply):
            yield _sse_chunk(chunk_id, model, {"content": piece})
        yield _sse_chunk(chunk_id, model, {}, finish_reason="stop")
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/session/init", response_model=SessionInitResponse)
async def initialize_session(request: SessionInitRequest):
    """
    Initialize interview session
    - Process resume
    - Analyze against job description
    - Create interview session
    - Initialize avatar (if enabled)
    """
    try:
        print(f"\n📝 Initializing session for {request.job_role}...")

        # Step 1: Resume Evaluation
        print("Step 1/4: Evaluating resume...")
        resume_evaluator = ResumeEvaluatorAgent()

        session_id = str(uuid.uuid4())

        resume_result = await resume_evaluator.process_resume(
            resume_pdf_base64=request.resume_base64,
            job_description=request.job_description,
            session_id=session_id
        )

        resume_analysis = resume_result["analysis"]

        # The resume is the source of truth for the candidate's name; the
        # request value is only a fallback for resumes with no name on them.
        candidate_name = (
            resume_result.get("candidate_name")
            or (request.candidate_name or "").strip()
            or "Candidate"
        )
        candidate_first_name = (
            resume_result.get("candidate_first_name")
            or candidate_name.split()[0]
        )

        # Step 2: Create Interviewer Agent
        print("Step 2/4: Creating interviewer agent...")
        interviewer_agent = InterviewerAgent(
            resume_analysis=resume_analysis,
            candidate_first_name=candidate_first_name
        )

        # Step 3: Create session
        print("Step 3/4: Creating session...")
        session_id = session_manager.create_session(
            candidate_name=candidate_name,
            job_role=request.job_role,
            resume_analysis=resume_analysis,
            interviewer_agent=interviewer_agent
        )
        
        # Save session info
        session = session_manager.get_session(session_id)
        session["session_id"] = session_id
        
        # Step 4: Initialize Avatar (if enabled)
        avatar_url = None
        avatar_conversation_id = None
        if config.enable_avatar:
            print("Step 4/4: Initializing avatar...")
            # Generate the opening now and hand it to Tavus as the greeting:
            # the avatar then opens the interview itself the moment the
            # candidate joins, with no "Start Interview" round trip.
            opening = await asyncio.to_thread(interviewer_agent.start_interview)
            session["opening"] = opening
            avatar = await session_manager.create_tavus_conversation(
                session_id, greeting=opening
            )
            if avatar:
                avatar_url = avatar["url"]
                avatar_conversation_id = avatar["conversation_id"]

        print(f"✅ Session initialized for {candidate_name}: {session_id}\n")

        return SessionInitResponse(
            session_id=session_id,
            status="ready",
            message="Interview session initialized successfully",
            avatar_url=avatar_url,
            avatar_conversation_id=avatar_conversation_id,
            candidate_name=candidate_name,
            candidate_first_name=candidate_first_name
        )
    
    except Exception as e:
        print(f"❌ Error initializing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interview/start")
async def start_interview(session_id: str):
    """
    Start the interview
    Returns opening statement and first question
    """
    try:
        session = session_manager.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # When the avatar is live the opening was generated at session init and
        # handed to Tavus as the greeting; regenerating it here would both cost
        # an extra model call and desync from what the candidate actually heard.
        opening = session.get("opening")
        if not opening:
            interviewer = session["interviewer_agent"]
            opening = await asyncio.to_thread(interviewer.start_interview)
            session["opening"] = opening

        return {
            "session_id": session_id,
            "opening": opening,
            "question_number": 1
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interview/message", response_model=InterviewResponse)
async def process_message(request: InterviewMessage):
    """
    Process candidate's message and get next question
    """
    try:
        session = session_manager.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        interviewer = session["interviewer_agent"]
        
        # Get next question
        result = interviewer.get_next_question(request.message)
        
        # Store coding question if asked
        if result["is_coding_question"]:
            session["coding_question"] = result["question"]
        
        return InterviewResponse(
            response=result["question"],
            is_coding_question=result["is_coding_question"],
            question_number=result["question_number"],
            difficulty_level=result["difficulty_level"]
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interview/code/submit")
async def submit_code(request: CodingSubmission):
    """
    Submit coding solution for evaluation
    """
    try:
        session = session_manager.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        coding_question = session.get("coding_question")
        if not coding_question:
            raise HTTPException(status_code=400, detail="No coding question found")

        # Submitting only records the solution. The interviewer responds to the
        # candidate's spoken explanation of it on their next turn, assessing
        # code and explanation together - so no scoring happens here, and none
        # is returned: telling a candidate their score mid-interview would
        # change how they answer everything that follows.
        interviewer = session["interviewer_agent"]
        interviewer.record_code_submission(request.code, request.session_id)
        session["coding_submitted"] = True

        return {
            "status": "received",
            "message": "Solution received - walk the interviewer through your logic."
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/interview/end")
async def end_interview(request: EndInterviewRequest):
    """
    End interview and generate report
    """
    try:
        session = session_manager.get_session(request.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        interviewer = session["interviewer_agent"]

        # End interview
        closing = interviewer.end_interview()

        # Stop the avatar conversation before the slow report generation, so
        # it is not left running at Tavus while the report is written.
        await session_manager.end_tavus_conversation(request.session_id)

        # Save transcript
        interviewer.save_transcript(request.session_id)
        
        # Get coding score. The rubric runs in the background when the coding
        # round closes, so prefer the agent's result and fall back to a neutral
        # 5 when the candidate never submitted (or it has not landed yet).
        coding_score = (
            interviewer.coding_score
            if getattr(interviewer, "coding_score", None) is not None
            else session.get("coding_score", 5)
        )
        
        # Generate report
        print(f"📊 Generating report for session {request.session_id}...")
        report_generator = ReportGeneratorAgent()
        
        report_result = report_generator.generate_and_send_report(
            session_id=request.session_id,
            candidate_name=session["candidate_name"],
            job_role=session["job_role"],
            coding_score=coding_score
        )
        
        # Mark session as ended
        session_manager.end_session(request.session_id)
        
        return {
            "status": "completed",
            "closing": closing,
            "report_generated": True,
            "email_sent": report_result["email_sent"],
            "report_file": report_result["report_file"]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time interview communication.

    Doubles as the control channel: when Tavus is driving the voice, the
    server pushes questions and coding prompts down this socket so the UI
    can follow along (see notify_session).
    """
    await websocket.accept()

    session = session_manager.get_session(session_id)
    if not session:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return

    session["control_ws"] = websocket

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            if data.get("type") == "message":
                # Process interview message
                interviewer = session["interviewer_agent"]
                result = interviewer.get_next_question(data.get("content", ""))
                
                await websocket.send_json({
                    "type": "response",
                    "content": result["question"],
                    "is_coding_question": result["is_coding_question"],
                    "question_number": result["question_number"]
                })
            
            elif data.get("type") == "code_submit":
                # Same contract as POST /api/interview/code/submit: record the
                # solution, say nothing about its quality. The interviewer
                # assesses it when the candidate explains their logic aloud.
                session["interviewer_agent"].record_code_submission(
                    data.get("code", ""), session_id
                )
                session["coding_submitted"] = True

                await websocket.send_json({"type": "code_received"})
    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            # Socket already gone; nothing useful left to report to the client.
            pass
    finally:
        if session.get("control_ws") is websocket:
            session["control_ws"] = None


if __name__ == "__main__":
    import socket
    import uvicorn

    host = config.server.host
    port = config.server.port
    # 0.0.0.0 is a bind address, not something you can browse to.
    display_host = "localhost" if host in ("0.0.0.0", "127.0.0.1", "::") else host

    print("\n" + "="*80)
    print("Starting AI Interviewer Backend Server")
    print("="*80)
    print("\nServer will be available at:")
    print(f"  - HTTP: http://{display_host}:{port}")
    print(f"  - WebSocket: ws://{display_host}:{port}/ws")
    print(f"  - API Docs: http://{display_host}:{port}/docs")
    print("\nPress Ctrl+C to stop\n")

    # Bind once up front so an unavailable port produces an explanation rather
    # than a bare WinError 10013 / EADDRINUSE from deep inside uvicorn.
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
    except OSError as exc:
        print(f"\nError: cannot bind {host}:{port} - {exc}\n")
        print(f"  Something else is already using port {port}. Either stop it or")
        print(f"  pick another port by setting PORT in server/.env, e.g. PORT={port + 1}")
        print("\n  Find the culprit:")
        print(f"    Windows:     netstat -ano | findstr :{port}")
        print(f"    macOS/Linux: lsof -i :{port}")
        print("\n  If you change PORT, point the frontend at it too - set")
        print("  VITE_API_BASE_URL in agentic-interviewer/.env.local\n")
        sys.exit(1)
    finally:
        probe.close()

    # reload=True re-imports the app by name, which only resolves if this
    # directory is importable - it is not when launched from the repo root.
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=config.server.reload,
        # Watch the source directories only. Pointing this at SERVER_DIR would
        # also cover logs/ and reports/, which the app writes to while running.
        reload_dirs=[
            str(BACKEND_DIR),
            str(SERVER_DIR / "agents"),
            str(SERVER_DIR / "config"),
            str(SERVER_DIR / "prompts"),
        ],
        app_dir=str(BACKEND_DIR),
        log_level="info"
    )
