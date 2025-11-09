import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const CameraCheck: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [faceStatus, setFaceStatus] = useState<
    "checking" | "in_frame" | "out_of_frame"
  >("checking");
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const navigate = useNavigate();

  // Setup audio analyzer for visual feedback
  const setupAudioAnalyzer = (mediaStream: MediaStream) => {
    try {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(mediaStream);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start monitoring audio levels
      monitorAudioLevel();
    } catch (err) {
      console.error("Audio analyzer setup failed:", err);
    }
  };

  const monitorAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const checkLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(Math.min(100, (average / 255) * 200)); // Scale to 0-100

      requestAnimationFrame(checkLevel);
    };

    checkLevel();
  };

  // Request camera and mic access
  const startMedia = async () => {
    try {
      setIsRetrying(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      setStream(mediaStream);

      const videoTrack = mediaStream.getVideoTracks()[0];
      const audioTrack = mediaStream.getAudioTracks()[0];

      setCameraEnabled(videoTrack?.enabled || false);
      setAudioEnabled(audioTrack?.enabled || false);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Setup audio analyzer
      if (audioTrack) {
        setupAudioAnalyzer(mediaStream);
      }

      setError("");
      setIsRetrying(false);
    } catch (error) {
      setError(
        "Camera or microphone access denied. Please allow permissions and try again."
      );
      setIsRetrying(false);
      console.error("Media access error:", error);
    }
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !ws) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
      if (blob && ws.readyState === WebSocket.OPEN) {
        const arrayBuffer = await blob.arrayBuffer();
        ws.send(arrayBuffer);
      }
    }, "image/jpeg");
  };

  const setupWebSocket = () => {
    const socket = new WebSocket("ws://localhost:8000/ws/video");

    socket.onopen = () => {
      console.log("Connected to FastAPI WebSocket");
      setIsStreaming(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      console.log("Message from server:", event.data);

      if (event.data === "face_in_frame") {
        setFaceStatus("in_frame");
      } else if (event.data === "face_out_of_frame") {
        setFaceStatus("out_of_frame");
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      setError("Connection error. Please check if the server is running.");
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
      setIsStreaming(false);
    };

    setWs(socket);
  };

  const handleRetry = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (ws) {
      ws.close();
    }
    setStream(null);
    setWs(null);
    setError("");
    startMedia();
  };

  useEffect(() => {
    startMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (ws) {
        ws.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (stream && !ws) {
      setupWebSocket();
    }
  }, [stream]);

  useEffect(() => {
    let interval: number;
    if (isStreaming) {
      interval = setInterval(captureAndSendFrame, 500);
    }
    return () => clearInterval(interval);
  }, [isStreaming, ws]);

  const handleProceed = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (ws) {
      ws.close();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    sessionStorage.setItem('cameraCheckCompleted', 'true');
    const sessionExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
    sessionStorage.setItem('sessionExpiry', sessionExpiry.toString());
    navigate("/landing");
  };

  const canProceed =
    cameraEnabled && audioEnabled && faceStatus === "in_frame" && isStreaming;

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 flex items-center justify-center p-2 md:p-4">
      {/* Animated background - Blue theme */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -inset-[10px] opacity-50">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-teal-400/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center max-w-6xl px-4">
        {/* Header - Compact */}
        <div className="text-center mb-3">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-1 tracking-tight">
            Camera & Audio Check
          </h1>
          <p className="text-gray-700 text-xs md:text-sm">
            Please ensure your camera and microphone are working properly
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="w-full max-w-4xl mb-3 bg-red-500/20 backdrop-blur-sm border border-red-400/50 rounded-xl p-3 animate-shake">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-800 font-medium text-sm">{error}</p>
              </div>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-red-500/50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {isRetrying ? "Retrying..." : "Retry"}
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 w-full flex flex-col items-center justify-center">
          {/* Video Container - Larger */}
          <div className="relative w-full max-w-4xl h-[55vh] mb-4 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-blue-500/50">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
            />

            {/* Video Overlay Effects */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Corner guides - Blue theme */}
              <div className="absolute top-4 left-4 w-12 h-12 border-l-4 border-t-4 border-blue-400 rounded-tl-lg"></div>
              <div className="absolute top-4 right-4 w-12 h-12 border-r-4 border-t-4 border-blue-400 rounded-tr-lg"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 border-l-4 border-b-4 border-blue-400 rounded-bl-lg"></div>
              <div className="absolute bottom-4 right-4 w-12 h-12 border-r-4 border-b-4 border-blue-400 rounded-br-lg"></div>
            </div>

            {/* Status Badge */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
              {!isStreaming && !error && (
                <div className="bg-blue-500/90 backdrop-blur-sm text-white px-5 py-2 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  Connecting...
                </div>
              )}

              {faceStatus === "out_of_frame" && isStreaming && (
                <div className="bg-yellow-500/90 backdrop-blur-sm text-white px-5 py-2 rounded-full text-sm font-semibold shadow-lg animate-bounce flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Please place yourself in the center of the camera
                </div>
              )}
            </div>
          </div>

          <canvas ref={canvasRef} width={640} height={480} className="hidden" />

          {/* Status Indicators - Compact */}
          <div className="w-full max-w-4xl bg-white/80 backdrop-blur-md rounded-xl p-4 mb-3 border border-blue-100 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Camera Status */}
              <div className="flex items-center gap-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-100">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                  cameraEnabled ? "bg-gradient-to-br from-green-400 to-emerald-500" : "bg-gradient-to-br from-red-400 to-red-500"
                }`}>
                  {cameraEnabled ? (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 font-semibold text-sm">Camera</p>
                  <p
                    className={`text-xs font-medium ${
                      cameraEnabled ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {cameraEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>

              {/* Audio Status */}
              <div className="flex items-center gap-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-100">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                  audioEnabled ? "bg-gradient-to-br from-green-400 to-emerald-500" : "bg-gradient-to-br from-red-400 to-red-500"
                }`}>
                  {audioEnabled ? (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 font-semibold text-sm">
                    Microphone
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      audioEnabled ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {audioEnabled ? "Enabled" : "Disabled"}
                  </p>
                  {/* Audio Level Bar - Blue theme */}
                  {audioEnabled && (
                    <div className="mt-1.5 h-1 bg-blue-100 rounded-full overflow-hidden border border-blue-200">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 transition-all duration-100"
                        style={{ width: `${audioLevel}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Connection Status */}
              <div className="flex items-center gap-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-100">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
                  isStreaming ? "bg-gradient-to-br from-green-400 to-emerald-500" : "bg-gradient-to-br from-yellow-400 to-yellow-500"
                }`}>
                  {isStreaming ? (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-gray-900 font-semibold text-sm">
                    Connection
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      isStreaming ? "text-green-600" : "text-yellow-600"
                    }`}
                  >
                    {isStreaming ? "Connected" : "Connecting..."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Proceed Button - Compact */}
          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className={`group w-full max-w-lg py-3 rounded-xl text-base font-bold transition-all duration-300 transform ${
              canProceed
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/50 hover:scale-105 hover:shadow-xl"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {canProceed ? (
              <span className="flex items-center justify-center gap-2">
                Proceed to Landing Page
                <svg
                  className={`w-5 h-5 ${
                    canProceed ? "group-hover:translate-x-1" : ""
                  } transition-transform`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </span>
            ) : (
              "Waiting for setup..."
            )}
          </button>

          {!canProceed && cameraEnabled && audioEnabled && (
            <p className="text-gray-700 text-xs mt-2 text-center">
              Position your face in the center of the camera frame to continue
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-5px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(5px);
          }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
};

export default CameraCheck;
