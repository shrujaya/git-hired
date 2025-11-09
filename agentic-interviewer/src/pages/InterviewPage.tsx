// pages/InterviewPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFullscreen } from '../hooks/useFullscreen';

const InterviewPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    isFullscreen,
    fullscreenExits,
    enterFullscreen,
    exitFullscreen,
  } = useFullscreen();

  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);

  // Enter fullscreen on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      enterFullscreen();
    }, 500); // Small delay for better UX

    return () => clearTimeout(timer);
  }, [enterFullscreen]);

  // Monitor fullscreen exits
  useEffect(() => {
    if (fullscreenExits > 0 && !showExitDialog) {
      setShowWarning(true);
      // Auto-hide warning after 5 seconds
      const timer = setTimeout(() => setShowWarning(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [fullscreenExits, showExitDialog]);

  // Detect tab/window switches
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches(prev => prev + 1);
        console.warn('Tab switch detected - Potential violation');
        // TODO: Log to backend
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Prevent common shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F11 (fullscreen toggle)
      if (e.key === 'F11') {
        e.preventDefault();
      }
      // Prevent Ctrl+W (close tab)
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
      }
    };

    // Prevent right-click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Warn before leaving
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave the interview?';
      return e.returnValue;
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Handle exit interview
  const handleExitInterview = async () => {
    await exitFullscreen();
    // TODO: Log interview exit to backend
    sessionStorage.setItem('interviewCompleted', 'true');
    navigate('/results');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 relative">
      {/* Exit Button - Top Right Corner */}
      <button
        onClick={() => setShowExitDialog(true)}
        className="fixed top-4 right-4 z-50 bg-red-500/90 hover:bg-red-600 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-lg transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Exit Interview
      </button>

      {/* Fullscreen Warning */}
      {showWarning && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-500/95 backdrop-blur-sm text-white px-6 py-4 rounded-xl shadow-2xl animate-shake flex items-center gap-3 max-w-lg">
          <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1">
            <p className="font-bold text-sm">Fullscreen Warning</p>
            <p className="text-xs mt-1">
              You exited fullscreen mode. This has been recorded. Please stay in fullscreen during the interview.
              <span className="font-semibold"> ({fullscreenExits} exit{fullscreenExits !== 1 ? 's' : ''} detected)</span>
            </p>
          </div>
          <button
            onClick={() => {
              enterFullscreen();
              setShowWarning(false);
            }}
            className="ml-auto bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap"
          >
            Return to Fullscreen
          </button>
        </div>
      )}

      {/* Exit Confirmation Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Exit Interview?
                </h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to exit? Your progress will be saved and reviewed by our team.
                </p>
              </div>
            </div>

            {/* Violation Summary */}
            {(fullscreenExits > 0 || tabSwitches > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-semibold text-red-800 mb-2">
                  Activity Summary:
                </p>
                <ul className="text-xs text-red-700 space-y-1">
                  {fullscreenExits > 0 && (
                    <li>• {fullscreenExits} fullscreen exit{fullscreenExits !== 1 ? 's' : ''} detected</li>
                  )}
                  {tabSwitches > 0 && (
                    <li>• {tabSwitches} tab/window switch{tabSwitches !== 1 ? 'es' : ''} detected</li>
                  )}
                </ul>
                <p className="text-xs text-red-600 mt-2">
                  This activity will be included in your interview report.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowExitDialog(false)}
                className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-xl font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExitInterview}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors"
              >
                Exit Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Interview Content */}
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            Interview in Progress
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Your Interview Content Here
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            This is a placeholder. Add your actual interview components here.
          </p>
          
          {/* Debug Info (remove in production) */}
          <div className="mt-12 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-blue-100 inline-block">
            <p className="text-xs text-gray-600 mb-1">
              <span className="font-semibold">Fullscreen:</span>{' '}
              <span className={isFullscreen ? 'text-green-600' : 'text-red-600'}>
                {isFullscreen ? 'Active' : 'Inactive'}
              </span>
            </p>
            <p className="text-xs text-gray-600 mb-1">
              <span className="font-semibold">Fullscreen Exits:</span> {fullscreenExits}
            </p>
            <p className="text-xs text-gray-600">
              <span className="font-semibold">Tab Switches:</span> {tabSwitches}
            </p>
          </div>
        </div>
      </div>

      {/* Styles for animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-50%) translateY(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(-50%) translateY(5px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
};

export default InterviewPage;