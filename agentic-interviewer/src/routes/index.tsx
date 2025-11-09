// src/routes/index.tsx
import { createBrowserRouter } from "react-router-dom";
import LandingPage from "../pages/LandingPage";
import InterviewPage from "../pages/InterviewPage";
import ResultsPage from "../pages/ResultsPage";
import Test from "../pages/Test";
import AiInterview from "../pages/AiInterview";
import {
  ProtectTestPage,
  ProtectLandingPage,
  ProtectInterviewPage,
  ProtectResultsPage,
} from "../components/ProtectedRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ProtectTestPage>
        <Test />
      </ProtectTestPage>
    ),
  },
  {
    path: "/landing",
    element: (
      <ProtectLandingPage>
        <LandingPage />
      </ProtectLandingPage>
    ),
  },
  {
    path: "/interview",
    element: (
      <ProtectInterviewPage>
        <InterviewPage />
      </ProtectInterviewPage>
    ),
  },
  {
    path: "/results",
    element: (
      <ProtectResultsPage>
        <ResultsPage />
      </ProtectResultsPage>
    ),
  },
  {
    path: "*",
    element: (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            404 - Page Not Found
          </h1>
          <a href="/" className="text-blue-600 hover:underline">
            Go back home
          </a>
        </div>
      </div>
    ),
  },
]);
