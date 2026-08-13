// src/pages/LandingPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  convertPdfToBase64,
  formatJobDescription,
  initializeSession,
  storeSessionData
} from "../utils/api.utils";
import FlowHeader from "../components/FlowHeader";

const JOB_TYPES = [
  {
    id: "frontend",
    title: "Frontend Developer",
    description:
      "Build responsive user interfaces using React, Vue, or Angular. Create seamless experiences with clean, maintainable code.",
    skills: ["React", "TypeScript", "CSS", "JavaScript"],
    level: "Mid-Senior",
  },
  {
    id: "backend",
    title: "Backend Developer",
    description:
      "Design server-side logic, databases, and APIs. Build scalable and secure backend systems with modern technologies.",
    skills: ["Node.js", "Python", "SQL", "REST APIs"],
    level: "Mid-Senior",
  },
  {
    id: "fullstack",
    title: "Full Stack Developer",
    description:
      "Work on both frontend and backend. Build complete web applications from database to user interface.",
    skills: ["React", "Node.js", "MongoDB", "TypeScript"],
    level: "Senior",
  },
  {
    id: "devops",
    title: "DevOps Engineer",
    description:
      "Manage CI/CD pipelines, cloud infrastructure, and deployment automation. Ensure system reliability and scalability.",
    skills: ["AWS", "Docker", "Kubernetes", "Jenkins"],
    level: "Mid-Senior",
  },
  {
    id: "uiux",
    title: "UI/UX Designer",
    description:
      "Create beautiful, intuitive interfaces. Design wireframes, prototypes, and high-fidelity mockups.",
    skills: ["Figma", "Adobe XD", "Prototyping", "Design Systems"],
    level: "Mid",
  },
];

