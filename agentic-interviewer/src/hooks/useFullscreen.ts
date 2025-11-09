// hooks/useFullscreen.ts
import { useEffect, useState } from 'react';

interface UseFullscreenReturn {
  isFullscreen: boolean;
  fullscreenExits: number;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  checkFullscreen: () => boolean;
}

export const useFullscreen = (): UseFullscreenReturn => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenExits, setFullscreenExits] = useState(0);

  // Request fullscreen
  const enterFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error('Error entering fullscreen:', error);
    }
  };

  // Exit fullscreen
  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error('Error exiting fullscreen:', error);
    }
  };

  // Check if in fullscreen
  const checkFullscreen = () => {
    const isInFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).msFullscreenElement
    );
    setIsFullscreen(isInFullscreen);
    return isInFullscreen;
  };

  // Monitor fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFullscreen = checkFullscreen();
      
      // If user exited fullscreen (not through our exit button)
      if (!inFullscreen && isFullscreen) {
        setFullscreenExits(prev => prev + 1);
        console.warn('Fullscreen exited - Potential violation');
        
        // Log to backend (optional)
        // logViolation('fullscreen_exit');
      }
    };

    // Check initial state
    checkFullscreen();

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  return {
    isFullscreen,
    fullscreenExits,
    enterFullscreen,
    exitFullscreen,
    checkFullscreen,
  };
};