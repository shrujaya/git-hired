// src/routes/index.tsx
import { createBrowserRouter } from "react-router-dom";
import DeviceCheckPageSimple from "../pages/DeviceCheckPageSimple";
import LandingPage from "../pages/LandingPage";
import InterviewPage from "../pages/InterviewPage";
import ResultsPage from "../pages/ResultsPage";
import Test from "../pages/test";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DeviceCheckPageSimple />,
  },
  {
    path: "/landing",
    element: <LandingPage />,
  },
  {
    path: "/interview",
    element: <InterviewPage />,
  },
  {
    path: "/results/:sessionId",
    element: <ResultsPage />,
  },
  {
    path: "/test",
    element: <Test />,
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
