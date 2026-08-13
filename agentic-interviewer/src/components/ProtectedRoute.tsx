// src/components/RouteProtection.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface RouteProtectionProps {
  children: React.ReactNode;
}

// Check if session is expired
const isSessionExpired = (): boolean => {
  const sessionExpiry = sessionStorage.getItem('sessionExpiry');
  return sessionExpiry ? Date.now() > parseInt(sessionExpiry) : false;
};

// Clear all session data
const clearSession = () => {
  sessionStorage.clear();
  localStorage.clear();
};

// ============================================
// Protection for Landing Page
// Requires: Camera check completed
// ============================================
export const ProtectLandingPage: React.FC<RouteProtectionProps> = ({ children }) => {
  const hasCompletedCameraCheck = sessionStorage.getItem('cameraCheckCompleted') === 'true';

  // Check session expiry
  if (isSessionExpired()) {
    clearSession();
    return <Navigate to="/" replace />;
  }

  // Must complete camera check first
  if (!hasCompletedCameraCheck) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// ============================================
// Protection for Interview Page
// Requires: Camera check + Resume + Job selection
// ============================================
export const ProtectInterviewPage: React.FC<RouteProtectionProps> = ({ children }) => {
  const hasCompletedCameraCheck = sessionStorage.getItem('cameraCheckCompleted') === 'true';
  const resumeFileName = sessionStorage.getItem('resumeFileName');
  const selectedJobType = sessionStorage.getItem('selectedJobType');

  // Check session expiry
  if (isSessionExpired()) {
    clearSession();
    return <Navigate to="/" replace />;
  }

  // Must complete camera check first
  if (!hasCompletedCameraCheck) {
    return <Navigate to="/" replace />;
  }

  // Must have resume and job selected
  if (!resumeFileName || !selectedJobType) {
    return <Navigate to="/landing" replace />;
  }

  return <>{children}</>;
};

// ============================================
// Protection for Results Page
// Requires: Interview completed
// ============================================
export const ProtectResultsPage: React.FC<RouteProtectionProps> = ({ children }) => {
  const interviewCompleted = sessionStorage.getItem('interviewCompleted') === 'true';

  // Check session expiry
  if (isSessionExpired()) {
    clearSession();
    return <Navigate to="/" replace />;
  }

  // Must have completed interview
  if (!interviewCompleted) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// ============================================
// Protection for Test Page (Camera Check)
// Prevents re-accessing after completion
// ============================================
export const ProtectTestPage: React.FC<RouteProtectionProps> = ({ children }) => {
  const location = useLocation();
  const hasCompletedCameraCheck = sessionStorage.getItem('cameraCheckCompleted') === 'true';
  const resumeFileName = sessionStorage.getItem('resumeFileName');
  const selectedJobType = sessionStorage.getItem('selectedJobType');
  const interviewCompleted = sessionStorage.getItem('interviewCompleted') === 'true';

  // Asked for the cover sheet on purpose — the brand mark in the header.
  // Without this the forwarding below sends a candidate who has already
  // passed the device check straight back to where they came from, and the
  // logo looks broken. Going back is safe: it only moves them earlier in the
  // flow, and nothing they have entered is cleared.
  if ((location.state as { home?: boolean } | null)?.home) {
    return <>{children}</>;
  }

  // If interview completed, go to results
  if (interviewCompleted) {
    return <Navigate to="/results" replace />;
  }

  // If already in middle of flow (resume + job selected), go to interview
  if (hasCompletedCameraCheck && resumeFileName && selectedJobType) {
    return <Navigate to="/interview" replace />;
  }

  // If camera check completed but no resume, go to landing
  if (hasCompletedCameraCheck) {
    return <Navigate to="/landing" replace />;
  }

  // Allow access to test page (fresh start)
  return <>{children}</>;
};