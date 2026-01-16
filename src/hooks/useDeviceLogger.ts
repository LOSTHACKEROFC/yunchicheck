import { useEffect } from "react";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { supabase } from "@/integrations/supabase/client";

export function useDeviceLogger() {
  const { fingerprint, loading } = useDeviceFingerprint();

  useEffect(() => {
    if (loading || !fingerprint) return;

    const logDevice = async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      try {
        await supabase.functions.invoke("log-device", {
          body: { 
            fingerprint, 
            user_id: user.id 
          },
        });
      } catch (error) {
        console.error("Failed to log device:", error);
      }
    };

    // Log device on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        logDevice();
      }
    });

    // Also log on initial load if already signed in
    logDevice();

    return () => {
      subscription.unsubscribe();
    };
  }, [fingerprint, loading]);
}
