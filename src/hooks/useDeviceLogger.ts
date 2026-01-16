import { useEffect, useCallback } from "react";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { supabase } from "@/integrations/supabase/client";

export function useDeviceLogger() {
  const { fingerprint, loading } = useDeviceFingerprint();

  const logDevice = useCallback(async (userId: string) => {
    if (!fingerprint) return;

    try {
      await supabase.functions.invoke("log-device", {
        body: { 
          fingerprint, 
          user_id: userId 
        },
      });
      console.log("Device logged successfully for user:", userId);
    } catch (error) {
      console.error("Failed to log device:", error);
    }
  }, [fingerprint]);

  useEffect(() => {
    if (loading || !fingerprint) return;

    // Log device on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user) {
        logDevice(session.user.id);
      }
    });

    // Also log on initial load if already signed in
    const logCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        logDevice(user.id);
      }
    };
    
    logCurrentUser();

    return () => {
      subscription.unsubscribe();
    };
  }, [fingerprint, loading, logDevice]);

  // Return logDevice function for manual use during auth
  return { logDevice, fingerprint };
}

// Hook to log device during auth process (before user is fully authenticated)
export function useAuthDeviceLogger() {
  const { fingerprint, loading } = useDeviceFingerprint();

  const logDeviceForUser = useCallback(async (userId: string) => {
    if (!fingerprint || loading) {
      console.log("Fingerprint not ready, skipping device log");
      return false;
    }

    try {
      const response = await supabase.functions.invoke("log-device", {
        body: { 
          fingerprint, 
          user_id: userId 
        },
      });
      
      if (response.error) {
        console.error("Failed to log device:", response.error);
        return false;
      }
      
      console.log("Device logged during auth for user:", userId);
      return true;
    } catch (error) {
      console.error("Failed to log device:", error);
      return false;
    }
  }, [fingerprint, loading]);

  return { logDeviceForUser, fingerprint, fingerprintLoading: loading };
}
