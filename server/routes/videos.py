import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 
import json
import time
from fastapi import APIRouter,WebSocket
from fastapi.middleware.cors import CORSMiddleware
from routes.example import router as example_router
import numpy as np 
import cv2
from datetime import datetime
import mediapipe as mp


router = APIRouter()

# Mediapipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Log file setup
log_dir = "./server/src/logs"
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "eye_tracking_log.jsonl")


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

@router.websocket("/ws/video")
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