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
  /** Tavus conversation id — needed to address echo interactions. */
  avatar_conversation_id?: string;
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
  /** Presentation-only; the Vantage redesign styles roles uniformly. */
  color?: string;
}

export interface ApiError {
  detail: string;
  status_code?: number;
}