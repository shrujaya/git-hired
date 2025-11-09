"""
FastAPI Backend Server for AI Interviewer System
Handles resume upload, interview management, and avatar integration
"""

import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from agents.code_evaluator import CodeEvaluatorAgent
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


# Log file setup
log_dir = "./src/logs"
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, "eye_tracking_log.jsonl")
print(log_file)

def write_log(event_type, duration=None):
    log_entry = {
        "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "event": event_type,
        "duration": duration
    }
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")

# Eye landmark indices
LEFT_EYE_INDICES = [33, 133]
RIGHT_EYE_INDICES = [362, 263]




# Pydantic models
class SessionInitRequest(BaseModel):
    resume_base64: str
    job_description: str
    candidate_name: str
    job_role: str


class SessionInitResponse(BaseModel):
    session_id: str
    status: str
    message: str
    avatar_url: Optional[str] = None


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
    
    async def initialize_tavus(self):
        """Initialize Tavus HTTP client"""
        if config.enable_avatar and config.api.tavus_api_key:
            self.tavus_client = aiohttp.ClientSession(
                headers={
                    "x-api-key": config.api.tavus_api_key,
                    "Content-Type": "application/json"
                }
            )
    
    async def create_tavus_conversation(self, session_id: str, resume_analysis: str) -> Optional[str]:
        """Create Tavus avatar conversation"""
        if not self.tavus_client or not config.api.tavus_replica_id:
            return None
        
        try:
            payload = {
                "replica_id": config.api.tavus_replica_id,
                "conversational_context": f"""You are conducting a technical interview. 
                Here is the candidate analysis: {resume_analysis[:500]}"""
            }
            
            async with self.tavus_client.post(
                "https://tavusapi.com/v2/conversations",
                json=payload
            ) as response:
                data = await response.json()
                conversation_url = data.get("conversation_url")
                self.sessions[session_id]["tavus_conversation_id"] = data.get("conversation_id")
                return conversation_url
        except Exception as e:
            print(f"Error creating Tavus conversation: {e}")
            return None
    
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
        print(f"\n📝 Initializing session for {request.candidate_name}...")
        
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
        
        # Step 2: Create Interviewer Agent
        print("Step 2/4: Creating interviewer agent...")
        interviewer_agent = InterviewerAgent(resume_analysis=resume_analysis)
        
        # Step 3: Create session
        print("Step 3/4: Creating session...")
        session_id = session_manager.create_session(
            candidate_name=request.candidate_name,
            job_role=request.job_role,
            resume_analysis=resume_analysis,
            interviewer_agent=interviewer_agent
        )
        
        # Save session info
        session = session_manager.get_session(session_id)
        session["session_id"] = session_id
        
        # Step 4: Initialize Avatar (if enabled)
        avatar_url = None
        if config.enable_avatar:
            print("Step 4/4: Initializing avatar...")
            avatar_url = await session_manager.create_tavus_conversation(
                session_id, resume_analysis
            )
        
        print(f"✅ Session initialized: {session_id}\n")
        
        return SessionInitResponse(
            session_id=session_id,
            status="ready",
            message="Interview session initialized successfully",
            avatar_url=avatar_url
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
        
        interviewer = session["interviewer_agent"]
        opening = interviewer.start_interview()
        
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
        
        # Evaluate code
        print(f"💻 Evaluating code for session {request.session_id}...")
        code_evaluator = CodeEvaluatorAgent()
        
        evaluation_result = code_evaluator.evaluate_code(
            coding_question=coding_question,
            candidate_code=request.code
        )
        
        # Save evaluation
        code_evaluator.save_evaluation(evaluation_result, request.session_id)
        
        # Store score in session
        session["coding_score"] = evaluation_result["evaluation"]["score"]
        session["coding_submitted"] = True
        
        return {
            "status": "evaluated",
            "score": evaluation_result["evaluation"]["score"],
            "feedback": evaluation_result["evaluation"]["summary"]
        }
    
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
        
        # Save transcript
        interviewer.save_transcript(request.session_id)
        
        # Get coding score (default to 5 if not submitted)
        coding_score = session.get("coding_score", 5)
        
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
    WebSocket endpoint for real-time interview communication
    """
    await websocket.accept()
    
    session = session_manager.get_session(session_id)
    if not session:
        await websocket.send_json({"error": "Session not found"})
        await websocket.close()
        return
    
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
                # Evaluate code
                code_evaluator = CodeEvaluatorAgent()
                evaluation_result = code_evaluator.evaluate_code(
                    coding_question=session.get("coding_question", ""),
                    candidate_code=data.get("code", "")
                )
                
                await websocket.send_json({
                    "type": "code_evaluated",
                    "score": evaluation_result["evaluation"]["score"],
                    "feedback": evaluation_result["evaluation"]["summary"]
                })
    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_json({"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*80)
    print("Starting AI Interviewer Backend Server")
    print("="*80)
    print("\nServer will be available at:")
    print("  - HTTP: http://localhost:8000")
    print("  - WebSocket: ws://localhost:8000/ws")
    print("  - API Docs: http://localhost:8000/docs")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
