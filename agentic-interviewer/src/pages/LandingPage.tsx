// src/pages/LandingPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  CheckCircle,
  ArrowRight,
  Briefcase,
  Code,
  Palette,
  Database,
  Cpu,
  Cloud,
  X
} from "lucide-react";

// Keep your JOB_TYPES as before (shortened here for brevity)
const JOB_TYPES = [
  {
    id: "frontend",
    title: "Frontend Developer",
    icon: Code,
    description:
      "Build responsive user interfaces using React, Vue, or Angular. Create seamless experiences with clean, maintainable code.",
    skills: ["React", "TypeScript", "CSS", "JavaScript"],
    level: "Mid-Senior",
  },
  {
    id: "backend",
    title: "Backend Developer",
    icon: Database,
    description:
      "Design server-side logic, databases, and APIs. Build scalable and secure backend systems with modern technologies.",
    skills: ["Node.js", "Python", "SQL", "REST APIs"],
    level: "Mid-Senior",
  },
  {
    id: "fullstack",
    title: "Full Stack Developer",
    icon: Cpu,
    description:
      "Work on both frontend and backend. Build complete web applications from database to user interface.",
    skills: ["React", "Node.js", "MongoDB", "TypeScript"],
    level: "Senior",
  },
  {
    id: "devops",
    title: "DevOps Engineer",
    icon: Cloud,
    description:
      "Manage CI/CD pipelines, cloud infrastructure, and deployment automation. Ensure system reliability and scalability.",
    skills: ["AWS", "Docker", "Kubernetes", "Jenkins"],
    level: "Mid-Senior",
  },
  {
    id: "uiux",
    title: "UI/UX Designer",
    icon: Palette,
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

  const handleProceed = () => {
    if (canProceed) {
      localStorage.setItem("resumeFileName", selectedFile!.name);
      localStorage.setItem("selectedJobType", selectedJobType);
      localStorage.setItem("jobTitle", selectedJob!.title);
      navigate("/interview");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">AI Tech Interviewer</h1>
            <p className="text-xs text-gray-600">Powered by Claude AI</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs">Ready</span>
          </div>
        </div>
      </header>

      {/* Main content area - compact layout */}
      <main className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-6xl">
          <div className="text-center mb-4">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Welcome to Get-Hired AI Interview</h2>
            <p className="text-sm text-gray-600">Upload your resume and select your position to begin</p>
          </div>

          {/* Grid: left (upload + selector) and right (job description) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-3">
              {/* Resume Card (compact) */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center">
                    <FileText className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Upload Resume</h3>
                    <p className="text-xs text-gray-500">PDF, max 10MB</p>
                  </div>
                </div>

                {!selectedFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-md p-3 text-center transition-all cursor-pointer ${isDragging ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}
                  >
                    <input type="file" accept=".pdf" onChange={handleFileChange} id="resume-upload" className="hidden" />
                    <label htmlFor="resume-upload" className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-900">Drop your resume here</p>
                      <p className="text-xs text-gray-500">or click to browse</p>
                      <div className="inline-block mt-2 bg-indigo-600 text-white px-3 py-1 rounded text-sm">Choose File</div>
                    </label>
                  </div>
                ) : (
                  <div className="border rounded-md p-2 bg-green-50 border-green-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-green-100 rounded flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
                        <p className="text-xs text-gray-600">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Uploaded</span>
                      <button onClick={removeFile} className="text-gray-400 hover:text-red-600 p-1 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              </div>

              {/* Job selector (compact) */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Select Position</h3>
                    <p className="text-xs text-gray-500">Choose your role</p>
                  </div>
                </div>

                <select
                  value={selectedJobType}
                  onChange={(e) => setSelectedJobType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-1 focus:ring-indigo-200 outline-none"
                >
                  <option value="">Select a position...</option>
                  {JOB_TYPES.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>

                {selectedJobType && <div className="mt-2 text-xs text-green-700 bg-green-50 px-2 py-1 rounded inline-flex items-center gap-2"><CheckCircle className="w-3 h-3" /> Position selected</div>}
              </div>
            </div>

            {/* Right column - compact job description (no scroll, clamp text) */}
            <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm flex flex-col">
              {selectedJob ? (
                <>
                  <div className="flex items-start gap-3 pb-2 border-b border-gray-100">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded flex items-center justify-center">
                      <selectedJob.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-gray-900 leading-tight">{selectedJob.title}</h3>
                      <div className="text-xs text-indigo-600 mt-1">{selectedJob.level}</div>
                    </div>
                  </div>

                  {/* compact summary - clamp lines so panel doesn't grow */}
                  <div className="mt-2 text-sm text-gray-700" style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 4, /* show up to 4 lines */
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>
                    {selectedJob.description}
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-900 uppercase mb-1">Key Skills</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedJob.skills.map((s) => (
                        <span key={s} className="text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200">{s}</span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 bg-indigo-50 p-2 rounded border border-indigo-100 text-xs">
                    <div className="font-semibold text-gray-800 mb-1">Interview Focus</div>
                    <ul className="space-y-1">
                      <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-indigo-600" /><span>Technical questions based on resume</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-indigo-600" /><span>Coding challenges for the role</span></li>
                      <li className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-indigo-600" /><span>Problem-solving scenarios</span></li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center py-8">
                  <div className="text-center">
                    <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Job Description</h3>
                    <p className="text-xs text-gray-500">Choose a job type to view details</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CTA in normal flow below grid (not fixed) */}
          <div className="mt-6 flex flex-col items-center">
            <button
              onClick={handleProceed}
              disabled={!canProceed}
              className={`px-8 py-2 rounded-lg font-semibold transition ${canProceed ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
            >
              <span className="flex items-center gap-2">
                Start Interview
                <ArrowRight className="w-4 h-4" />
              </span>
            </button>
            {!canProceed && <p className="text-xs text-gray-500 mt-2">Upload resume and select position to continue</p>}
          </div>
        </div>
      </main>
    </div>
  );
}

export default LandingPage;
