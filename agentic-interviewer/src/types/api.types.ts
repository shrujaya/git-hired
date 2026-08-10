// src/types/api.types.ts

export interface SessionInitRequest {
  resume_base64: string;
  job_description: string;
  job_role: string;
  /** Optional fallback only — the backend reads the name off the resume. */
  candidate_name?: string;
}

export interface SessionInitResponse {
  session_id: string;
  status: string;
  message: string;
  avatar_url?: string;
  /** Name read off the uploaded resume. */
  candidate_name: string;
  candidate_first_name: string;
}

export interface JobType {
  id: string;
  title: string;
  description: string;
  skills: string[];
  level: string;
  color: string;
}

export interface ApiError {
  detail: string;
  status_code?: number;
}