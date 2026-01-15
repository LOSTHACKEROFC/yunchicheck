import { useCallback, useRef } from "react";

export const useVictorySound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playVictorySound = useCallback((intensity: "small" | "medium" | "epic" = "medium") => {
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;

      const playTone = (
        frequency: number, 
        startTime: number, 
        duration: number, 
        volume: number = 0.3,
        type: OscillatorType = "sine"
      ) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        // Envelope for smooth attack and decay
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      if (intensity === "small") {
        // Simple victory arpeggio (C5 -> E5 -> G5 -> C6)
        playTone(523.25, now, 0.15, 0.2);          // C5
        playTone(659.25, now + 0.1, 0.15, 0.25);   // E5
        playTone(783.99, now + 0.2, 0.15, 0.3);    // G5
        playTone(1046.50, now + 0.3, 0.3, 0.35);   // C6
      } else if (intensity === "medium") {
        // Triumphant fanfare with harmonics
        // First chord burst
        playTone(523.25, now, 0.2, 0.25);          // C5
        playTone(659.25, now, 0.2, 0.2);           // E5
        playTone(783.99, now, 0.2, 0.2);           // G5
        
        // Rising melody
        playTone(783.99, now + 0.15, 0.15, 0.3);   // G5
        playTone(880.00, now + 0.25, 0.15, 0.3);   // A5
        playTone(987.77, now + 0.35, 0.15, 0.35);  // B5
        
        // Final triumphant chord
        playTone(1046.50, now + 0.45, 0.4, 0.35);  // C6
        playTone(1318.51, now + 0.45, 0.4, 0.3);   // E6
        playTone(1567.98, now + 0.45, 0.4, 0.25);  // G6
      } else {
        // EPIC victory fanfare with full harmony
        // Opening power chord
        playTone(261.63, now, 0.25, 0.25, "triangle");     // C4 bass
        playTone(523.25, now, 0.25, 0.3);                  // C5
        playTone(659.25, now, 0.25, 0.25);                 // E5
        playTone(783.99, now, 0.25, 0.25);                 // G5
        
        // Ascending fanfare
        playTone(523.25, now + 0.2, 0.12, 0.25);           // C5
        playTone(659.25, now + 0.3, 0.12, 0.28);           // E5
        playTone(783.99, now + 0.4, 0.12, 0.3);            // G5
        playTone(880.00, now + 0.5, 0.12, 0.32);           // A5
        playTone(987.77, now + 0.6, 0.12, 0.35);           // B5
        
        // Climactic high note with harmony
        playTone(1046.50, now + 0.7, 0.5, 0.4);            // C6
        playTone(1318.51, now + 0.7, 0.5, 0.35);           // E6
        playTone(1567.98, now + 0.7, 0.5, 0.3);            // G6
        
        // Final bass reinforcement
        playTone(261.63, now + 0.7, 0.5, 0.2, "triangle"); // C4
        playTone(523.25, now + 0.7, 0.5, 0.25);            // C5
        
        // Sparkle top notes
        playTone(2093.00, now + 0.8, 0.3, 0.15);           // C7
        playTone(2637.02, now + 0.9, 0.2, 0.1);            // E7
      }
    } catch (error) {
      console.warn("Could not play victory sound:", error);
    }
  }, []);

  return { playVictorySound };
};
