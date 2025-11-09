// src/utils/api.utils.ts
import type { SessionInitRequest, SessionInitResponse, JobType } from '../types/api.types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
  sessionId: string;
  avatarUrl?: string;
}) => {
  // Store in localStorage (persists across sessions)
  localStorage.setItem("resumeFileName", data.resumeFileName);
  localStorage.setItem("selectedJobType", data.selectedJobType);
  localStorage.setItem("jobTitle", data.jobTitle);
  localStorage.setItem("candidateName", data.candidateName);
  localStorage.setItem("sessionId", data.sessionId);
  
  // Store in sessionStorage (for route protection)
  sessionStorage.setItem("resumeFileName", data.resumeFileName);
  sessionStorage.setItem("selectedJobType", data.selectedJobType);
  sessionStorage.setItem("jobTitle", data.jobTitle);
  sessionStorage.setItem("candidateName", data.candidateName);
  sessionStorage.setItem("sessionId", data.sessionId);

  // Store avatar URL if available
  if (data.avatarUrl) {
    localStorage.setItem("avatarUrl", data.avatarUrl);
    sessionStorage.setItem("avatarUrl", data.avatarUrl);
  }
};