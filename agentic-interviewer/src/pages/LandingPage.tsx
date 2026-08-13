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
    <div className="min-h-screen bg-mist text-ink flex flex-col">
      <FlowHeader step={2} />

      {/* Session-init loader. Resume analysis is a real Claude round trip, so
          this can take a while — say so instead of leaving a frozen button. */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-[rgba(245,247,247,0.92)] backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-[420px] max-w-full rounded-[14px] border border-line bg-white p-8 text-center animate-fadeup">
            <div className="w-12 h-12 rounded-full border-2 border-brand/20 border-t-brand animate-spin mx-auto mb-5" />
            <h2 className="text-lg font-semibold tracking-tight mb-2">
              Preparing your interview
            </h2>
            <p className="text-[13.5px] leading-relaxed text-muted mb-4">
              We're reading your resume and briefing your interviewer on
              {" "}{selectedJob?.title ?? "the role"}. This usually takes under a
              minute — please keep this tab open.
            </p>
            <div className="font-mono text-[11px] text-faint">
              analyzing resume · building question plan · starting avatar
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 max-w-[1240px] w-full mx-auto px-5 md:px-10 py-8 md:py-12 flex flex-col gap-8">

        {/* ---- Heading + resume ---- */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8 lg:gap-12 items-start">
          <div>
            <div className="font-mono text-[11px] tracking-[0.09em] uppercase text-brand mb-3">
              Step 2 of 3
            </div>
            <h1 className="text-[26px] md:text-[34px] leading-[1.15] tracking-tight font-semibold mb-2.5">
              Choose a role and attach your resume
            </h1>
            <p className="text-[15px] leading-relaxed text-muted max-w-[56ch]">
              The interviewer adapts its questions to the role you pick and the
              experience on your resume.
            </p>

            {error && (
              <div className="mt-4 px-4 py-3 rounded-[11px] border border-[#E8CFCC] bg-[#FBF3F2]">
                <p className="text-[13px] text-[#8C3B33] font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Resume card */}
          <div className="border border-line rounded-xl bg-white p-5">
            <div className="text-[13px] font-semibold mb-3.5">Resume</div>

            {!selectedFile ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label
                  className={
                    "flex flex-col items-center gap-2 px-4 py-6 border border-dashed rounded-[10px] cursor-pointer text-center transition-colors " +
                    (isDragging
                      ? "border-brand bg-[#F5FAFB]"
                      : "border-[#C9D3D3] bg-[#FBFDFD] hover:border-brand hover:bg-[#F5FAFB]")
                  }
                >
                  <div className="w-[30px] h-[30px] rounded-lg bg-[#EAF1F2] flex items-center justify-center text-brand text-[15px]">
                    ↑
                  </div>
                  <div className="text-[13.5px] font-medium">
                    Drop your resume or browse
                  </div>
                  <div className="font-mono text-[11px] text-[#7A8584]">
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
              <div className="flex items-center gap-3 px-3.5 py-3 border border-brand-washline rounded-[10px] bg-[#F3F9FA]">
                <div className="w-8 h-8 flex-shrink-0 rounded-[7px] bg-brand text-white flex items-center justify-center font-mono text-[10px] font-medium">
                  {resumeExt}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">
                    {selectedFile.name}
                  </div>
                  <div className="font-mono text-[11px] text-muted mt-0.5">
                    {resumeSize} · attached
                  </div>
                </div>
                <button
                  onClick={removeFile}
                  title="Remove resume"
                  className="flex-shrink-0 w-[26px] h-[26px] rounded-[7px] border border-brand-washline bg-white text-muted text-[13px] leading-none cursor-pointer hover:text-[#B4342A] hover:border-[#E8CFCC] transition-colors"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="text-[12.5px] leading-relaxed text-faint mt-3.5">
              Used only to tailor this interview. Not shared beyond the hiring
              team for this role.
            </div>
          </div>
        </div>

        {/* ---- Roles ---- */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <div className="text-[15px] font-semibold tracking-tight">Open roles</div>
            <div className="font-mono text-[11.5px] text-faint">
              {JOB_TYPES.length} available
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {JOB_TYPES.map((role) => {
              const selected = selectedJobType === role.id;
              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedJobType(role.id)}
                  role="button"
                  aria-pressed={selected}
                  className={
                    "relative px-5 pt-[19px] pb-[17px] rounded-xl cursor-pointer bg-white border transition-colors " +
                    (selected
                      ? "border-brand shadow-[0_0_0_3px_rgba(14,116,144,0.13)]"
                      : "border-line hover:border-[#B6C6C8]")
                  }
                >
                  <div className="flex items-start justify-between gap-2.5 mb-3">
                    <div className="text-[14.5px] font-semibold tracking-tight leading-tight">
                      {role.title}
                    </div>
                    {selected && (
                      <div className="flex-shrink-0 w-[18px] h-[18px] rounded-full bg-brand flex items-center justify-center">
                        <div className="w-2 h-1 border-l-[1.6px] border-b-[1.6px] border-white -rotate-45 -translate-y-[1px]" />
                      </div>
                    )}
                  </div>
                  <div className="text-[12.5px] text-muted mb-3.5">{role.level}</div>
                  <div className="flex flex-wrap gap-1.5 mb-[15px]">
                    {role.skills.map((skill) => (
                      <div
                        key={skill}
                        className="px-2 py-1 rounded-md bg-[#F1F5F5] font-mono text-[10.5px] text-[#46595C]"
                      >
                        {skill}
                      </div>
                    ))}
                  </div>
                  <div className="pt-[13px] border-t border-hairline font-mono text-[11px] text-faint line-clamp-2">
                    {role.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Footer CTA ---- */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1.5 pb-4">
          <div className="text-[13px] text-faint">{readyHint}</div>
          <button
            onClick={handleProceed}
            disabled={!canProceed || isLoading}
            className={
              "px-6 py-3.5 rounded-[10px] text-[14.5px] font-semibold transition-colors flex items-center justify-center gap-2 " +
              (canProceed && !isLoading
                ? "bg-brand hover:bg-brand-deep text-white cursor-pointer"
                : "bg-[#F1F4F4] text-[#A3ADAC] border border-line cursor-not-allowed")
            }
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isLoading ? "Preparing…" : "Start interview"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
