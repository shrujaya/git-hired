import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { wsUrl } from "../config";
import FlowHeader from "../components/FlowHeader";

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
  // The "Before you begin" confirmations, ticked by the candidate.
  const [checked, setChecked] = useState<Record<string, boolean>>({});

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
    const socket = new WebSocket(wsUrl("/ws/video"));

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
    const startTimestamp = Date.now();
    const sessionExpiry = startTimestamp + (60 * 60 * 1000); // 1 hour
    sessionStorage.setItem('sessionStart', startTimestamp.toString());
    sessionStorage.setItem('sessionExpiry', sessionExpiry.toString());
    navigate("/landing");
  };

  const canProceed =
    cameraEnabled && audioEnabled && faceStatus === "in_frame" && isStreaming;

  // The mock's "Before you begin" checklist: four things only the candidate
  // can confirm, ticked by hand. Device readiness is still checked separately
  // (canProceed) — the face warning lives on the camera preview itself.
  const CHECKS = [
    {
      id: "quiet",
      label: "I am in a quiet room alone",
      detail: "Background voices can be picked up as your answers.",
    },
    {
      id: "id",
      label: "My photo ID is within reach",
      detail: "You may be asked to hold it up to the camera.",
    },
    {
      id: "time",
      label: "I have 45 uninterrupted minutes",
      detail: "The interview cannot be paused once it starts.",
    },
    {
      id: "net",
      label: "I am on a stable connection",
      detail: "Wired or strong Wi-Fi. Close other video calls.",
    },
  ];
  const allChecked = CHECKS.every((c) => checked[c.id]);

  // 18 bars, heights derived from the one live audio level. Deterministic
  // per-bar scaling keeps it lively without extra state.
  const bars = Array.from({ length: 18 }, (_, i) => {
    const wave = 0.55 + 0.45 * Math.sin(i * 1.7);
    return Math.max(6, Math.min(100, audioLevel * wave * 1.4));
  });

  return (
    <div className="min-h-screen sheet text-ink flex flex-col">
      <FlowHeader step={1} />

      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 lg:gap-14 max-w-[1240px] w-full mx-auto px-5 md:px-10 py-8 md:py-12">

        {/* ---- Left: heading + preview + meters ---- */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className="reveal" style={{ "--d": "0s" } as React.CSSProperties}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-2 h-2 bg-signal" />
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-inksub">
                Fig. 1 — Equipment check
              </span>
            </div>
            <h1 className="font-display font-extrabold text-[38px] md:text-[46px] leading-[1.02] tracking-hero">
              Check your camera<br />and microphone
            </h1>
            <span className="redline w-24 mt-5" />
            <p className="text-[15px] leading-relaxed text-inksub max-w-[52ch] mt-4">
              Your interviewer needs to see and hear you clearly. Nothing on
              this page is recorded.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 px-4 py-3 border-2 border-alarm bg-card animate-shake">
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-alarm flex-shrink-0">
                Err
              </span>
              <p className="flex-1 text-[13.5px] text-ink">{error}</p>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex-shrink-0 px-3.5 py-1.5 bg-[#C43B30] hover:bg-[#D24A3F] disabled:opacity-60 text-white text-[13px] font-semibold transition-colors"
              >
                {isRetrying ? "Retrying…" : "Retry"}
              </button>
            </div>
          )}

          {/* Camera preview — drawn as a figure with corner ticks */}
          <div
            className="reveal relative"
            style={{ "--d": "0.08s" } as React.CSSProperties}
          >
            <div className="relative aspect-[16/10] overflow-hidden border-2 border-ink bg-field">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />

              {!stream && !error && (
                <div className="absolute inset-0 blueprint flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-full border border-dashed border-trace/60" />
                  <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-dsub">
                    waiting for camera…
                  </div>
                </div>
              )}

              {/* Status pill */}
              <div className="absolute top-3.5 left-3.5 flex items-center gap-2 px-2.5 py-1.5 bg-field/85 backdrop-blur-sm border border-edge">
                <span
                  className={
                    "w-1.5 h-1.5 " +
                    (isStreaming ? "bg-trace" : "bg-signal-dark animate-recblink")
                  }
                />
                <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-dtext">
                  {isStreaming ? "Live check" : "Connecting…"}
                </span>
              </div>

              {/* Face-position warning, on the preview itself */}
              {faceStatus === "out_of_frame" && isStreaming && (
                <div className="absolute inset-0 bg-field/60 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-alarm" />
                  <div className="px-4 py-2 bg-field/90 backdrop-blur-sm border border-alarm text-center">
                    <p className="text-[14px] font-semibold text-alarm">
                      Face not centered
                    </p>
                    <p className="text-[11.5px] text-dsub mt-0.5">
                      Move so your face sits in the middle of the frame
                    </p>
                  </div>
                </div>
              )}
            </div>
            {/* Corner ticks */}
            <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-signal" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-signal" />
            <div className="flex justify-between mt-2 font-mono text-[8.5px] tracking-[0.14em] uppercase text-inkfaint">
              <span>Camera preview · 16:10</span>
              <span>not recorded</span>
            </div>
          </div>

          {/* Meters — ruled cells */}
          <div
            className="reveal grid grid-cols-1 sm:grid-cols-2 border-2 border-ink divide-y sm:divide-y-0 sm:divide-x divide-rule bg-card"
            style={{ "--d": "0.16s" } as React.CSSProperties}
          >
            <div className="px-[18px] py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold">
                  Microphone
                </div>
                <div
                  className={
                    "font-mono text-[9.5px] tracking-[0.1em] uppercase " +
                    (audioEnabled ? "text-inksub" : "text-alarm")
                  }
                >
                  {audioEnabled ? "detected" : "off"}
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-7">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-trace transition-[height] duration-100"
                    style={{ height: `${audioEnabled ? h : 4}%` }}
                  />
                ))}
              </div>
              <div className="text-xs text-inksub mt-2.5">
                {audioEnabled
                  ? "Say a few words — you should see movement"
                  : "Allow microphone access to continue"}
              </div>
            </div>

            <div className="px-[18px] py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[13px] font-semibold">
                  Connection
                </div>
                <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inksub">
                  {isStreaming ? "open" : "…"}
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-7">
                {[40, 62, 88, 100].map((h, i) => (
                  <div
                    key={i}
                    className={"flex-1 " + (isStreaming ? "bg-trace" : "bg-rule")}
                    style={{ height: `${h}%` }}
                  />
                ))}
                <div className="flex-1 bg-rule" style={{ height: "100%" }} />
              </div>
              <div className="text-xs text-inksub mt-2.5">
                {isStreaming
                  ? "Connected — face tracking is running"
                  : "Reaching the interview server…"}
              </div>
            </div>
          </div>
        </div>

        {/* ---- Right: readiness + expectations + continue ---- */}
        <div className="flex flex-col gap-5 min-w-0">
          <div
            className="reveal border-2 border-ink bg-card"
            style={{ "--d": "0.12s" } as React.CSSProperties}
          >
            <div className="px-[22px] pt-5 pb-4 border-b-2 border-ink">
              <div className="font-display font-bold text-[19px] tracking-sub">
                Before you begin
              </div>
              <div className="text-[13px] text-inksub mt-0.5">
                Confirm all four to continue.
              </div>
            </div>
            <div className="flex flex-col divide-y divide-rule">
              {CHECKS.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() =>
                    setChecked((prev) => ({ ...prev, [c.id]: !prev[c.id] }))
                  }
                  role="checkbox"
                  aria-checked={!!checked[c.id]}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setChecked((prev) => ({ ...prev, [c.id]: !prev[c.id] }));
                    }
                  }}
                  className="flex gap-[13px] px-[22px] py-[15px] cursor-pointer hover:bg-paper transition-colors"
                >
                  <span className="font-mono text-[9px] text-inkfaint mt-1 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div
                    className={
                      "flex-shrink-0 w-[18px] h-[18px] mt-0.5 flex items-center justify-center border-2 transition-colors " +
                      (checked[c.id]
                        ? "border-signal bg-signal"
                        : "border-inkfaint bg-card")
                    }
                  >
                    {checked[c.id] && (
                      <div className="w-[9px] h-[5px] border-l-2 border-b-2 border-black -rotate-45 -translate-y-[1px]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium leading-snug">{c.label}</div>
                    <div className="text-[12.5px] text-inksub leading-relaxed mt-0.5">
                      {c.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="reveal px-5 py-[18px] bg-wash border border-washline"
            style={{ "--d": "0.2s" } as React.CSSProperties}
          >
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-inksub mb-2">
              Note — what to expect
            </div>
            <div className="text-[13.5px] leading-relaxed text-ink">
              An AI interviewer asks technical questions tailored to your resume,
              including a live coding exercise. Your transcript and code are
              shared with the hiring team afterwards.
            </div>
          </div>

          <button
            onClick={handleProceed}
            disabled={!canProceed || !allChecked}
            className={
              "reveal w-full py-4 text-[14.5px] font-semibold tracking-[-0.005em] transition-colors " +
              (canProceed && allChecked
                ? "bg-signal hover:bg-signal-dark text-black cursor-pointer border-2 border-signal"
                : "bg-transparent text-inkfaint border-2 border-rule cursor-not-allowed")
            }
            style={{ "--d": "0.26s" } as React.CSSProperties}
          >
            {!allChecked
              ? "Confirm the checklist to continue"
              : !canProceed
              ? "Waiting for your setup…"
              : "Continue to role selection →"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraCheck;
