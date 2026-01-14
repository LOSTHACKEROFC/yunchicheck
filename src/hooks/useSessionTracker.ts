import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";

  // Detect browser
  if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Edg")) {
    browser = "Edge";
  } else if (ua.includes("Chrome")) {
    browser = "Chrome";
  } else if (ua.includes("Safari")) {
    browser = "Safari";
  } else if (ua.includes("Opera") || ua.includes("OPR")) {
    browser = "Opera";
  }

  // Detect OS
  if (ua.includes("Windows")) {
    os = "Windows";
  } else if (ua.includes("Mac OS")) {
    os = "macOS";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  } else if (ua.includes("Android")) {
    os = "Android";
  } else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) {
    os = "iOS";
  }

  return { browser, os, device_info: ua };
};

export const useSessionTracker = () => {
  useEffect(() => {
    const trackSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        const { browser, os, device_info } = getBrowserInfo();
        
        try {
          await supabase.functions.invoke("track-session", {
            body: {
              browser,
              os,
              device_info,
              session_token: session.access_token.slice(-32), // Use last 32 chars as token identifier
            },
          });
        } catch (error) {
          console.error("Failed to track session:", error);
        }
      }
    };

    // Track on mount
    trackSession();

    // Track on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        trackSession();
      }
    });

    return () => subscription.unsubscribe();
  }, []);
};
