// src/types/api.types.ts

export interface SessionInitRequest {
  resume_base64: string;
  job_description: string;
  candidate_name: string;
  job_role: string;
}

export interface SessionInitResponse {
  session_id: string;
  status: string;
  message: string;
  avatar_url?: string;
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