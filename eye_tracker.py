import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 
import cv2
import mediapipe as mp
import time
import json
from datetime import datetime


# Mediapipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Log file setup
log_dir = "./logs"
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

# Eye tracking state
out_of_view = False
out_start_time = None

# Capture video
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("Error: Could not open video.")
    exit()

print("Starting eye tracking. Press 'q' to stop...")

while True:
    ret, frame = cap.read()
    if not ret:
        print("Frame not readable")
        break

    h, w, _ = frame.shape

    # Convert to RGB for MediaPipe
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    eyes_detected = False

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            left_eye_points = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in LEFT_EYE_INDICES]
            right_eye_points = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in RIGHT_EYE_INDICES]
            # Draw bounding boxes around the eyes
            if len(left_eye_points) == 2 and len(right_eye_points) == 2:
                eyes_detected = True
                # Left eye rectangle
                left_xs, left_ys = zip(*left_eye_points)
                cv2.rectangle(frame, (min(left_xs)-15, min(left_ys)-15), (max(left_xs)+15, max(left_ys)+15), (255, 0, 0), 2)
                # Right eye rectangle
                right_xs, right_ys = zip(*right_eye_points)
                cv2.rectangle(frame, (min(right_xs)-15, min(right_ys)-15), (max(right_xs)+15, max(right_ys)+15), (255, 0, 0), 2)

    if not eyes_detected and not out_of_view:
        out_of_view = True
        out_start_time = time.time()
        print("out of frame")

    elif eyes_detected and out_of_view:
        out_of_view = False
        out_duration = time.time() - out_start_time
        print(f"inframe. Out of frame for {out_duration:.2f} seconds.")
        write_log("Out of view", duration=out_duration)

    # Display video feed
    cv2.imshow("Eye Tracker", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Log any remaining out-of-view state on exit
if out_of_view and out_start_time:
    total_duration = time.time() - out_start_time
    write_log("Out of view", duration=total_duration)