function LandingPage() {
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canProceed = selectedFile !== null && selectedJobType !== "";
  const selectedJob = JOB_TYPES.find((job) => job.id === selectedJobType);

  // File handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const handleFile = (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }
    setSelectedFile(file);
  };

  // Drag-n-drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError("");
  };

  const handleProceed = async () => {
    if (!canProceed) return;

    setIsLoading(true);
    setError("");

    try {
      // Convert PDF to base64
      const resumeBase64 = await convertPdfToBase64(selectedFile!);

      // Format job description
      const jobDescription = formatJobDescription(selectedJob!);

      // Initialize session via API
      // The backend reads the candidate's name off the resume it receives.
      const response = await initializeSession({
        resume_base64: resumeBase64,
        job_description: jobDescription,
        job_role: selectedJob!.title
      });

      // Store session data
      storeSessionData({
        resumeFileName: selectedFile!.name,
        selectedJobType: selectedJobType,
        jobTitle: selectedJob!.title,
        candidateName: response.candidate_name,
        candidateFirstName: response.candidate_first_name,
        sessionId: response.session_id,
        avatarUrl: response.avatar_url,
        avatarConversationId: response.avatar_conversation_id
      });

      // Navigate to interview
      navigate("/interview");
    } catch (err) {
      console.error("Error initializing session:", err);
      setError(err instanceof Error ? err.message : "Failed to initialize interview session. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const readyHint =
    !selectedFile && !selectedJobType
      ? "Attach a resume and pick a role to continue."
      : !selectedFile
      ? "Attach your resume to continue."
      : !selectedJobType
      ? "Pick a role to continue."
      : `${selectedJob!.title} · adaptive questions · starts immediately`;

  const resumeExt = selectedFile
    ? (selectedFile.name.split(".").pop() || "pdf").toUpperCase().slice(0, 4)
    : "";
  const resumeSize = selectedFile
    ? selectedFile.size / 1024 > 1024
      ? (selectedFile.size / 1024 / 1024).toFixed(1) + " MB"
      : Math.max(1, Math.round(selectedFile.size / 1024)) + " KB"
    : "";

  return (
    <div className="min-h-screen sheet text-ink flex flex-col">
      <FlowHeader step={2} />

      {/* Session-init loader. Resume analysis is a real Claude round trip, so
          this can take a while — say so instead of leaving a frozen button. */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-paper/95 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-[440px] max-w-full border-2 border-ink bg-card p-8 animate-fadeup">
            <div className="flex items-center gap-2.5 mb-5">
              <span className="w-2 h-2 bg-signal animate-recblink" />
              <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-inksub">
                Processing
              </span>
            </div>
            <h2 className="font-display font-extrabold text-[26px] tracking-title leading-none mb-3">
              Preparing your interview
            </h2>
            <p className="text-[14px] leading-relaxed text-inksub mb-5">
              We're reading your resume and briefing your interviewer on
              {" "}{selectedJob?.title ?? "the role"}. This usually takes under a
              minute — please keep this tab open.
            </p>
            <div className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-inkfaint border-t border-rule pt-3">
              analyzing resume · building question plan · starting avatar
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-[1240px] w-full mx-auto px-5 md:px-10 py-8 md:py-12 flex flex-col gap-9">

        {/* ---- Heading + resume ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-12 items-start">
          <div className="reveal" style={{ "--d": "0s" } as React.CSSProperties}>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-2 h-2 bg-signal" />
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-inksub">
                Fig. 2 — Role &amp; resume
              </span>
            </div>
            <h1 className="font-display font-extrabold text-[38px] md:text-[46px] leading-[1.02] tracking-hero">
              Choose a role,<br />attach your resume
            </h1>
            <span className="redline w-24 mt-5" />
            <p className="text-[15px] leading-relaxed text-inksub max-w-[56ch] mt-4">
              The interviewer adapts its questions to the role you pick and the
              experience on your resume.
            </p>

            {error && (
              <div className="mt-5 flex items-center gap-3 px-4 py-3 border-2 border-alarm bg-card">
                <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-alarm flex-shrink-0">
                  Err
                </span>
                <p className="text-[13.5px] text-ink">{error}</p>
              </div>
            )}
          </div>

          {/* Resume card */}
          <div
            className="reveal border-2 border-ink bg-card p-5"
            style={{ "--d": "0.1s" } as React.CSSProperties}
          >
            <div className="text-[13px] font-semibold mb-3.5">
              Resume
            </div>

            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label
                  className={
                    "flex flex-col items-center gap-2 px-4 py-7 border-2 border-dashed cursor-pointer text-center transition-colors " +
                    (isDragging
                      ? "border-signal bg-paper"
                      : "border-inkfaint bg-card hover:border-signal hover:bg-paper")
                  }
                >
                  <span className="font-mono text-[15px] text-signal leading-none">↑</span>
                  <div className="text-[13.5px] font-medium">
                    Drop your resume or browse
                  </div>
                  <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inkfaint">
                    PDF · max 10 MB
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3.5 py-3 border-2 border-ink bg-paper">
                <div className="w-9 h-9 flex-shrink-0 bg-ink text-paper flex items-center justify-center font-mono text-[9px]">
                  {resumeExt}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">
                    {selectedFile.name}
                  </div>
                  <div className="font-mono text-[9.5px] tracking-[0.06em] uppercase text-inksub mt-1">
                    {resumeSize} · attached
                  </div>
                </div>
                <button
                  onClick={removeFile}
                  title="Remove resume"
                  className="flex-shrink-0 w-[26px] h-[26px] border border-rule bg-card text-inksub text-[13px] leading-none cursor-pointer hover:text-signal hover:border-signal transition-colors"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="text-[12.5px] leading-relaxed text-inkfaint mt-3.5">
              Used only to tailor this interview. Not shared beyond the hiring
              team for this role.
            </div>
          </div>
        </div>

        {/* ---- Roles ---- */}
        <div className="reveal" style={{ "--d": "0.18s" } as React.CSSProperties}>
          <div className="flex items-baseline justify-between mb-4 border-b-2 border-ink pb-2">
            <div className="font-display font-bold text-[20px] tracking-sub">
              Open roles
            </div>
            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-inksub">
              {JOB_TYPES.length} available
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {JOB_TYPES.map((role, i) => {
              const selected = selectedJobType === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedJobType(role.id)}
                  role="button"
                  aria-pressed={selected}
                  className={
                    "relative px-5 pt-[18px] pb-4 cursor-pointer bg-card border-2 transition-[transform,border-color,background] duration-[180ms] ease-out hover:-translate-y-[3px] " +
                    (selected
                      ? "border-signal"
                      : "border-rule hover:border-inksub")
                  }
                >
                  {selected && (
                    <span className="absolute -top-[9px] left-4 px-1.5 bg-signal font-mono text-[8.5px] tracking-[0.12em] uppercase text-black leading-4">
                      Selected
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2.5 mb-1">
                    <div className="text-[14.5px] font-semibold tracking-[-0.012em] leading-tight">
                      {role.title}
                    </div>
                    <span className="font-mono text-[9px] text-inkfaint flex-shrink-0 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inksub mb-3.5">
                    {role.level}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3.5">
                    {role.skills.map((skill) => (
                      <div
                        key={skill}
                        className="px-2 py-[3px] border border-rule font-mono text-[9px] text-inksub"
                      >
                        {skill}
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-rule text-[12px] leading-relaxed text-inksub line-clamp-2">
                    {role.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Footer CTA ---- */}
        <div
          className="reveal flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t-2 border-ink pt-5 pb-4"
          style={{ "--d": "0.26s" } as React.CSSProperties}
        >
          <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-inksub">
            {readyHint}
          </div>
          <button
            onClick={handleProceed}
            disabled={!canProceed || isLoading}
            className={
              "px-8 py-4 text-[14.5px] font-semibold tracking-[-0.005em] transition-colors flex items-center justify-center gap-2 " +
              (canProceed && !isLoading
                ? "bg-signal hover:bg-signal-dark text-black cursor-pointer border-2 border-signal"
                : "bg-transparent text-inkfaint border-2 border-rule cursor-not-allowed")
            }
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? "Preparing…" : "Start interview →"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
