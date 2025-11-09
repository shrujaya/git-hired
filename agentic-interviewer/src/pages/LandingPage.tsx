// src/pages/LandingPage.tsx - COMPACT VERSION
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
  X,
  Sparkles,
  Zap,
  Target,
  Loader2,
} from "lucide-react";
import { 
  convertPdfToBase64, 
  formatJobDescription, 
  initializeSession,
  storeSessionData 
} from "../utils/api.utils";

const JOB_TYPES = [
  {
    id: "frontend",
    title: "Frontend Developer",
    icon: Code,
    description:
      "Build responsive user interfaces using React, Vue, or Angular. Create seamless experiences with clean, maintainable code.",
    skills: ["React", "TypeScript", "CSS", "JavaScript"],
    level: "Mid-Senior",
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "backend",
    title: "Backend Developer",
    icon: Database,
    description:
      "Design server-side logic, databases, and APIs. Build scalable and secure backend systems with modern technologies.",
    skills: ["Node.js", "Python", "SQL", "REST APIs"],
    level: "Mid-Senior",
    color: "from-blue-600 to-indigo-600"
  },
  {
    id: "fullstack",
    title: "Full Stack Developer",
    icon: Cpu,
    description:
      "Work on both frontend and backend. Build complete web applications from database to user interface.",
    skills: ["React", "Node.js", "MongoDB", "TypeScript"],
    level: "Senior",
    color: "from-cyan-500 to-blue-600"
  },
  {
    id: "devops",
    title: "DevOps Engineer",
    icon: Cloud,
    description:
      "Manage CI/CD pipelines, cloud infrastructure, and deployment automation. Ensure system reliability and scalability.",
    skills: ["AWS", "Docker", "Kubernetes", "Jenkins"],
    level: "Mid-Senior",
    color: "from-blue-500 to-teal-500"
  },
  {
    id: "uiux",
    title: "UI/UX Designer",
    icon: Palette,
    description:
      "Create beautiful, intuitive interfaces. Design wireframes, prototypes, and high-fidelity mockups.",
    skills: ["Figma", "Adobe XD", "Prototyping", "Design Systems"],
    level: "Mid",
    color: "from-cyan-400 to-blue-500"
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
      const response = await initializeSession({
        resume_base64: resumeBase64,
        job_description: jobDescription,
        candidate_name: "Nikhil",
        job_role: selectedJob!.title
      });

      // Store session data
      storeSessionData({
        resumeFileName: selectedFile!.name,
        selectedJobType: selectedJobType,
        jobTitle: selectedJob!.title,
        candidateName: "Nikhil",
        sessionId: response.session_id,
        avatarUrl: response.avatar_url
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 flex flex-col relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-cyan-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-teal-400/20 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      {/* Header - More Compact */}
      <header className="relative z-10 bg-white/80 backdrop-blur-md border-b border-blue-100 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  Git Hired
                </h1>
                <p className="text-[10px] text-gray-600 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5 text-yellow-500" />
                  Powered by Claude AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
              <span className="text-xs font-medium text-green-700">System Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content area - Super Compact */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-2 overflow-hidden">
        <div className="w-full max-w-7xl">
          {/* Hero Section - Ultra Compact */}
          <div className="text-center mb-2.5">
            <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold mb-1.5">
              <Target className="w-2.5 h-2.5" />
              Get Hired Faster with AI
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1 leading-tight">
              Welcome to Your <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">AI Interview</span>
            </h2>
            <p className="text-xs text-gray-600">
              Upload your resume and select your dream position to start your personalized AI-powered interview
            </p>
          </div>

          {/* Main Grid - More Compact */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-2.5">
            {/* Left Column */}
            <div className="space-y-2.5">
              {/* Resume Upload Card - Compact */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Upload Your Resume</h3>
                    <p className="text-[10px] text-gray-500">PDF format, maximum 10MB</p>
                  </div>
                </div>

                {!selectedFile ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer group ${
                      isDragging 
                        ? "border-blue-500 bg-blue-50 scale-105" 
                        : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".pdf" 
                      onChange={handleFileChange} 
                      id="resume-upload" 
                      className="hidden" 
                    />
                    <label htmlFor="resume-upload" className="cursor-pointer">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl flex items-center justify-center mx-auto mb-1.5 group-hover:scale-110 transition-transform">
                        <Upload className="w-5 h-5 text-blue-600" />
                      </div>
                      <p className="text-xs font-semibold text-gray-900 mb-0.5">
                        Drop your resume here
                      </p>
                      <p className="text-[10px] text-gray-500 mb-2">
                        or click to browse files
                      </p>
                      <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        Choose File
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="relative bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-2.5 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center shadow-lg flex-shrink-0">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-[10px] text-gray-600">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="flex items-center gap-1 bg-green-100 px-1.5 py-0.5 rounded-lg">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span className="text-[10px] font-medium text-green-700">Uploaded</span>
                        </div>
                        <button 
                          onClick={removeFile} 
                          className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-1.5 flex items-center gap-2">
                    <div className="w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <X className="w-2 h-2 text-white" />
                    </div>
                    <p className="text-[10px] text-red-700 font-medium">{error}</p>
                  </div>
                )}
              </div>

              {/* Job Selection Card - Compact */}
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                    <Briefcase className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Select Your Position</h3>
                    <p className="text-[10px] text-gray-500">Choose the role you're applying for</p>
                  </div>
                </div>

                <select
                  value={selectedJobType}
                  onChange={(e) => setSelectedJobType(e.target.value)}
                  className="w-full px-2.5 py-2 bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg text-xs font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all cursor-pointer hover:border-blue-300"
                >
                  <option value="">Select a position...</option>
                  {JOB_TYPES.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>

                {selectedJobType && (
                  <div className="mt-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 px-2.5 py-1.5 rounded-lg flex items-center gap-2">
                    <div className="w-5 h-5 bg-green-500 rounded-lg flex items-center justify-center shadow-md">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-green-700">Position Selected</p>
                      <p className="text-[10px] text-green-600">{selectedJob?.title}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Job Description - Compact */}
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-blue-100 p-3 shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col">
              {selectedJob ? (
                <div className="flex flex-col h-full">
                  {/* Job Header */}
                  <div className="flex items-start gap-2.5 pb-2 border-b border-blue-100">
                    <div className={`w-10 h-10 bg-gradient-to-br ${selectedJob.color} rounded-xl flex items-center justify-center shadow-lg flex-shrink-0`}>
                      <selectedJob.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 mb-0.5 leading-tight">
                        {selectedJob.title}
                      </h3>
                      <div className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                        <Zap className="w-2.5 h-2.5" />
                        {selectedJob.level}
                      </div>
                    </div>
                  </div>

                  {/* Description - Line clamp */}
                  <div className="mt-2 mb-2">
                    <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-wide mb-1">
                      Role Overview
                    </h4>
                    <p className="text-xs text-gray-700 leading-relaxed line-clamp-2">
                      {selectedJob.description}
                    </p>
                  </div>

                  {/* Skills */}
                  <div className="mb-2">
                    <h4 className="text-[10px] font-bold text-gray-900 uppercase tracking-wide mb-1">
                      Required Skills
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedJob.skills.map((skill) => (
                        <span 
                          key={skill} 
                          className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 px-2 py-0.5 rounded-lg text-[10px] font-semibold border border-blue-200"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Interview Focus */}
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-2 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Target className="w-2.5 h-2.5 text-white" />
                      </div>
                      <h4 className="text-[10px] font-bold text-gray-900">Interview Focus</h4>
                    </div>
                    <ul className="space-y-1">
                      <li className="flex items-start gap-1.5">
                        <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] text-gray-700">Technical questions tailored to your resume</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] text-gray-700">Role-specific coding challenges</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <CheckCircle className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] text-gray-700">Real-world problem-solving scenarios</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Briefcase className="w-7 h-7 text-blue-600" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 mb-0.5">
                      Select a Position
                    </h3>
                    <p className="text-[10px] text-gray-500 max-w-xs mx-auto">
                      Choose your desired role from the dropdown to view detailed job requirements
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CTA Button - Compact */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={handleProceed}
              disabled={!canProceed || isLoading}
              className={`group relative px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
                canProceed && !isLoading
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-xl shadow-blue-500/50 hover:shadow-2xl hover:scale-105 hover:from-blue-700 hover:to-cyan-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Initializing Interview...
                  </>
                ) : (
                  <>
                    Start Your AI Interview
                    <ArrowRight className={`w-4 h-4 ${canProceed ? "group-hover:translate-x-1" : ""} transition-transform`} />
                  </>
                )}
              </span>
            </button>
            
            {!canProceed && !isLoading && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-600 bg-white/60 backdrop-blur-sm px-3 py-1 rounded-lg border border-gray-200">
                <div className="w-1 h-1 bg-gray-400 rounded-full animate-pulse"></div>
                Upload your resume and select a position to continue
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
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
      `}</style>
    </div>
  );
}

export default LandingPage;