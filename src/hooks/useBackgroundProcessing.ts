import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to keep processing running even when browser is minimized or tab is hidden.
 * Uses a combination of techniques to prevent browser throttling:
 * 1. Web Worker for background timing
 * 2. Audio context to prevent throttling
 * 3. Visibility API to detect when tab is hidden
 */
export const useBackgroundProcessing = () => {
  const workerRef = useRef<Worker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silentAudioRef = useRef<OscillatorNode | null>(null);
  const isActiveRef = useRef(false);

  // Create a blob URL for the Web Worker
  const createWorker = useCallback(() => {
    const workerCode = `
      let interval = null;
      
      self.onmessage = function(e) {
        if (e.data === 'start') {
          // Send heartbeat every 100ms to keep main thread alive
          interval = setInterval(() => {
            self.postMessage('tick');
          }, 100);
        } else if (e.data === 'stop') {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    
    // Clean up the blob URL after worker is created
    URL.revokeObjectURL(workerUrl);
    
    return worker;
  }, []);

  // Start silent audio to prevent browser from throttling
  const startSilentAudio = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      // Create a silent oscillator
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      // Set volume to 0 (silent)
      gainNode.gain.value = 0;
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      silentAudioRef.current = oscillator;
    } catch (error) {
      console.log('Silent audio not available:', error);
    }
  }, []);

  // Stop silent audio
  const stopSilentAudio = useCallback(() => {
    if (silentAudioRef.current) {
      try {
        silentAudioRef.current.stop();
        silentAudioRef.current.disconnect();
      } catch (error) {
        // Ignore errors when stopping
      }
      silentAudioRef.current = null;
    }
  }, []);

  // Start background processing mode
  const startBackgroundMode = useCallback(() => {
    if (isActiveRef.current) return;
    
    isActiveRef.current = true;
    
    // Create and start worker
    if (!workerRef.current) {
      workerRef.current = createWorker();
    }
    workerRef.current.postMessage('start');
    
    // Start silent audio to prevent throttling
    startSilentAudio();
    
    console.log('Background processing mode enabled');
  }, [createWorker, startSilentAudio]);

  // Stop background processing mode
  const stopBackgroundMode = useCallback(() => {
    if (!isActiveRef.current) return;
    
    isActiveRef.current = false;
    
    // Stop worker
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
    }
    
    // Stop silent audio
    stopSilentAudio();
    
    console.log('Background processing mode disabled');
  }, [stopSilentAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      stopSilentAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stopSilentAudio]);

  // Listen for visibility changes and re-enable audio context if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActiveRef.current) {
        // Resume audio context when tab becomes visible again
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    startBackgroundMode,
    stopBackgroundMode,
    isBackgroundActive: () => isActiveRef.current
  };
};
