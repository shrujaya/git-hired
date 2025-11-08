import React, { useRef, useState, useEffect } from "react";

const Test: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Request camera and mic access
  const startMedia = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      alert("Camera or microphone access denied");
    }
  };

  // Capture a single frame from video and send via WebSocket
  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !ws) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (blob && ws.readyState === WebSocket.OPEN) {
        const arrayBuffer = await blob.arrayBuffer();
        ws.send(arrayBuffer); // send frame data as bytes
      }
    }, "image/jpeg");
  };

  // Set up WebSocket connection
  const setupWebSocket = () => {
    const socket = new WebSocket("ws://localhost:8000/ws/video");

    socket.onopen = () => {
      console.log("Connected to FastAPI WebSocket");
      setIsStreaming(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      console.log("Message from server:", event.data);
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
      setIsStreaming(false);
    };

    setWs(socket);
  };

  useEffect(() => {
    startMedia();
  }, []);

  useEffect(() => {
    if (stream && !ws) {
      setupWebSocket();
    }
  }, [stream]);

  // Send frame periodically
  useEffect(() => {
    let interval: number;
    if (isStreaming) {
      interval = setInterval(captureAndSendFrame, 500); // send every 500ms
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  return (
    <div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "640px", border: "1px solid black" }}
      ></video>
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{ display: "none" }}
      ></canvas>
    </div>
  );
};

export default Test;
