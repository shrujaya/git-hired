// src/utils/api.utils.ts
import type { SessionInitRequest, SessionInitResponse, JobType } from '../types/api.types';
import { API_BASE_URL } from '../config';

/**
 * Convert PDF file to base64 string
 * @param file - PDF file to convert
 * @returns Promise resolving to base64 string (without data URL prefix)
 */
export const convertPdfToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove the data:application/pdf;base64, prefix
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Format job details into a structured description string
 * @param job - Job type object containing title, description, skills, and level
 * @returns Formatted job description string
 */
export const formatJobDescription = (job: JobType): string => {
  return `
Job Title: ${job.title}

Level: ${job.level}

Description:
${job.description}

Required Skills:
${job.skills.map(skill => `- ${skill}`).join('\n')}
`.trim();
};

/**
 * Initialize interview session via API
 * @param request - Session initialization request data
 * @returns Promise resolving to session response
 * @throws Error if API call fails
 */
export const initializeSession = async (
  request: SessionInitRequest
): Promise<SessionInitResponse> => {
    console.log("Initializing session with request:", request);
  const response = await fetch(`${API_BASE_URL}/api/session/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  console.log("API Response Status:", response.status);
  console.log("API Response:", response);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(errorData.detail || `HTTP ${response.status}: Failed to initialize session`);
  }

  return response.json();
};

/**
 * Store session data in both localStorage and sessionStorage
 * @param data - Session data to store
 */
export const storeSessionData = (data: {
  resumeFileName: string;
  selectedJobType: string;
  jobTitle: string;
  candidateName: string;
  candidateFirstName: string;
  sessionId: string;
  avatarUrl?: string;
  avatarConversationId?: string;
}) => {
  // Store in localStorage (persists across sessions)
  localStorage.setItem("resumeFileName", data.resumeFileName);
  localStorage.setItem("selectedJobType", data.selectedJobType);
  localStorage.setItem("jobTitle", data.jobTitle);
  localStorage.setItem("candidateName", data.candidateName);
  localStorage.setItem("candidateFirstName", data.candidateFirstName);
  localStorage.setItem("sessionId", data.sessionId);

  // Store in sessionStorage (for route protection)
  sessionStorage.setItem("resumeFileName", data.resumeFileName);
  sessionStorage.setItem("selectedJobType", data.selectedJobType);
  sessionStorage.setItem("jobTitle", data.jobTitle);
  sessionStorage.setItem("candidateName", data.candidateName);
  sessionStorage.setItem("candidateFirstName", data.candidateFirstName);
  sessionStorage.setItem("sessionId", data.sessionId);

  // Store avatar data, clearing any leftovers from a previous session so a
  // dead conversation URL is never carried into a new interview.
  for (const [key, value] of [
    ["avatarUrl", data.avatarUrl],
    ["avatarConversationId", data.avatarConversationId],
  ] as const) {
    if (value) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  }
};
/**
 * Read a job description out of an attached PDF.
 *
 * The browser has no PDF parser; the backend already reads PDFs for resumes,
 * so the same capability is reused here rather than adding a parser to the
 * bundle. The text comes back for the candidate to review before it becomes
 * the brief for their interview.
 *
 * @param pdfBase64 - Base64 encoded PDF
 * @returns The extracted job description text
 * @throws Error carrying the server's own explanation when extraction fails
 */
export const extractJobDescriptionFromPdf = async (
  pdfBase64: string
): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/api/job-description/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdf_base64: pdfBase64 }),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((d) => d?.detail)
      .catch(() => null);
    throw new Error(detail || "Could not read that PDF. Paste the text instead.");
  }

  const data = await response.json();
  return (data.job_description as string) || "";
};
