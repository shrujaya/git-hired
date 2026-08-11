// src/pages/InterviewPage.tsx
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFullscreen } from "../hooks/useFullscreen";
import { useTavusAvatar, type AvatarUtterance } from "../hooks/useTavusAvatar";
import { apiUrl, wsUrl } from "../config";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Code2,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Square,
  PhoneOff,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";

interface TranscriptEntry {
  type: "question" | "answer" | "system";
  text: string;
  timestamp: Date;
}

// Two renderings of the same spoken line rarely match byte for byte: the text
// we generate carries punctuation that Tavus's transcription may drop, and
// whitespace differs. Compare on the words alone.
const sameSpeech = (a: string, b: string): boolean => {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/['’]/g, "") //     dont == don't
      .replace(/[^\w\s]/g, " ") // "Dispatcher-Worker" == "dispatcher worker"
      .replace(/\s+/g, " ")
      .trim();
  return normalize(a) === normalize(b);
};

const InterviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { fullscreenExits, enterFullscreen, exitFullscreen } = useFullscreen();

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
  // Locked between submitting a solution and the interviewer inviting a
  // revision. A submitted answer is what the interviewer is assessing, so
  // editing it underneath them would make their hint refer to code that no
  // longer exists.
  const [codeLocked, setCodeLocked] = useState(false);
  // The interviewer has delivered its closing line. The prompt to finish is
  // dismissible because that closing invites final questions — the candidate
  // may still want to speak before leaving.
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [showEndPrompt, setShowEndPrompt] = useState(false);

  // Device toggles. Kept here rather than read off the avatar, so they work
  // before (and without) a live Tavus call.
  const [micOn, setMicOn] = useState(true);

  // Side panel: transcript by default, code once a coding question is asked
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"transcript" | "code">("transcript");

  // Call timer, for the header readout. Derived from a fixed start timestamp
  // rather than an incrementing counter: browsers throttle setInterval in a
  // backgrounded tab, so a counter would silently under-report the length of
  // the interview. This is also the value the results page reports.
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () =>
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const jobTitle = sessionStorage.getItem("jobTitle") || "Technical Interview";
  const candidateFirstName = sessionStorage.getItem("candidateFirstName") || "You";
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Speech synthesis
  const synthesis = window.speechSynthesis;

  // Tavus avatar. When connected it runs the whole conversation: it hears the
  // candidate, decides when they have finished a thought, and speaks the
  // questions our backend returns. Browser speech recognition + TTS below is
  // the push-to-talk fallback used only when the avatar is unavailable.
  const handleUtterance = useCallback((utterance: AvatarUtterance) => {
    const type = utterance.role === "interviewer" ? "question" : "answer";

    setTranscript((prev) => {
      // The opening line reaches us twice: once seeded from
      // /api/interview/start below, and again as the utterance for the
      // custom_greeting Tavus speaks. Whichever lands first wins; drop the
      // echo. This also absorbs duplicate utterance events, which Tavus can
      // emit when it retries a turn.
      const last = prev[prev.length - 1];
      if (last?.type === type && sameSpeech(last.text, utterance.text)) {
        return prev;
      }

      return [...prev, { type, text: utterance.text, timestamp: new Date() }];
    });
  }, []);

  const avatar = useTavusAvatar(
    sessionStorage.getItem("avatarUrl"),
    sessionStorage.getItem("avatarConversationId"),
    { onUtterance: handleUtterance }
  );
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);

  // With the avatar live, Tavus drives the microphone and turn-taking, so the
  // manual record button and browser TTS must stay out of the way.
  const avatarLive = avatar.status === "connected";

  // Attach the replica's media to the avatar video element
  useEffect(() => {
    if (avatarVideoRef.current) {
      avatarVideoRef.current.srcObject = avatar.remoteStream;
    }
  }, [avatar.remoteStream]);

  // The avatar greets the candidate the moment it connects, so the interview
  // is already under way — open the control channel and seed the transcript
  // with the opening line rather than waiting for a button.
  useEffect(() => {
    if (!avatarLive || interviewStarted) return;
    setInterviewStarted(true);
    setupChatWebSocket();

    (async () => {
      try {
        const sessionId = sessionStorage.getItem("sessionId");
        const response = await fetch(
          apiUrl(`/api/interview/start?session_id=${sessionId}`),
          { method: "POST" }
        );
        const data = await response.json();
        if (data.opening) {
          setTranscript((prev) =>
            prev.length ? prev : [
              { type: "question", text: data.opening, timestamp: new Date() },
            ]
          );
        }
      } catch (error) {
        console.error("Failed to record interview start:", error);
      }
    })();
  }, [avatarLive, interviewStarted]);

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
    const ws = new WebSocket(wsUrl("/ws/video"));

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

    const ws = new WebSocket(wsUrl(`/ws/${sessionId}`));

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

    // Read the track's live state rather than React state: this runs from a
    // setInterval closure that would otherwise see a stale value. With the
    // camera off the frames are black, which the backend would score as the
    // candidate having left the frame.
    const videoTrack = (videoRef.current.srcObject as MediaStream | null)
      ?.getVideoTracks()[0];
    if (!videoTrack?.enabled) return;

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

  // Setup speech recognition with continuous mode.
  // Only for the no-avatar fallback: when Tavus is live it does the listening,
  // and running a second recogniser on the same mic fights with it.
  useEffect(() => {
    if (avatarLive) return;
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
  }, [avatarLive]);

  // Handle WebSocket message
  const handleWebSocketMessage = (data: any) => {
    // Server-pushed control events. With Tavus driving the conversation the
    // question reaches the candidate as speech, so these exist to keep the UI
    // in step — opening the editor when a coding question is asked.
    if (data.type === "coding_question") {
      // Surface the editor the moment the question is asked — the candidate
      // hears it as speech, so nothing on screen would otherwise change.
      setShowCodeEditor(true);
      setActivePanel("code");
      setSidePanelOpen(true);
      setCodeLocked(false);
      return;
    }

    if (data.type === "interview_complete") {
      // Let the avatar finish speaking its closing line before the dialog
      // covers the screen — popping it mid-sentence reads as a cut-off.
      setInterviewComplete(true);
      setCodeLocked(true);
      window.setTimeout(() => setShowEndPrompt(true), 6000);
      return;
    }

    if (data.type === "coding_hint") {
      // The interviewer is asking for another attempt, so hand the editor
      // back. Reopening the panel matters as much as unlocking it: the
      // candidate may have switched to the transcript tab while explaining.
      setShowCodeEditor(true);
      setActivePanel("code");
      setSidePanelOpen(true);
      setCodeLocked(false);
      return;
    }

    if (data.type === "question") {
      // The avatar speaks (and transcribes) its own lines, so adding them
      // here too would duplicate every question in the transcript.
      if (!avatarLive) {
        setTranscript((prev) => [
          ...prev,
          { type: "question", text: data.content, timestamp: new Date() },
        ]);
        speak(data.content);
      }
      return;
    }

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
        setActivePanel("code");
        setSidePanelOpen(true);
        speak(question + " Please use the code editor to write your solution.");
      } else {
        speak(question);
      }
    }
  };

  // Interviewer speech. When the avatar is live it has already spoken the
  // line itself (Tavus generated the audio), so this is a no-op; otherwise
  // browser TTS reads it out.
  const speak = (text: string, onEnd?: () => void) => {
    if (avatarLive) {
      onEnd?.();
      return;
    }
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

  // One speaking indicator across both voices
  const interviewerSpeaking = avatarLive ? avatar.replicaSpeaking : isSpeaking;
  // Whether the candidate is being heard right now
  const candidateSpeaking = avatarLive ? avatar.userSpeaking : isListening;
  const liveSpeech = avatarLive ? avatar.interimSpeech : currentSpeech;

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
        apiUrl(`/api/interview/start?session_id=${sessionId}`),
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
        apiUrl("/api/interview/code/submit"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, code }),
        }
      );
      if (!response.ok) throw new Error(`Submit failed: ${response.status}`);

      // Submitting is not the end of the exercise: the interviewer assesses
      // the solution against how the candidate explains it, and may come back
      // with a hint. So the editor stays open and the code stays put - they
      // need it to revise. No score is shown; the backend no longer returns
      // one, and quoting a score mid-interview would colour every later answer.
      setCodeLocked(true);
      setTranscript((prev) => [
        ...prev,
        {
          type: "system",
          text: "Submitted successfully — talk the interviewer through your logic.",
          timestamp: new Date(),
        },
      ]);
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
    // Freeze the duration at the moment the interview ends. The results page
    // reports how long the interview took, so it must not keep counting while
    // the candidate sits reading it.
    sessionStorage.setItem(
      "interviewDuration",
      String(Math.floor((Date.now() - startedAtRef.current) / 1000))
    );
    sessionStorage.setItem("interviewCompleted", "true");
    navigate("/results");
  };


  // ---- device controls ---------------------------------------------------
  // Two separate captures are in play: `stream` (getUserMedia) drives the
  // self-view, the audio meter and the face-tracking frames, while Daily runs
  // its own microphone capture for what the interviewer actually hears.
  // Muting has to cover both or the avatar keeps listening to a "muted" mic.
  const handleToggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    avatar.setMic(next);
    if (!next && recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  // The camera is never published to Tavus (videoSource: false), so this is
  // purely local: self-view plus the frames sent for face tracking.
  const handleToggleCamera = () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  };

  // ---- helpers for the meeting chrome ------------------------------------
  const formatClock = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  };

  // Shared tile geometry, so the control bar stays visually even.
  const tile =
    "w-11 h-11 rounded-xl flex items-center justify-center transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[#111A24]";

  const actionTile = tile + " bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white";
  const activeTile = tile + " bg-blue-600 text-white hover:bg-blue-500";
  // A device that is off is a state worth noticing, so it reads red.
  const dangerTile = tile + " bg-red-600 text-white hover:bg-red-500";

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111A24]">
      {/* Hidden canvas for video processing */}
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      {/* Fullscreen warning */}
      {showWarning && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white px-4 py-2.5 rounded-xl shadow-2xl animate-shake flex items-center gap-2.5 max-w-md">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-xs">Fullscreen exited</p>
            <p className="text-[10px] mt-0.5 text-white/90">
              This has been recorded ({fullscreenExits} exit
              {fullscreenExits !== 1 ? "s" : ""}).
            </p>
          </div>
          <button
            onClick={() => {
              enterFullscreen();
              setShowWarning(false);
            }}
            className="bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
          >
            Return
          </button>
        </div>
      )}

      {/* Exit dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">End interview?</h3>
                <p className="text-xs text-gray-600">
                  Your progress will be saved and reviewed.
                </p>
              </div>
            </div>

            {(fullscreenExits > 0 || tabSwitches > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-red-800 mb-1">Activity summary</p>
                <ul className="text-[10px] text-red-700 space-y-0.5">
                  {fullscreenExits > 0 && (
                    <li>{fullscreenExits} fullscreen exit{fullscreenExits !== 1 ? "s" : ""}</li>
                  )}
                  {tabSwitches > 0 && (
                    <li>{tabSwitches} tab switch{tabSwitches !== 1 ? "es" : ""}</li>
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
                End interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== App shell ===================== */}
      <div className="w-full h-full bg-[#111A24] flex flex-col overflow-hidden">

        {/* ---- Header ---- */}
        <header className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Video className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] leading-tight text-slate-400 truncate">{todayLabel}</p>
            <h1 className="text-sm font-semibold text-white leading-tight truncate">
              {jobTitle}
            </h1>
          </div>
          <div className="ml-auto flex-shrink-0 flex items-center gap-2">
            {/* Dismissing the end-of-interview prompt shouldn't be a dead end —
                this brings it back. */}
            {interviewComplete && !showEndPrompt && (
              <button
                onClick={() => setShowEndPrompt(true)}
                className="text-xs font-medium text-green-300 bg-green-500/15 hover:bg-green-500/25 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Interview complete
              </button>
            )}
            <span className="text-xs font-mono tabular-nums text-slate-300 bg-white/5 px-2.5 py-1.5 rounded-lg">
              {formatClock(elapsed)}
            </span>
          </div>
        </header>

        {/* ---- Body ---- */}
        <div className="flex-1 flex min-h-0 gap-3 px-3 pb-3">

          {/* ============ Stage ============ */}
          <div className="flex-1 flex flex-col min-w-0 gap-3">
            <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden bg-slate-800">

              {/* Interviewer video */}
              {avatarLive && avatar.remoteStream ? (
                <video
                  // Callback ref: the element mounts after the stream arrives,
                  // so attach here as well as in the effect.
                  ref={(el) => {
                    avatarVideoRef.current = el;
                    if (el && el.srcObject !== avatar.remoteStream) {
                      el.srcObject = avatar.remoteStream;
                    }
                  }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
                  <div className="text-center">
                    <div className="w-24 h-24 rounded-full bg-white/10 mx-auto mb-4 flex items-center justify-center">
                      {avatar.status === "connecting" ? (
                        <Loader2 className="w-9 h-9 text-slate-300 animate-spin" />
                      ) : (
                        <svg className="w-11 h-11 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-200">
                      {avatar.status === "connecting"
                        ? "Connecting to your interviewer"
                        : "AI Interviewer"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {avatar.status === "connecting" ? "One moment" : "Voice-only mode"}
                    </p>
                  </div>
                </div>
              )}

              {/* Recording pill */}
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/55 backdrop-blur-md rounded-lg pl-2.5 pr-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-medium text-white tabular-nums">
                  {formatClock(elapsed)}
                </span>
                <span className="text-[11px] text-white/50">recording</span>
              </div>

              {/* Interviewer name plate */}
              <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/55 backdrop-blur-md rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-white">AI Interviewer</span>
                {interviewerSpeaking && (
                  <span className="flex items-end gap-[2px] h-3">
                    <span className="w-[3px] h-1.5 bg-blue-400 rounded-full animate-pulse" />
                    <span className="w-[3px] h-3 bg-blue-400 rounded-full animate-pulse animation-delay-100" />
                    <span className="w-[3px] h-2 bg-blue-400 rounded-full animate-pulse animation-delay-200" />
                  </span>
                )}
              </div>

              {/* Live caption of what the candidate is saying */}
              {candidateSpeaking && liveSpeech && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[36%] bg-black/70 backdrop-blur-md rounded-xl px-4 py-2">
                  <p className="text-xs text-white/95 text-center line-clamp-2">{liveSpeech}</p>
                </div>
              )}

              {/* Self-view, bottom-right over the interviewer */}
              <div
                className={
                  "absolute bottom-4 right-4 w-56 sm:w-64 lg:w-80 aspect-video rounded-2xl " +
                  "overflow-hidden bg-black shadow-2xl ring-2 transition-colors " +
                  (!cameraEnabled
                    ? "ring-red-500/60"
                    : faceStatus === "out_of_frame"
                    ? "ring-amber-400"
                    : candidateSpeaking
                    ? "ring-green-400"
                    : "ring-white/20")
                }
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={
                    "w-full h-full object-cover " + (cameraEnabled ? "" : "invisible")
                  }
                />

                {!cameraEnabled && (
                  <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
                    <VideoOff className="w-7 h-7 text-slate-500 mb-1.5" />
                    <p className="text-[11px] font-medium text-slate-400">Camera off</p>
                  </div>
                )}

                {cameraEnabled && faceStatus === "out_of_frame" && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-center px-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mb-1" />
                    <p className="text-[11px] font-semibold text-amber-200 leading-tight">
                      Center your face
                    </p>
                  </div>
                )}

                {/* Name + mic level: visible evidence you are being heard */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                  <span className="text-[11px] text-white font-medium bg-black/60 backdrop-blur-md rounded-md px-2 py-1 truncate max-w-[45%]">
                    {candidateFirstName}
                  </span>
                  <div className="flex-1 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-md px-2 py-1.5">
                    {micOn ? (
                      <Mic className="w-3 h-3 text-slate-300 flex-shrink-0" />
                    ) : (
                      <MicOff className="w-3 h-3 text-red-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 h-1 bg-white/15 rounded-full overflow-hidden">
                      <div
                        className={
                          "h-full transition-all duration-100 " +
                          (micOn ? "bg-green-400" : "bg-red-500")
                        }
                        style={{ width: (micOn ? audioLevel : 100) + "%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ---- Control bar ---- */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2">
              {/* Left: conversation state, read-only */}
              <div
                className={
                  "h-11 px-3.5 rounded-xl flex items-center gap-2 text-xs font-medium min-w-0 " +
                  (avatarLive && interviewerSpeaking
                    ? "bg-blue-500/15 text-blue-300"
                    : avatarLive && candidateSpeaking
                    ? "bg-green-500/15 text-green-300"
                    : "bg-white/5 text-slate-400")
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                <span className="truncate">
                  {!avatarLive
                    ? avatar.status === "connecting"
                      ? "Connecting"
                      : "Voice-only mode"
                    : interviewerSpeaking
                    ? "Interviewer speaking"
                    : candidateSpeaking
                    ? "Listening"
                    : "Ready, speak any time"}
                </span>
              </div>

              {/* Center: device status + end call */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMic}
                  className={micOn ? actionTile : dangerTile}
                  title={micOn ? "Mute microphone" : "Unmute microphone"}
                  aria-pressed={!micOn}
                >
                  {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleToggleCamera}
                  className={cameraEnabled ? actionTile : dangerTile}
                  title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
                  aria-pressed={!cameraEnabled}
                >
                  {cameraEnabled ? (
                    <Video className="w-5 h-5" />
                  ) : (
                    <VideoOff className="w-5 h-5" />
                  )}
                </button>

                <button
                  onClick={() => setShowExitDialog(true)}
                  className="h-11 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111A24]"
                  title="End interview"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span className="hidden sm:inline">End</span>
                </button>
              </div>

              {/* Right: panel switches */}
              <div className="flex items-center gap-2">
                {showCodeEditor && (
                  <button
                    onClick={() => {
                      setActivePanel("code");
                      setSidePanelOpen(true);
                    }}
                    className={
                      activePanel === "code" && sidePanelOpen ? activeTile : actionTile
                    }
                    title="Code editor"
                  >
                    <Code2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setActivePanel("transcript");
                    setSidePanelOpen(true);
                  }}
                  className={
                    activePanel === "transcript" && sidePanelOpen ? activeTile : actionTile
                  }
                  title="Transcript"
                >
                  <MessageSquareText className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSidePanelOpen((open) => !open)}
                  className={actionTile}
                  title={sidePanelOpen ? "Hide panel" : "Show panel"}
                >
                  {sidePanelOpen ? (
                    <PanelRightClose className="w-5 h-5" />
                  ) : (
                    <PanelRightOpen className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ============ Side panel ============ */}
          {sidePanelOpen && (
            <aside className="hidden md:flex w-[340px] lg:w-[380px] flex-shrink-0 flex-col bg-white rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                <h2 className="text-base font-semibold text-gray-900">Interview Details</h2>
                <button
                  onClick={() => setSidePanelOpen(false)}
                  className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="mx-4 mb-3 p-1 bg-gray-100 rounded-xl flex gap-1">
                <button
                  onClick={() => setActivePanel("transcript")}
                  className={
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors " +
                    (activePanel === "transcript"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700")
                  }
                >
                  Transcript
                </button>
                <button
                  onClick={() => showCodeEditor && setActivePanel("code")}
                  disabled={!showCodeEditor}
                  className={
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 " +
                    (activePanel === "code"
                      ? "bg-white text-gray-900 shadow-sm"
                      : showCodeEditor
                      ? "text-gray-500 hover:text-gray-700"
                      : "text-gray-300 cursor-not-allowed")
                  }
                  title={showCodeEditor ? "Code editor" : "Appears when a coding question is asked"}
                >
                  Code
                  {showCodeEditor && activePanel !== "code" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                </button>
              </div>

              {/* ---- Transcript ---- */}
              {activePanel === "transcript" && (
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
                  {transcript.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <div>
                        <div className="w-14 h-14 bg-gray-100 rounded-full mx-auto mb-3 flex items-center justify-center">
                          <MessageSquareText className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-xs font-semibold text-gray-900 mb-1">
                          {avatar.status === "connecting" ? "Connecting" : "Nothing said yet"}
                        </p>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          {avatarLive
                            ? "Your interviewer will greet you in a moment. Everything said appears here."
                            : avatar.status === "connecting"
                            ? "Setting up the conversation"
                            : "The conversation will appear here"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {transcript.map((entry, idx) => {
                        const isYou = entry.type === "answer";
                        const isSystem = entry.type === "system";
                        return (
                          <div
                            key={idx}
                            className={"flex gap-2 " + (isYou ? "flex-row-reverse" : "")}
                          >
                            <div
                              className={
                                "w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center " +
                                (isSystem ? "bg-gray-200" : isYou ? "bg-green-100" : "bg-blue-100")
                              }
                            >
                              {isSystem ? (
                                <CheckCircle className="w-3.5 h-3.5 text-gray-500" />
                              ) : (
                                <svg
                                  className={
                                    "w-3.5 h-3.5 " + (isYou ? "text-green-600" : "text-blue-600")
                                  }
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              )}
                            </div>
                            <div
                              className={
                                "min-w-0 max-w-[85%] flex flex-col " +
                                (isYou ? "items-end" : "items-start")
                              }
                            >
                              <div
                                className={
                                  "rounded-2xl px-3 py-2 " +
                                  (isSystem
                                    ? "bg-gray-100 text-gray-700"
                                    : isYou
                                    ? "bg-blue-600 text-white rounded-tr-sm"
                                    : "bg-gray-100 text-gray-800 rounded-tl-sm")
                                }
                              >
                                <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                  {entry.text}
                                </p>
                              </div>
                              <span className="text-[9px] text-gray-400 mt-1 px-1">
                                {isSystem ? "System" : isYou ? "You" : "Interviewer"}
                                {" · "}
                                {entry.timestamp.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={transcriptEndRef} />
                    </>
                  )}
                </div>
              )}

              {/* ---- Code ---- */}
              {activePanel === "code" && (
                <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-semibold text-gray-900">Your solution</span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      {codeLocked
                        ? "submitted — waiting on the interviewer"
                        : "talk through it as you go"}
                    </span>
                  </div>

                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={codeLocked}
                    placeholder="Write your code here"
                    aria-label="Your solution"
                    className={
                      "flex-1 min-h-0 w-full font-mono text-xs leading-relaxed p-3 rounded-xl border resize-none focus:outline-none " +
                      (codeLocked
                        ? "bg-[#1A1F26] text-gray-500 border-gray-800 cursor-not-allowed"
                        : "bg-[#0F1720] text-green-400 border-gray-800 focus:border-indigo-500")
                    }
                    spellCheck={false}
                  />

                  <button
                    onClick={submitCode}
                    disabled={codeLocked || isSubmittingCode || !code.trim()}
                    title={
                      codeLocked
                        ? "Submitted. The editor reopens if the interviewer asks you to revise it."
                        : undefined
                    }
                    className="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:hover:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmittingCode ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting
                      </>
                    ) : codeLocked ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Submitted
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit code
                      </>
                    )}
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Push-to-talk fallback: only when there is no live avatar */}
        {!avatarLive && interviewStarted && (
          <div className="flex-shrink-0 px-3 pb-3">
            <button
              onClick={toggleListening}
              disabled={isSpeaking}
              className={
                "w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 " +
                (isListening
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : "bg-green-600 hover:bg-green-500 text-white") +
                (isSpeaking ? " opacity-50 cursor-not-allowed" : "")
              }
            >
              {isListening ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  Done speaking
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Start speaking
                </>
              )}
            </button>
          </div>
        )}

        {!avatarLive && !interviewStarted && (
          <div className="flex-shrink-0 px-3 pb-3">
            <button
              onClick={startInterview}
              disabled={isLoading}
              className="w-full px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting
                </>
              ) : (
                "Start interview"
              )}
            </button>
          </div>
        )}
      </div>

      {showEndPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-prompt-title"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>

            <h2 id="end-prompt-title" className="text-lg font-semibold text-gray-900">
              That's the end of the interview
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Ending it now closes the call and takes you to your summary. If you
              still have a question for the interviewer, you can ask it first.
            </p>

            <button
              onClick={handleExitInterview}
              autoFocus
              className="w-full mt-5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <PhoneOff className="w-4 h-4" />
              End interview
            </button>
            <button
              onClick={() => setShowEndPrompt(false)}
              className="w-full mt-2 text-gray-600 hover:text-gray-900 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              Not yet — I have a question
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-50%) translateY(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(-50%) translateY(4px); }
        }
        .animate-shake { animation: shake 0.5s; }
        .animation-delay-100 { animation-delay: 0.1s; }
        .animation-delay-200 { animation-delay: 0.2s; }

        .overflow-y-auto::-webkit-scrollbar { width: 6px; }
        .overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #9ca3af; }

        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .animate-pulse, .animate-spin { animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default InterviewPage;
