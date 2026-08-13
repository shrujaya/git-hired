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

  // ---- opening the code editor -------------------------------------------
  // The control event arrives the moment the backend has the question, but the
  // candidate only hears it once Tavus has run it through TTS — several
  // seconds later. Opening on arrival made the editor appear before any coding
  // question had been asked, which is exactly as confusing as it sounds.
  //
  // So the open is deferred until the avatar has actually finished speaking.
  // "Finished" means it started and then stopped: at the moment the event
  // lands it has not started yet, so waiting for a bare `!speaking` would fire
  // immediately and change nothing.
  const pendingEditorRef = useRef(false);
  const editorSpeechStartedRef = useRef(false);
  const editorFallbackRef = useRef<number | null>(null);

  const openCodeEditor = useCallback(() => {
    pendingEditorRef.current = false;
    editorSpeechStartedRef.current = false;
    if (editorFallbackRef.current !== null) {
      window.clearTimeout(editorFallbackRef.current);
      editorFallbackRef.current = null;
    }
    setShowCodeEditor(true);
    setActivePanel("code");
    setSidePanelOpen(true);
    setCodeLocked(false);
  }, []);

  const openCodeEditorWhenSpoken = useCallback(() => {
    // No avatar means no speech events to wait for — the fallback TTS path
    // reads the question locally, so open straight away.
    if (!avatarLive) {
      openCodeEditor();
      return;
    }
    pendingEditorRef.current = true;
    editorSpeechStartedRef.current = false;
    if (editorFallbackRef.current !== null) {
      window.clearTimeout(editorFallbackRef.current);
    }
    // If the speech events never arrive, the candidate still needs somewhere
    // to type. 45s comfortably covers reading out a problem statement.
    editorFallbackRef.current = window.setTimeout(() => {
      if (pendingEditorRef.current) openCodeEditor();
    }, 45000);
  }, [avatarLive, openCodeEditor]);

  // Handle WebSocket message
  const handleWebSocketMessage = (data: any) => {
    // Server-pushed control events. With Tavus driving the conversation the
    // question reaches the candidate as speech, so these exist to keep the UI
    // in step — opening the editor when a coding question is asked.
    if (data.type === "coding_question") {
      openCodeEditorWhenSpoken();
      return;
    }

    if (data.type === "coding_closed") {
      // The exercise is over. Leaving the editor up invites a submission
      // against a question nothing is assessing any more — which is how
      // "there is no coding question" ended up recorded as a solution.
      pendingEditorRef.current = false;
      if (editorFallbackRef.current !== null) {
        window.clearTimeout(editorFallbackRef.current);
        editorFallbackRef.current = null;
      }
      setCodeLocked(true);
      setShowCodeEditor(false);
      setActivePanel("transcript");
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
      // Deferred like the question, so the hint is heard before the tab moves
      // under them.
      openCodeEditorWhenSpoken();
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

  // Release a deferred editor open once the interviewer has finished reading
  // the question out. Requires a start *then* a stop — see the refs above.
  useEffect(() => {
    if (!pendingEditorRef.current) return;
    if (interviewerSpeaking) {
      editorSpeechStartedRef.current = true;
      return;
    }
    if (editorSpeechStartedRef.current) {
      openCodeEditor();
    }
  }, [interviewerSpeaking, openCodeEditor]);

  // Clear the fallback timer if the candidate leaves mid-question.
  useEffect(() => {
    return () => {
      if (editorFallbackRef.current !== null) {
        window.clearTimeout(editorFallbackRef.current);
      }
    };
  }, []);
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

      const result = await response.json();

      // The backend rejects a non-attempt ("idk", a stub). Leave the editor
      // open and unlocked so the candidate can actually have a go, rather
      // than stranding them behind a "Submitted" button.
      if (result.status === "empty") {
        setTranscript((prev) => [
          ...prev,
          {
            type: "system",
            text: result.message ?? "Nothing to submit yet.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

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

  // Guards the two buttons and the end-of-interview dialog that all lead
  // here. The backend is idempotent too, but there is no reason to race it.
  const endRequestedRef = useRef(false);

  const endInterviewOnServer = useCallback(async () => {
    const sessionId = sessionStorage.getItem("sessionId");
    if (!sessionId || endRequestedRef.current) return;
    endRequestedRef.current = true;

    try {
      const response = await fetch(apiUrl("/api/interview/end"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
        // The candidate is navigating away; let the request outlive the page.
        keepalive: true,
      });
      if (!response.ok) {
        throw new Error(`End interview failed: ${response.status}`);
      }
    } catch (error) {
      // Allow a retry if this was transient and they exit again.
      endRequestedRef.current = false;
      console.error("Failed to end interview cleanly:", error);
    }
  }, []);

  // The brief wait between clicking "End" and landing on the results page,
  // while the backend tears the call down. Presentation only — it drives the
  // wrapping-up overlay so the screen isn't frozen during the request.
  const [isEnding, setIsEnding] = useState(false);

  // Handle exit interview
  const handleExitInterview = async () => {
    setIsEnding(true);
    await exitFullscreen();
    // Freeze the duration at the moment the interview ends. The results page
    // reports how long the interview took, so it must not keep counting while
    // the candidate sits reading it.
    sessionStorage.setItem(
      "interviewDuration",
      String(Math.floor((Date.now() - startedAtRef.current) / 1000))
    );
    sessionStorage.setItem("interviewCompleted", "true");

    // Tell the backend the interview is over. This is what tears down the
    // Tavus conversation (it keeps consuming credits otherwise), writes the
    // closing into the transcript and queues the report. It returns as soon
    // as that is done - the report itself is generated server-side after the
    // response, so this does not hold the candidate here.
    //
    // Navigation is never blocked on it: a candidate who has finished must
    // not be trapped on the call screen because the backend is unreachable.
    await endInterviewOnServer();

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
    "w-11 h-11 rounded-[9px] flex items-center justify-center transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-night";

  const actionTile =
    tile + " bg-tile border border-tileedge text-[#C6D2D2] hover:bg-[#1D2627]";
  const activeTile = tile + " bg-brand text-white hover:bg-[#12879F]";
  // A device that is off is a state worth noticing, so it reads red.
  const dangerTile =
    tile +
    " bg-[rgba(220,38,38,0.12)] border border-[rgba(220,38,38,0.34)] text-[#F3B4AF] hover:bg-[rgba(220,38,38,0.22)]";

  return (
    <div className="h-screen w-screen overflow-hidden bg-night font-sans">
      {/* Hidden canvas for video processing */}
      <canvas ref={canvasRef} width={640} height={480} className="hidden" />

      {/* Fullscreen warning */}
      {showWarning && (
        <div className="fixed top-5 left-0 right-0 mx-auto w-fit z-50 bg-[#111819] border border-amber-500/40 text-amber-100 px-4 py-2.5 rounded-[11px] shadow-2xl animate-shake flex items-center gap-2.5 max-w-md">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold text-xs">Fullscreen exited</p>
            <p className="text-[10px] mt-0.5 text-amber-200/80">
              This has been recorded ({fullscreenExits} exit
              {fullscreenExits !== 1 ? "s" : ""}).
            </p>
          </div>
          <button
            onClick={() => {
              enterFullscreen();
              setShowWarning(false);
            }}
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors whitespace-nowrap"
          >
            Return
          </button>
        </div>
      )}

      {/* Wrapping-up loader: covers the gap between "End interview" and the
          results page while the backend closes the call and saves everything. */}
      {isEnding && (
        <div className="fixed inset-0 z-[60] bg-[rgba(6,9,10,0.9)] backdrop-blur-[3px] flex items-center justify-center px-6">
          <div className="text-center animate-fadeup">
            <div className="w-12 h-12 rounded-full border-2 border-brand/25 border-t-brand animate-spin mx-auto mb-5" />
            <p className="text-[15px] font-medium tracking-tight text-dtext mb-1.5">
              Wrapping up your interview
            </p>
            <p className="font-mono text-[11px] text-dmute">
              saving transcript · closing the call
            </p>
          </div>
        </div>
      )}

      {/* Exit dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-[rgba(6,9,10,0.78)] backdrop-blur-[3px] z-50 flex items-center justify-center p-4">
          <div className="w-[420px] max-w-full rounded-[14px] border border-[#232C2D] bg-[#111819] p-6 animate-fadeup">
            <h3 className="text-[17px] font-semibold tracking-tight text-dtext mb-2">
              End the interview?
            </h3>
            <p className="text-[13.5px] leading-relaxed text-dsub mb-2">
              Your transcript and code will be submitted as they are now.
            </p>

            {(fullscreenExits > 0 || tabSwitches > 0) && (
              <div className="rounded-[9px] border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.08)] p-3 mb-2">
                <p className="font-mono text-[10px] tracking-[0.07em] uppercase text-[#F1A7A2] mb-1.5">
                  Activity summary
                </p>
                <ul className="text-[11.5px] text-[#E8B5B0] space-y-0.5">
                  {fullscreenExits > 0 && (
                    <li>{fullscreenExits} fullscreen exit{fullscreenExits !== 1 ? "s" : ""}</li>
                  )}
                  {tabSwitches > 0 && (
                    <li>{tabSwitches} tab switch{tabSwitches !== 1 ? "es" : ""}</li>
                  )}
                </ul>
              </div>
            )}

            <p className="font-mono text-[11px] text-dmute mb-5">This cannot be undone.</p>

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowExitDialog(false)}
                className="flex-1 px-3 py-3 rounded-[9px] border border-[#2A3334] bg-[#161E1F] hover:bg-[#1E2728] text-[#D3DDDD] text-[13.5px] font-medium transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={handleExitInterview}
                className="flex-1 px-3 py-3 rounded-[9px] bg-[#B3352B] hover:bg-[#C43B30] text-white text-[13.5px] font-semibold transition-colors"
              >
                End and submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== App shell ===================== */}
      <div className="w-full h-full bg-night text-dtext flex flex-col overflow-hidden">

        {/* ---- Header ---- */}
        <header className="flex items-center justify-between gap-3 px-4 md:px-5 h-[58px] flex-shrink-0 border-b border-edge bg-panel">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              G
            </div>
            <div className="w-px h-5 bg-[#232C2D] flex-shrink-0 hidden sm:block" />
            <div className="min-w-0">
              <h1 className="text-[13px] font-medium tracking-tight text-dtext leading-tight truncate">
                {jobTitle}
              </h1>
              <p className="font-mono text-[10.5px] text-dmute mt-px truncate hidden sm:block">
                Technical interview · {todayLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 flex-shrink-0">
            {/* Dismissing the end-of-interview prompt shouldn't be a dead end —
                this brings it back. */}
            {interviewComplete && !showEndPrompt && (
              <button
                onClick={() => setShowEndPrompt(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] text-[#6FD9B4] text-xs font-medium hover:bg-[rgba(52,211,153,0.2)] transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Interview complete</span>
              </button>
            )}
            <div className="hidden sm:flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-[rgba(220,38,38,0.12)] border border-[rgba(220,38,38,0.3)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-recblink" />
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-[#F1A7A2]">REC</span>
            </div>
            <span className="font-mono text-[15px] font-medium tabular-nums text-dtext">
              {formatClock(elapsed)}
            </span>
          </div>
        </header>

        {/* ---- Body ---- */}
        <div className="flex-1 flex min-h-0 gap-3 px-3 pb-3">

          {/* ============ Stage ============ */}
          <div className="flex-1 flex flex-col min-w-0 gap-3">
            <div className="relative flex-1 min-h-0 rounded-[14px] overflow-hidden bg-stage border border-edge">

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
                <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_50%_42%,#16211F_0%,#0D1213_62%)]">
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative w-[116px] h-[116px] flex items-center justify-center">
                      {(avatar.status === "connecting" || interviewerSpeaking) && (
                        <>
                          <div className="absolute inset-0 rounded-full border-[1.5px] border-brand animate-speakpulse" />
                          <div className="absolute inset-0 rounded-full border-[1.5px] border-brand animate-speakpulse-late" />
                        </>
                      )}
                      <div className="w-[92px] h-[92px] rounded-full bg-gradient-to-br from-[#14808F] to-[#0B5C6E] flex items-center justify-center text-[27px] font-semibold tracking-tight text-[#EAF6F7]">
                        {avatar.status === "connecting" ? (
                          <Loader2 className="w-8 h-8 animate-spin" />
                        ) : (
                          "AI"
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-medium tracking-tight text-dtext mb-2">
                        AI Interviewer
                      </p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(14,116,144,0.14)] border border-[rgba(14,116,144,0.32)]">
                        <span
                          className={
                            "w-1.5 h-1.5 rounded-full " +
                            (avatar.status === "connecting"
                              ? "bg-amber-400 animate-recblink"
                              : "bg-brand-soft")
                          }
                        />
                        <span className="font-mono text-[11px] tracking-[0.03em] text-[#7FC3D1]">
                          {avatar.status === "connecting"
                            ? "connecting — one moment"
                            : "voice-only mode"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recording pill */}
              <div className="absolute top-3.5 left-3.5 flex items-center gap-2 bg-[rgba(8,12,13,0.72)] backdrop-blur-md rounded-lg pl-2.5 pr-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-recblink" />
                <span className="font-mono text-[11px] text-[#9DABAB] tabular-nums">
                  {formatClock(elapsed)} · recording
                </span>
              </div>

              {/* Interviewer name plate */}
              <div className="absolute bottom-[18px] left-[18px] flex items-center gap-2.5 bg-[rgba(8,12,13,0.72)] backdrop-blur-md rounded-lg px-3 py-1.5">
                <span className="text-xs font-medium text-dtext">AI Interviewer</span>
                <span
                  className={
                    "font-mono text-[10.5px] " +
                    (interviewerSpeaking ? "text-[#7FC3D1]" : "text-dmute")
                  }
                >
                  {interviewerSpeaking ? "speaking" : "listening"}
                </span>
                {interviewerSpeaking && (
                  <span className="flex items-end gap-[2.5px] h-[11px]">
                    <span className="w-[2.5px] h-[5px] bg-brand-soft rounded-[2px] animate-pulse" />
                    <span className="w-[2.5px] h-[11px] bg-brand-soft rounded-[2px] animate-pulse" />
                    <span className="w-[2.5px] h-[8px] bg-brand-soft rounded-[2px] animate-pulse" />
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
                  "absolute bottom-4 right-4 w-56 sm:w-64 lg:w-80 aspect-video rounded-[11px] " +
                  "overflow-hidden bg-[#12191A] shadow-2xl ring-1 transition-colors " +
                  (!cameraEnabled
                    ? "ring-red-500/60"
                    : faceStatus === "out_of_frame"
                    ? "ring-amber-400"
                    : candidateSpeaking
                    ? "ring-[#34D399]"
                    : "ring-[#283132]")
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
                  <div className="absolute inset-0 bg-[#12191A] flex flex-col items-center justify-center">
                    <VideoOff className="w-6 h-6 text-[#6E7C7C] mb-1.5" />
                    <p className="font-mono text-[10.5px] text-[#6E7C7C]">camera off</p>
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
                      <Mic className="w-3 h-3 text-[#C6D2D2] flex-shrink-0" />
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
                  "h-11 px-3.5 rounded-[9px] border flex items-center gap-2 text-xs font-medium min-w-0 " +
                  (avatarLive && interviewerSpeaking
                    ? "bg-[rgba(14,116,144,0.14)] border-[rgba(14,116,144,0.32)] text-[#7FC3D1]"
                    : avatarLive && candidateSpeaking
                    ? "bg-[rgba(52,211,153,0.1)] border-[rgba(52,211,153,0.28)] text-[#6FD9B4]"
                    : "bg-tile border-tileedge text-dmute")
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
                  className="h-11 px-5 rounded-[9px] border border-[rgba(220,38,38,0.34)] bg-[rgba(220,38,38,0.1)] hover:bg-[rgba(220,38,38,0.2)] text-[#F3B4AF] flex items-center gap-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-night"
                  title="End interview"
                >
                  <PhoneOff className="w-[18px] h-[18px]" />
                  <span className="hidden sm:inline">End interview</span>
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
            <aside className="hidden md:flex w-[340px] lg:w-[400px] flex-shrink-0 flex-col bg-panel border border-edge rounded-[14px] overflow-hidden">
              <div className="flex items-center gap-2.5 px-[18px] h-12 flex-shrink-0 border-b border-edge">
                <h2 className="text-[13px] font-semibold tracking-tight text-dtext">
                  Live transcript
                </h2>
                <div className="flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-[rgba(52,211,153,0.12)]">
                  <span className="w-[5px] h-[5px] rounded-full bg-[#34D399] animate-recblink" />
                  <span className="font-mono text-[9.5px] tracking-[0.07em] text-[#6FD9B4]">
                    LIVE
                  </span>
                </div>
                <button
                  onClick={() => setSidePanelOpen(false)}
                  className="ml-auto w-7 h-7 rounded-[7px] flex items-center justify-center text-dmute hover:text-dtext hover:bg-tile transition-colors"
                  title="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="mx-[14px] mt-3 mb-2 p-1 bg-editor border border-[#1A2122] rounded-[9px] flex gap-1 flex-shrink-0">
                <button
                  onClick={() => setActivePanel("transcript")}
                  className={
                    "flex-1 py-1.5 rounded-[7px] text-xs font-medium transition-colors " +
                    (activePanel === "transcript"
                      ? "bg-tile text-dtext border border-tileedge"
                      : "text-dmute hover:text-[#C6D2D2]")
                  }
                >
                  Transcript
                </button>
                <button
                  onClick={() => showCodeEditor && setActivePanel("code")}
                  disabled={!showCodeEditor}
                  className={
                    "flex-1 py-1.5 rounded-[7px] text-xs font-medium transition-colors flex items-center justify-center gap-1.5 " +
                    (activePanel === "code"
                      ? "bg-tile text-dtext border border-tileedge"
                      : showCodeEditor
                      ? "text-dmute hover:text-[#C6D2D2]"
                      : "text-[#3E4A4A] cursor-not-allowed")
                  }
                  title={showCodeEditor ? "Code editor" : "Appears when a coding question is asked"}
                >
                  <span className="font-mono text-[11px] text-brand-soft">&lt;/&gt;</span>
                  Code
                  {showCodeEditor && activePanel !== "code" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-soft" />
                  )}
                </button>
              </div>

              {/* ---- Transcript ---- */}
              {activePanel === "transcript" && (
                <div className="flex-1 min-h-0 overflow-y-auto px-[18px] pt-2 pb-6 space-y-[17px]">
                  {transcript.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <div>
                        <div className="w-12 h-12 bg-tile border border-tileedge rounded-full mx-auto mb-3 flex items-center justify-center">
                          <MessageSquareText className="w-5 h-5 text-dmute" />
                        </div>
                        <p className="text-xs font-semibold text-dtext mb-1">
                          {avatar.status === "connecting" ? "Connecting" : "Nothing said yet"}
                        </p>
                        <p className="text-[11px] text-dmute leading-relaxed">
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
                        const dot = isSystem
                          ? "#8A9797"
                          : isYou
                          ? "#8AA39C"
                          : "#3FA8BC";
                        return (
                          <div key={idx} className="flex flex-col gap-[5px] animate-fadeup">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                                style={{ background: dot }}
                              />
                              <span
                                className="font-mono text-[10px] tracking-[0.07em] uppercase"
                                style={{ color: dot }}
                              >
                                {isSystem ? "System" : isYou ? "You" : "Interviewer"}
                              </span>
                              <span className="font-mono text-[10px] text-[#5D6A6A]">
                                {entry.timestamp.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p
                              className={
                                "text-[13px] leading-[1.62] pl-[13px] whitespace-pre-wrap break-words " +
                                (isSystem
                                  ? "text-[#8A9797] italic"
                                  : isYou
                                  ? "text-[#A9B7B7]"
                                  : "text-[#C9D6D6]")
                              }
                            >
                              {entry.text}
                            </p>
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
                <div className="flex-1 min-h-0 flex flex-col px-[14px] pb-[14px]">
                  <div className="flex items-center gap-2 px-1 h-9 flex-shrink-0">
                    <span className="font-mono text-[11px] text-dmute">solution</span>
                    <span className="ml-auto font-mono text-[10px] text-dmute">
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
                      "flex-1 min-h-0 w-full font-mono text-xs leading-[1.65] p-3.5 rounded-[9px] border resize-none focus:outline-none [tab-size:4] " +
                      (codeLocked
                        ? "bg-[#0C1112] text-[#5D6A6A] border-[#1A2122] cursor-not-allowed"
                        : "bg-editor text-[#D2DEDE] border-[#1A2122] focus:border-brand")
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
                    className="w-full mt-3 bg-brand hover:bg-[#12879F] disabled:bg-tile disabled:text-dmute disabled:border disabled:border-tileedge disabled:cursor-not-allowed text-white px-3 py-3 rounded-[9px] text-xs font-semibold transition-colors flex items-center justify-center gap-2"
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
                "w-full px-3 py-3 rounded-[9px] text-xs font-semibold transition-colors flex items-center justify-center gap-2 " +
                (isListening
                  ? "bg-[#B3352B] hover:bg-[#C43B30] text-white"
                  : "bg-brand hover:bg-[#12879F] text-white") +
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
              className="w-full px-3 py-3 rounded-[9px] bg-brand hover:bg-[#12879F] disabled:bg-tile disabled:text-dmute text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,9,10,0.78)] backdrop-blur-[3px] px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-prompt-title"
        >
          <div className="w-[420px] max-w-full rounded-[14px] border border-[#232C2D] bg-[#111819] p-6 animate-fadeup">
            <div className="w-10 h-10 rounded-full bg-[rgba(52,211,153,0.12)] border border-[rgba(52,211,153,0.3)] flex items-center justify-center mb-4">
              <CheckCircle className="w-5 h-5 text-[#6FD9B4]" />
            </div>

            <h2
              id="end-prompt-title"
              className="text-[17px] font-semibold tracking-tight text-dtext"
            >
              That's the end of the interview
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-dsub">
              Ending it now closes the call and takes you to your summary. If you
              still have a question for the interviewer, you can ask it first.
            </p>

            <button
              onClick={handleExitInterview}
              autoFocus
              className="w-full mt-5 bg-brand hover:bg-[#12879F] text-white px-4 py-3 rounded-[9px] text-[13.5px] font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <PhoneOff className="w-4 h-4" />
              End interview
            </button>
            <button
              onClick={() => setShowEndPrompt(false)}
              className="w-full mt-2 text-dsub hover:text-dtext px-4 py-2.5 rounded-[9px] text-[13.5px] font-medium transition-colors"
            >
              Not yet — I have a question
            </button>
          </div>
        </div>
      )}

      <style>{`
        .overflow-y-auto::-webkit-scrollbar { width: 6px; }
        .overflow-y-auto::-webkit-scrollbar-track { background: transparent; }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: #232C2D;
          border-radius: 3px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover { background: #33403F; }

        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .animate-pulse, .animate-spin,
          .animate-speakpulse, .animate-speakpulse-late, .animate-recblink {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InterviewPage;
