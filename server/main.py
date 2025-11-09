import os
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3' 
import json
import time
from fastapi import FastAPI,WebSocket
from fastapi.middleware.cors import CORSMiddleware
from routes.example import router as example_router
from routes.videos import router as ws_video_router
from routes.code_evaluator import router as code_evaluation_router
import numpy as np 
import cv2
from datetime import datetime
import mediapipe as mp


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"], 
    allow_headers=["*"], 
)

@app.get("/")
async def root():
    return {"hi": "there"}

app.include_router(ws_video_router)

# Register the router properly
app.include_router(example_router)

app.include_router(code_evaluation_router)
