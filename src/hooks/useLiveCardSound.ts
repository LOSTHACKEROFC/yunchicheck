import { useCallback, useRef } from "react";

export const useLiveCardSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const playLiveSound = useCallback(() => {
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

      // Create a celebratory success sound for live cards
      const playTone = (frequency: number, startTime: number, duration: number, volume: number = 0.3) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        // Envelope for smooth attack and decay
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      // Play ascending victory chime (C5 -> E5 -> G5)
      playTone(523.25, now, 0.12, 0.25);        // C5
      playTone(659.25, now + 0.08, 0.12, 0.3);  // E5
      playTone(783.99, now + 0.16, 0.2, 0.35);  // G5
    } catch (error) {
      console.warn("Could not play live card sound:", error);
    }
  }, []);

  return { playLiveSound };
};
