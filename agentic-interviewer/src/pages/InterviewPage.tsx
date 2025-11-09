// src/pages/InterviewPage.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFullscreen } from "../hooks/useFullscreen";
import {
  Video,
  Mic,
  MicOff,
  Code2,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Square,
} from "lucide-react";

interface TranscriptEntry {
  type: "question" | "answer" | "system";
  text: string;
  timestamp: Date;
}

const InterviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { isFullscreen, fullscreenExits, enterFullscreen, exitFullscreen } =
    useFullscreen();

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const videoWsRef = useRef<WebSocket | null>(null);
  const chatWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const currentTranscriptRef = useRef<string>("");

  // Anti-cheating states
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);

  // Video/Audio states
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [faceStatus, setFaceStatus] = useState<"in_frame" | "out_of_frame">("in_frame");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Interview states
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSpeech, setCurrentSpeech] = useState<string>("");

  // Code editor states
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [code, setCode] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);

  // Speech synthesis
  const synthesis = window.speechSynthesis;

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Initialize camera and audio
  useEffect(() => {
    const initMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        setStream(mediaStream);
        setCameraEnabled(true);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Setup audio analyzer
        setupAudioAnalyzer(mediaStream);

        // Setup video WebSocket
        setupVideoWebSocket();
      } catch (err) {
        console.error("Media access error:", err);
        alert("Please allow camera and microphone access.");
      }
    };

    initMedia();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoWsRef.current) {
        videoWsRef.current.close();
      }
      if (chatWsRef.current) {
        chatWsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Setup audio analyzer
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

      // Monitor audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(Math.min(100, (average / 255) * 200));
        requestAnimationFrame(checkLevel);
      };
      checkLevel();
    } catch (err) {
      console.error("Audio analyzer setup failed:", err);
    }
  };

  // Setup video WebSocket for face detection
  const setupVideoWebSocket = () => {
    const ws = new WebSocket("ws://localhost:8000/ws/video");

    ws.onopen = () => {
      console.log("Video WebSocket connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data === "face_in_frame") {
        setFaceStatus("in_frame");
      } else if (event.data === "face_out_of_frame") {
        setFaceStatus("out_of_frame");
      }
    };

    ws.onerror = (error) => {
      console.error("Video WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Video WebSocket closed");
    };

    videoWsRef.current = ws;
  };

  // Setup chat WebSocket for interview
  const setupChatWebSocket = () => {
    const sessionId = sessionStorage.getItem("sessionId");
    if (!sessionId) return;

    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

    ws.onopen = () => {
      console.log("Chat WebSocket connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
      console.error("Chat WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("Chat WebSocket closed");
    };

    chatWsRef.current = ws;
  };

  // Capture and send video frames
  useEffect(() => {
    let interval: number;
    if (videoWsRef.current && stream) {
      interval = setInterval(() => {
        captureAndSendFrame();
      }, 500);
    }
    return () => clearInterval(interval);
  }, [stream]);

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || !videoWsRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      async (blob) => {
        if (blob && videoWsRef.current?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await blob.arrayBuffer();
          videoWsRef.current.send(arrayBuffer);
        }
      },
      "image/jpeg",
      0.8
    );
  };

  // Setup speech recognition with continuous mode
  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      // Enable continuous recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        console.log("Speech recognition started");
        setIsListening(true);
        currentTranscriptRef.current = "";
        setCurrentSpeech("");
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event);
        setIsListening(false);
      };

      recognition.onend = () => {
        console.log("Speech recognition ended");
        setIsListening(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = "";
        let finalTranscript = "";

        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        // Update the accumulated transcript
        if (finalTranscript) {
          currentTranscriptRef.current += finalTranscript;
        }

        // Show interim + final results in UI
        const displayText = currentTranscriptRef.current + interimTranscript;
        setCurrentSpeech(displayText);
      };

      recognitionRef.current = recognition;

      // Load voices
      const voices = synthesis.getVoices();
      if (voices.length === 0) {
        synthesis.onvoiceschanged = () => synthesis.getVoices();
      }
    } else {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
    }
  }, []);

  // Handle WebSocket message
  const handleWebSocketMessage = (data: any) => {
    if (data.type === "response") {
      const question = data.content;
      setTranscript((prev) => [
        ...prev,
        {
          type: "question",
          text: question,
          timestamp: new Date(),
        },
      ]);

      // Check if it's a coding question
      if (data.is_coding_question) {
        setShowCodeEditor(true);
        speak(question + " Please use the code editor to write your solution.");
      } else {
        speak(question);
      }
    }
  };

  // Text to speech
  const speak = (text: string, onEnd?: () => void) => {
    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthesis.getVoices();
    utterance.voice = voices.find((v) => v.lang.includes("en")) || null;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    synthesis.speak(utterance);
  };

  // Handle speech input when user clicks stop
  const handleSpeechInput = (speech: string) => {
    if (!speech.trim()) return;

    // Add to transcript
    setTranscript((prev) => [
      ...prev,
      {
        type: "answer",
        text: speech,
        timestamp: new Date(),
      },
    ]);

    // Send to backend
    if (chatWsRef.current?.readyState === WebSocket.OPEN) {
      chatWsRef.current.send(
        JSON.stringify({ type: "message", content: speech })
      );
    }

    // Clear current speech
    setCurrentSpeech("");
    currentTranscriptRef.current = "";
  };

  // Start interview
  const startInterview = async () => {
    setIsLoading(true);
    try {
      const sessionId = sessionStorage.getItem("sessionId");
      const response = await fetch(
        `http://localhost:8000/api/interview/start?session_id=${sessionId}`,
        { method: "POST" }
      );
      const data = await response.json();

      setTranscript([
        {
          type: "question",
          text: data.opening,
          timestamp: new Date(),
        },
      ]);

      setInterviewStarted(true);
      setupChatWebSocket();
      speak(data.opening);
    } catch (error) {
      console.error("Failed to start interview:", error);
      alert("Failed to start interview. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle listening - start or stop recording
  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      // Stop listening and send the accumulated speech
      recognitionRef.current.stop();
      
      // Send the final accumulated transcript
      const finalSpeech = currentTranscriptRef.current.trim();
      if (finalSpeech) {
        handleSpeechInput(finalSpeech);
      }
    } else {
      // Start listening
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Failed to start recognition:", error);
      }
    }
  };

  // Submit code
  const submitCode = async () => {
    if (!code.trim()) {
      alert("Please enter your code!");
      return;
    }

    setIsSubmittingCode(true);
    try {
      const sessionId = sessionStorage.getItem("sessionId");
      const response = await fetch(
        "http://localhost:8000/api/interview/code/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, code }),
        }
      );
      const data = await response.json();

      const feedback = `Code submitted! Score: ${data.score}/10. Feedback: ${data.feedback}`;
      setTranscript((prev) => [
        ...prev,
        {
          type: "system",
          text: feedback,
          timestamp: new Date(),
        },
      ]);
      speak(feedback);
      setShowCodeEditor(false);
      setCode("");
    } catch (error) {
      console.error("Failed to submit code:", error);
      alert("Failed to submit code. Please try again.");
    } finally {
      setIsSubmittingCode(false);
    }
  };

  // Enter fullscreen on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      enterFullscreen();
    }, 500);
    return () => clearTimeout(timer);
  }, [enterFullscreen]);

  // Monitor fullscreen exits
  useEffect(() => {
    if (fullscreenExits > 0 && !showExitDialog) {
      setShowWarning(true);
      const timer = setTimeout(() => setShowWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [fullscreenExits, showExitDialog]);

  // Detect tab switches
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches((prev) => prev + 1);
        console.warn("Tab switch detected");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Prevent shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F11" || ((e.ctrlKey || e.metaKey) && e.key === "w")) {
        e.preventDefault();
      }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave?";
      return e.returnValue;
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  // Handle exit interview
  const handleExitInterview = async () => {
    await exitFullscreen();
    sessionStorage.setItem("interviewCompleted", "true");
    navigate("/results");
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 relative">
      {/* Hidden canvas for video processing */}
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      {/* Exit Button */}
      <button
        onClick={() => setShowExitDialog(true)}
        className="fixed top-3 right-3 z-50 bg-red-500/90 hover:bg-red-600 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Exit Interview
      </button>

      {/* Fullscreen Warning */}
      {showWarning && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-500/95 backdrop-blur-sm text-white px-4 py-2 rounded-xl shadow-2xl animate-shake flex items-center gap-2 max-w-md">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-xs">Fullscreen Warning</p>
            <p className="text-[10px] mt-0.5">
              You exited fullscreen. This has been recorded. ({fullscreenExits} exit{fullscreenExits !== 1 ? "s" : ""})
            </p>
          </div>
          <button
            onClick={() => {
              enterFullscreen();
              setShowWarning(false);
            }}
            className="ml-auto bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap"
          >
            Return
          </button>
        </div>
      )}

      {/* Exit Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  Exit Interview?
                </h3>
                <p className="text-xs text-gray-600">
                  Your progress will be saved and reviewed.
                </p>
              </div>
            </div>

            {(fullscreenExits > 0 || tabSwitches > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800 mb-1">
                  Activity Summary:
                </p>
                <ul className="text-[10px] text-red-700 space-y-0.5">
                  {fullscreenExits > 0 && (
                    <li>• {fullscreenExits} fullscreen exit{fullscreenExits !== 1 ? "s" : ""}</li>
                  )}
                  {tabSwitches > 0 && (
                    <li>• {tabSwitches} tab switch{tabSwitches !== 1 ? "es" : ""}</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowExitDialog(false)}
                className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-xl text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExitInterview}
                className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Exit Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="h-full w-full flex flex-col p-3 pt-14">
        <div className="flex-1 flex gap-3 overflow-hidden">
          {/* Left Side - Avatar & User Video */}
          <div className="w-80 flex flex-col gap-3">
            {/* AI Avatar Container */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-gray-900">AI Interviewer</h3>
                {isSpeaking && (
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-1 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse animation-delay-100"></div>
                    <div className="w-1 h-3 bg-blue-500 rounded-full animate-pulse animation-delay-200"></div>
                  </div>
                )}
              </div>
              
              {/* Avatar Placeholder */}
              <div className="relative aspect-video bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg overflow-hidden flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-xs text-gray-600 font-medium">AI Avatar</p>
                  <p className="text-[10px] text-gray-500">Coming Soon</p>
                </div>
              </div>

              {/* Start Interview Button */}
              {!interviewStarted && (
                <button
                  onClick={startInterview}
                  disabled={isLoading}
                  className="w-full mt-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:from-gray-400 disabled:to-gray-400 text-white px-3 py-2 rounded-lg text-xs font-semibold shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    "Start Interview"
                  )}
                </button>
              )}
            </div>

            {/* User Video Container */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Video className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Your Video</h3>
                </div>
                {cameraEnabled && (
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] text-green-700 font-medium">Live</span>
                  </div>
                )}
              </div>

              {/* Video Feed */}
              <div className="relative flex-1 bg-black rounded-lg overflow-hidden min-h-0">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Face status indicator */}
                {faceStatus === "out_of_frame" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="text-center text-white">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 animate-bounce" />
                      <p className="text-xs font-semibold">Face not detected</p>
                      <p className="text-[10px]">Please center yourself</p>
                    </div>
                  </div>
                )}

                {/* Corner guides */}
                <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-blue-400 rounded-tl"></div>
                <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-blue-400 rounded-tr"></div>
                <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-blue-400 rounded-bl"></div>
                <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-blue-400 rounded-br"></div>
              </div>

              {/* Audio Level & Controls */}
              <div className="mt-2 space-y-2">
                {/* Audio Level */}
                <div className="flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5 text-gray-600" />
                  <div className="flex-1 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-400 to-cyan-500 transition-all duration-100"
                      style={{ width: `${audioLevel}%` }}
                    ></div>
                  </div>
                </div>

                {/* Current Speech Preview */}
                {isListening && currentSpeech && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <p className="text-[10px] text-blue-700 font-semibold mb-0.5">
                      Recording...
                    </p>
                    <p className="text-xs text-gray-700 line-clamp-2">
                      {currentSpeech}
                    </p>
                  </div>
                )}

                {/* Mic Button */}
                {interviewStarted && (
                  <button
                    onClick={toggleListening}
                    disabled={isSpeaking}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                      isListening
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                    } ${isSpeaking ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isListening ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        End Speaking
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        Start Speaking
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Side - Transcript & Code Editor */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* Transcript Container */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-gray-900">Interview Transcript</h3>
                <div className="ml-auto text-[10px] text-gray-500">
                  {transcript.length} message{transcript.length !== 1 ? "s" : ""}
                </div>
              </div>

              {/* Transcript Messages */}
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                {transcript.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center">
                    <div>
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-1">
                        Ready to Start
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Click "Start Interview" to begin
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {transcript.map((entry, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg p-2 shadow-sm ${
                          entry.type === "question"
                            ? "bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100"
                            : entry.type === "answer"
                            ? "bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100"
                            : "bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {entry.type === "question" && (
                            <>
                              <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <span className="text-[10px] font-semibold text-blue-700">Interviewer</span>
                            </>
                          )}
                          {entry.type === "answer" && (
                            <>
                              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <span className="text-[10px] font-semibold text-green-700">You</span>
                            </>
                          )}
                          {entry.type === "system" && (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-[10px] font-semibold text-gray-700">System</span>
                            </>
                          )}
                          <span className="ml-auto text-[9px] text-gray-400">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-800 leading-relaxed">{entry.text}</p>
                      </div>
                    ))}
                    <div ref={transcriptEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Code Editor Container */}
            {showCodeEditor && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl flex-shrink-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <Code2 className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-gray-900">Code Editor</h3>
                  <div className="ml-auto text-[10px] text-indigo-600 font-medium">
                    Coding Question
                  </div>
                </div>

                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Write your code here..."
                  className="w-full h-32 bg-gray-900 text-green-400 font-mono text-xs p-3 rounded-lg border-2 border-gray-700 focus:border-indigo-500 focus:outline-none resize-none"
                  spellCheck={false}
                />

                <button
                  onClick={submitCode}
                  disabled={isSubmittingCode || !code.trim()}
                  className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white px-3 py-2 rounded-lg text-xs font-semibold shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  {isSubmittingCode ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Submit Code
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-50%) translateY(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(-50%) translateY(5px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
        .animation-delay-100 {
          animation-delay: 0.1s;
        }
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
        
        /* Custom scrollbar for transcript */
        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default InterviewPage;