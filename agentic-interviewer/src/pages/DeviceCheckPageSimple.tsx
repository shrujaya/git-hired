// src/pages/DeviceCheckPageSimple.tsx
import React, { useEffect, useRef, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import { insertWebcamTestLibrary } from "@addpipe/webcam-tester";
import type { TestResult, MediaDeviceTester } from "@addpipe/webcam-tester";

const CONTAINER_ID = "addpipe-webcam-tester-root";

export default function DeviceCheckPageSimple(): JSX.Element {
  const navigate = useNavigate();
  const testerRef = useRef<MediaDeviceTester | null>(null);
  const [testsPassed, setTestsPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSummary, setLastSummary] = useState<Record<string, TestResult> | null>(null);

  useEffect(() => {
    try {
      // Initialize Addpipe media tester
      testerRef.current = insertWebcamTestLibrary(CONTAINER_ID, {
        title: "Camera & Microphone Check",
        // subtitle:
        //   "Please allow camera and microphone access so we can verify your devices.",
        showPrivacyNotice: true,
        showResults: true,
        showCameraPreview: true,
        allowCameraSelection: true,
        allowMicSelection: true,
        // showControls: true,
        tests: [
          "secureContext",
          "getUserMedia",
          "cameraPermissions",
          "micPermissions",
          "devices",
          "resolutions",
          "lighting",
        ],
        callbacks: {
          onAllTestsComplete: (results: Record<string, TestResult>) => {
            setLoading(false);
            setLastSummary(results);

            const cameraOk =
              results.cameraPermissions?.type === "success" ||
              results.getUserMedia?.type === "success";
            const micOk = results.micPermissions?.type === "success";

            if (cameraOk && micOk && testerRef.current) {
              // Store device IDs
              try {
                const cam = testerRef.current.getSelectedCameraInfo?.();
                const mic = testerRef.current.getSelectedMicrophoneInfo?.();
                if (cam?.deviceId) localStorage.setItem("preferredCamera", cam.deviceId);
                if (mic?.deviceId) localStorage.setItem("preferredMic", mic.deviceId);
              } catch {
                // ignore
              }
              setTestsPassed(true);
            } else {
              setTestsPassed(false);
            }
          },
          onError: (testName: string, error: any) => {
            console.error("WebcamTester error:", testName, error);
          },
        },
      });
    } catch (err) {
      console.error("Failed to initialize webcam tester", err);
      setLoading(false);
    }

    return () => {
      // Cleanup
      if (testerRef.current) {
        try {
          testerRef.current.destroy();
        } catch {
          /* ignore */
        }
        testerRef.current = null;
      }
    };
  }, []);

  const handleProceed = () => {
    if (testerRef.current) {
      try {
        const cam = testerRef.current.getSelectedCameraInfo?.();
        const mic = testerRef.current.getSelectedMicrophoneInfo?.();
        if (cam?.deviceId) localStorage.setItem("preferredCamera", cam.deviceId);
        if (mic?.deviceId) localStorage.setItem("preferredMic", mic.deviceId);
      } catch {
        // ignore
      }
    }
    navigate("/landing");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-5xl mx-auto w-full p-6">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2">Device Check</h1>
        <p className="text-gray-600 mb-6">
          We’ll quickly test your camera and microphone before continuing to the interview.
        </p>

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div id={CONTAINER_ID} className="w-full" />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            {loading ? (
              <div className="text-sm text-gray-600">Running checks…</div>
            ) : testsPassed ? (
              <div className="inline-flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1 rounded">
                ✅ Camera & Microphone passed
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-sm text-orange-700 bg-orange-50 px-3 py-1 rounded">
                ⚠️ Some tests failed — please enable camera & mic and retry
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
            >
              Retry Tests
            </button>

            <button
              onClick={handleProceed}
              disabled={!testsPassed}
              className={`px-5 py-2 rounded text-white text-sm transition ${
                testsPassed
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-blue-300 cursor-not-allowed"
              }`}
            >
              Proceed
            </button>
          </div>
        </div>

        {lastSummary && (
          <div className="mt-6 bg-gray-50 border rounded p-3 text-sm text-gray-700">
            <strong className="block mb-2">Last test summary (debug):</strong>
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(lastSummary, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-6 text-xs text-gray-500">
          Note: getUserMedia requires{" "}
          <span className="font-medium">HTTPS</span> (or{" "}
          <span className="font-medium">localhost</span>). On macOS, you may also need to
          grant system-level camera/microphone permissions.
        </div>
      </div>
    </div>
  );
}
