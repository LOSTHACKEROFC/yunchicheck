import { useEffect, useState, useCallback } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

let fpPromise: ReturnType<typeof FingerprintJS.load> | null = null;

export function useDeviceFingerprint() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const getFingerprint = useCallback(async () => {
    try {
      // Lazy load the fingerprint agent
      if (!fpPromise) {
        fpPromise = FingerprintJS.load();
      }
      
      const fp = await fpPromise;
      const result = await fp.get();
      return result.visitorId;
    } catch (error) {
      console.error("Error getting device fingerprint:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const fp = await getFingerprint();
      if (mounted) {
        setFingerprint(fp);
        setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [getFingerprint]);

  return { fingerprint, loading, getFingerprint };
}
