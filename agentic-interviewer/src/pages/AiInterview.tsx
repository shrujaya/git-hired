import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFullscreen } from "../hooks/useFullscreen";

const AiInterview: React.FC = () => {
  const navigate = useNavigate();
  const { isFullscreen, fullscreenExits, enterFullscreen, exitFullscreen } =
    useFullscreen();

  // Anti-cheating states
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);

  const [loading, setLoading] = useState(false);
  // Interview states
  const [transcript, setTranscript] = useState<
    { type: "question" | "answer" | "system"; text: string; timestamp: Date }[]
  >([]);
  const [showCodeEditor, setShowCodeEditor] = useState<boolean>(false);
  const [code, setCode] = useState<string>("");
  const [interviewStarted, setInterviewStarted] = useState<boolean>(false);
  const [interviewEnded, setInterviewEnded] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);

  const [recognition, setRecognition] = useState<SpeechRecognition | null>(
    null
  );
  const [synthesis] = useState<SpeechSynthesis>(window.speechSynthesis);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll transcript
  const scrollToBottom = () => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [transcript]);

  // Initialize camera, speech recognition, WebSocket
  useEffect(() => {
    // Camera
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        const videoElement = document.getElementById(
          "userVideo"
        ) as HTMLVideoElement;
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error("Camera access error:", err);
        alert("Please allow camera and mic access.");
      });

    // Force voice load
    const voices = synthesis.getVoices();
    if (voices.length === 0) {
      synthesis.onvoiceschanged = () => synthesis.getVoices();
    }

    // Speech recognition setup
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new SpeechRecognition();
      recog.continuous = false;
      recog.interimResults = false;
      recog.lang = "en-US";

      recog.onstart = () => setIsListening(true);
      recog.onerror = () => setIsListening(false);
      recog.onend = () => setIsListening(false);
      recog.onresult = async (event: SpeechRecognitionEvent) => {
        const speech = event.results[0][0].transcript;
        await handleSpeechInput(speech);
      };

      setRecognition(recog);
    } else {
      alert("Speech recognition not supported in this browser.");
    }

    // WebSocket initialization
    const sessionId = sessionStorage.getItem("sessionId");
    if (sessionId) {
      const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);
      ws.onopen = () => console.log("WebSocket connected");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };
      ws.onerror = (error) => console.error("WebSocket error:", error);
      wsRef.current = ws;
    }

    return () => {
      wsRef.current?.close();
      recognition?.stop();
    };
  }, []);

  // Enter fullscreen on mount
  useEffect(() => {
    const tryEnterFullscreen = () => {
      if (!isFullscreen) {
        enterFullscreen();
      }
    };

    // Immediately try entering fullscreen
    tryEnterFullscreen();

    // Retry in case browser prevented fullscreen due to lack of interaction
    const retry = setTimeout(tryEnterFullscreen, 1000);

    return () => clearTimeout(retry);
  }, [enterFullscreen, isFullscreen]);

  // Monitor fullscreen exit
  useEffect(() => {
    if (fullscreenExits > 0 && !showExitDialog) {
      setShowWarning(true);
      const timer = setTimeout(() => setShowWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [fullscreenExits, showExitDialog]);

  // Monitor tab switches
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

  // Prevent certain keyboard/mouse actions
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

  const speak = (text: string, onEnd?: () => void) => {
    synthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const voices = synthesis.getVoices();
    utter.voice = voices.find((v) => v.lang === "en-US") || null;
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    synthesis.speak(utter);
  };

  const handleSpeechInput = async (speech: string) => {
    setTranscript((prev) => [
      ...prev,
      {
        type: "answer",
        text: speech,
        timestamp: new Date(),
      },
    ]);
    wsRef.current?.send(JSON.stringify({ type: "message", content: speech }));
  };

  const handleWebSocketMessage = (data: any) => {
    if (data.type === "response") {
      const question = data.content;
      setCurrentQuestion(question);
      setTranscript((prev) => [
        ...prev,
        {
          type: "question",
          text: question,
          timestamp: new Date(),
        },
      ]);
      if (data.is_coding_question) {
        setShowCodeEditor(true);
        speak(question + " Please use the code editor to write your solution.");
      } else {
        speak(question, () => recognition?.start());
      }
    }
  };

  const startInterview = async () => {
    setLoading(true);
    const sessionId = sessionStorage.getItem("sessionId");
    const response = await fetch(
      `http://localhost:8000/api/interview/start?session_id=${sessionId}`,
      { method: "POST" }
    );
    const data = await response.json();
    const openingText = data.opening;
    setTranscript([
      {
        type: "question",
        text: openingText,
        timestamp: new Date(),
      },
    ]);
    setInterviewStarted(true);
    speak(openingText, () => recognition?.start());
    setLoading(false);
  };

  const submitCode = async () => {
    if (!code.trim()) {
      alert("Please enter your code!");
      return;
    }
    const sessionId = sessionStorage.getItem("sessionId");
    const response = await fetch(
      `http://localhost:8000/api/interview/code/submit`,
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
  };

  const endInterview = async () => {
    recognition?.stop();
    synthesis.cancel();
    const sessionId = sessionStorage.getItem("sessionId");
    const response = await fetch(`http://localhost:8000/api/interview/end`, {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    setTranscript((prev) => [
      ...prev,
      {
        type: "system",
        text: data.closing,
        timestamp: new Date(),
      },
    ]);
    speak(data.closing);
    setInterviewEnded(true);
  };

  const handleExitInterview = async () => {
    await exitFullscreen();
    sessionStorage.setItem("interviewCompleted", "true");
    navigate("/results");
  };
  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 relative">
      {/* Global Fullscreen Warning Toast */}
      {showWarning && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-yellow-500/95 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-pulse">
            <svg
              className="w-5 h-5 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 9v2m0 4h.01M11.93 4h.14C13.1 4 14 4.9 14 6v12a2 2 0 01-2 2h-.14C9.9 20 9 19.1 9 18V6c0-1.1.9-2 2-2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <p className="font-bold">Fullscreen Exit Detected</p>
              <button
                onClick={() => {
                  enterFullscreen();
                  setShowWarning(false);
                }}
                className="text-sm underline ml-2"
              >
                Return to Fullscreen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Button */}
      <button
        onClick={() => setShowExitDialog(true)}
        className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md"
      >
        Exit Interview
      </button>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-6xl w-full flex gap-8">
          {/* Left Section – AI Video */}
          <div className="w-1/3 bg-white/70 backdrop-blur-md shadow-md rounded-xl p-4 flex flex-col items-center text-center">
            <h3 className="text-xl font-bold mb-4 text-gray-700">
              🎭 AI Interviewer
            </h3>
            <video
              id="userVideo"
              autoPlay
              muted
              className="rounded-lg border bg-gray-300 w-60 h-44 shadow"
            />
            {!interviewStarted && (
              <button
                onClick={startInterview}
                className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-md"
              >
                {loading ? "loading.." : "Start Interview"}
              </button>
            )}
            {interviewStarted && !interviewEnded && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={toggleListening}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md shadow"
                >
                  {isListening ? "User is Speaking" : "Press to Speak"}
                </button>
              </div>
            )}
          </div>

          {/* Right Section – Transcript + Code */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-xl font-bold mb-4 text-gray-700">
              📝 Transcript
            </h3>
            <div className="bg-white/80 backdrop-blur-lg p-4 rounded-lg shadow max-h-[60vh] overflow-y-auto space-y-3">
              {transcript.map((entry, idx) => (
                <div key={idx} className="rounded-lg p-2 bg-gray-50 shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">
                    {entry.type === "question"
                      ? "👔 Interviewer"
                      : entry.type === "answer"
                      ? "👤 You"
                      : "💬 System"}
                  </p>
                  <p className="text-gray-800 text-sm">{entry.text}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {entry.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>

            {showCodeEditor && (
              <div className="mt-6">
                <h4 className="text-gray-700 font-semibold mb-2">
                  💻 Code Editor
                </h4>
                <textarea
                  className="w-full h-40 border border-gray-300 p-3 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <button
                  onClick={submitCode}
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow"
                >
                  Submit Code
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              Exit Interview?
            </h3>
            <p className="text-sm text-gray-600 mb-5">
              Your progress will be saved and reviewed. Are you sure you want to
              exit?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleExitInterview}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiInterview;
