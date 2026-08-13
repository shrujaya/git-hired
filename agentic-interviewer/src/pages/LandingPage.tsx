// src/pages/LandingPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  convertPdfToBase64,
  formatJobDescription,
  initializeSession,
  extractJobDescriptionFromPdf,
  storeSessionData
} from "../utils/api.utils";
import FlowHeader from "../components/FlowHeader";
import { useFullscreen } from "../hooks/useFullscreen";

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

// The sixth option is not a role, it is a way to supply one. Kept out of
// JOB_TYPES so nothing that iterates the real roles has to special-case it.
const CUSTOM_ROLE_ID = "custom";

// Enough text to actually brief an interviewer. A one-line "backend dev"
// produces questions no better than picking a listed role would.
const MIN_JD_CHARS = 120;

function LandingPage() {
  const navigate = useNavigate();
  const { enterFullscreen } = useFullscreen();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedJobType, setSelectedJobType] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Custom role: the candidate supplies the job description themselves.
  const [customTitle, setCustomTitle] = useState("");
  const [customJd, setCustomJd] = useState("");
  const [jdFileName, setJdFileName] = useState("");
  const [isReadingJd, setIsReadingJd] = useState(false);
  const [jdError, setJdError] = useState("");

  const isCustom = selectedJobType === CUSTOM_ROLE_ID;
  const selectedJob = JOB_TYPES.find((job) => job.id === selectedJobType);
  const customReady =
    customTitle.trim().length > 1 && customJd.trim().length >= MIN_JD_CHARS;

  const canProceed =
    selectedFile !== null &&
    selectedJobType !== "" &&
    (isCustom ? customReady : true);

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

  // Attached job description. Plain text is read here; a PDF goes to the
  // backend, which already reads PDFs for resumes — the browser has no PDF
  // parser and shipping one would grow a bundle that is already oversized.
  // Either way the text lands in the box so it can be checked and edited
  // before the interview is built from it.
  const handleJdFile = async (file: File | undefined) => {
    if (!file) return;
    setJdError("");

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isText = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith("text/");
    if (!isPdf && !isText) {
      setJdError("Attach a PDF or a text file, or paste the description below.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setJdError("File size must be less than 10MB");
      return;
    }

    setIsReadingJd(true);
    try {
      const text = isPdf
        ? await extractJobDescriptionFromPdf(await convertPdfToBase64(file))
        : await file.text();

      if (!text.trim()) {
        setJdError("That file looks empty. Paste the description instead.");
        return;
      }
      setCustomJd(text.trim());
      setJdFileName(file.name);
    } catch (err) {
      console.error("Could not read job description:", err);
      setJdError(
        err instanceof Error ? err.message : "Could not read that file. Paste the text instead."
      );
    } finally {
      setIsReadingJd(false);
    }
  };

  const handleProceed = async () => {
    if (!canProceed) return;

    // Go fullscreen here, on the click itself, and not on the interview
    // page's mount. requestFullscreen() needs transient user activation:
    // this click is the last one before the interview starts, and the
    // activation does not survive the awaits below, let alone a route
    // change. Fullscreen is document-scoped, so it carries into /interview.
    // Deliberately not awaited — a browser that refuses must not stop the
    // interview from starting.
    void enterFullscreen();

    setIsLoading(true);
    setError("");

    try {
      // Convert PDF to base64
      const resumeBase64 = await convertPdfToBase64(selectedFile!);

      // Format job description. A custom role is already a job description —
      // it goes through as written rather than being rebuilt from a template.
      const jobTitle = isCustom ? customTitle.trim() : selectedJob!.title;
      const jobDescription = isCustom
        ? customJd.trim()
        : formatJobDescription(selectedJob!);

      // Initialize session via API
      // The backend reads the candidate's name off the resume it receives.
      const response = await initializeSession({
        resume_base64: resumeBase64,
        job_description: jobDescription,
        job_role: jobTitle
      });

      // Store session data
      storeSessionData({
        resumeFileName: selectedFile!.name,
        selectedJobType: selectedJobType,
        jobTitle: jobTitle,
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
      : isCustom && !customTitle.trim()
      ? "Name the role you are applying for."
      : isCustom && customJd.trim().length < MIN_JD_CHARS
      ? `Paste or attach the job description — minimum ${MIN_JD_CHARS} characters.`
      : `${isCustom ? customTitle.trim() : selectedJob!.title} · adaptive questions · starts immediately`;

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
              {JOB_TYPES.length} available · or bring your own
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

            {/* 06 — bring your own role */}
            <div
              onClick={() => setSelectedJobType(CUSTOM_ROLE_ID)}
              role="button"
              aria-pressed={isCustom}
              className={
                "relative px-5 pt-[18px] pb-4 cursor-pointer bg-card border-2 border-dashed transition-[transform,border-color,background] duration-[180ms] ease-out hover:-translate-y-[3px] " +
                (isCustom ? "border-signal" : "border-rule hover:border-inksub")
              }
            >
              {isCustom && (
                <span className="absolute -top-[9px] left-4 px-1.5 bg-signal font-mono text-[8.5px] tracking-[0.12em] uppercase text-black leading-4">
                  Selected
                </span>
              )}
              <div className="flex items-start justify-between gap-2.5 mb-1">
                <div className="text-[14.5px] font-semibold tracking-[-0.012em] leading-tight">
                  Something else
                </div>
                <span className="font-mono text-[9px] text-inkfaint flex-shrink-0 mt-0.5">
                  {String(JOB_TYPES.length + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inksub mb-3.5">
                Your own description
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3.5">
                {["Paste", "Attach PDF", "Attach text"].map((chip) => (
                  <div
                    key={chip}
                    className="px-2 py-[3px] border border-dashed border-rule font-mono text-[9px] text-inksub"
                  >
                    {chip}
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-rule text-[12px] leading-relaxed text-inksub line-clamp-2">
                Applying for a role that is not listed? Give us the job
                description and the questions are built from it.
              </div>
            </div>
          </div>

          {/* Custom role editor — only once that card is chosen */}
          {isCustom && (
            <div className="border-2 border-ink bg-card p-5 mt-4 animate-fadeup">
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <div className="text-[13px] font-semibold">The role you are applying for</div>
                <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-inkfaint">
                  Fig. 2a
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 mb-2">
                <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-inksub">
                  Role title
                </label>
                <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-inkfaint">
                  Required
                </span>
              </div>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="e.g. Machine Learning Engineer"
                className="w-full px-3.5 py-2.5 bg-paper border-2 border-rule focus:border-signal focus:outline-none text-[13.5px] text-ink placeholder:text-inkfaint transition-colors"
              />
              {/* Said here, next to the empty field, and not only in the hint
                  under the Start button — a description long enough to start
                  with and a blank title looks like the button is broken. */}
              {customJd.trim().length >= MIN_JD_CHARS && !customTitle.trim() && (
                <p className="text-[12px] text-inksub mt-2">
                  Name the role to start — the description alone does not say
                  what you are interviewing for.
                </p>
              )}

              <div className="flex items-baseline justify-between gap-3 mt-5 mb-2">
                <label className="font-mono text-[9px] tracking-[0.14em] uppercase text-inksub">
                  Job description
                </label>
                <label
                  className={
                    "font-mono text-[9px] tracking-[0.12em] uppercase px-2.5 py-1.5 border cursor-pointer transition-colors " +
                    (isReadingJd
                      ? "border-rule text-inkfaint cursor-wait"
                      : "border-rule text-inksub hover:border-signal hover:text-signal")
                  }
                >
                  {isReadingJd ? "Reading…" : "↑ Attach a file"}
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf"
                    disabled={isReadingJd}
                    onChange={(e) => {
                      handleJdFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                value={customJd}
                onChange={(e) => setCustomJd(e.target.value)}
                rows={8}
                placeholder="Paste the job description here — responsibilities, requirements, the stack. The more specific it is, the more specific your questions will be."
                className="w-full px-3.5 py-3 bg-paper border-2 border-rule focus:border-signal focus:outline-none text-[13px] leading-relaxed text-ink placeholder:text-inkfaint resize-y transition-colors"
              />

              {jdError && (
                <div className="flex items-center gap-3 px-3.5 py-2.5 border-2 border-alarm bg-paper mt-3">
                  <span className="font-mono text-[9.5px] tracking-[0.1em] uppercase text-alarm flex-shrink-0">
                    Err
                  </span>
                  <p className="flex-1 text-[12.5px] text-ink">{jdError}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <div className="font-mono text-[9.5px] tracking-[0.08em] uppercase text-inkfaint">
                  {jdFileName ? `Read from ${jdFileName} · editable` : "Paste, or attach a file"}
                </div>
                {/* 120 is a floor, not a ceiling — there is no maximum. Read
                    as "X / 120" it looked like a cap being exceeded. */}
                <div
                  className={
                    "font-mono text-[9.5px] tracking-[0.08em] uppercase " +
                    (customJd.trim().length >= MIN_JD_CHARS ? "text-signal" : "text-inkfaint")
                  }
                >
                  {customJd.trim().length >= MIN_JD_CHARS
                    ? `${customJd.trim().length.toLocaleString()} characters`
                    : `Minimum ${MIN_JD_CHARS} characters`}
                </div>
              </div>
            </div>
          )}
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
