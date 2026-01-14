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
    let isMounted = true;

    const trackSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        // Only track if we have a valid session with access token
        if (!isMounted || sessionError || !session?.access_token || !session?.user) return;
        
        const { browser, os, device_info } = getBrowserInfo();
        
        const { error, data } = await supabase.functions.invoke("track-session", {
          body: {
            browser,
            os,
            device_info,
            session_token: session.access_token.slice(-32),
          },
        });
        
        // If user not found (deleted), sign out to clear stale session
        if (error?.message?.includes("401") || data?.code === "USER_NOT_FOUND") {
          console.log("Session invalid, clearing stale auth...");
          await supabase.auth.signOut();
          return;
        }
        
        // Log only truly unexpected errors
        if (error && !error.message?.includes("401") && !error.message?.includes("Invalid token")) {
          console.warn("Session tracking error:", error.message);
        }
      } catch {
        // Silently ignore all errors - session tracking should never block the app
      }
    };

    // Track on mount with a small delay to ensure auth is ready
    const timeoutId = setTimeout(trackSession, 500);

    // Track on auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setTimeout(trackSession, 100);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);
};
