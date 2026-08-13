// src/routes/index.tsx
import { createBrowserRouter } from "react-router-dom";
import WelcomePage from "../pages/WelcomePage";
import LandingPage from "../pages/LandingPage";
import InterviewPage from "../pages/InterviewPage";
import ResultsPage from "../pages/ResultsPage";
import Test from "../pages/Test";
import {
  ProtectTestPage,
  ProtectLandingPage,
  ProtectInterviewPage,
  ProtectResultsPage,
} from "../components/ProtectedRoute";

export const router = createBrowserRouter([
  // Welcome sits at the entry route, and the device check moves to its own
  // path. Both carry ProtectTestPage: every other guard sends a candidate
  // back to "/" when they are out of order, and that guard is what forwards
  // them to whichever stage they had actually reached. Putting an unguarded
  // page here would strand a mid-interview refresh on the cover page.
  {
    path: "/",
    element: (
      <ProtectTestPage>
        <WelcomePage />
      </ProtectTestPage>
    ),
  },
  {
    path: "/device-check",
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
