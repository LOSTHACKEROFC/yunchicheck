import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const getBrowserInfo = () => {
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

type TrackCurrentSessionResult = {
  ok: boolean;
  authError: boolean;
  message?: string;
  data?: unknown;
};

export const trackCurrentSession = async (): Promise<TrackCurrentSessionResult> => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token || !session?.user) {
      return {
        ok: false,
        authError: true,
        message: sessionError?.message || "No active session",
      };
    }

    const { browser, os, device_info } = getBrowserInfo();

    const { error, data } = await supabase.functions.invoke("track-session", {
      body: {
        browser,
        os,
        device_info,
        session_token: session.access_token.slice(-32),
      },
    });

    const isAuthError = error?.message?.includes("401") || 
      error?.message?.includes("Invalid token") ||
      error?.message?.includes("USER_NOT_FOUND") ||
      (data as { code?: string; error?: string } | null)?.code === "USER_NOT_FOUND" ||
      (data as { code?: string; error?: string } | null)?.error === "Invalid token";

    if (isAuthError) {
      console.log("Session invalid, clearing stale auth...");
      await supabase.auth.signOut();
      return {
        ok: false,
        authError: true,
        message: error?.message || "Invalid session",
      };
    }

    if (error) {
      console.warn("Session tracking error:", error.message);
      return {
        ok: false,
        authError: false,
        message: error.message,
      };
    }

    return {
      ok: true,
      authError: false,
      data,
    };
  } catch {
    return {
      ok: false,
      authError: false,
      message: "Unexpected session tracking error",
    };
  }
};

export const useSessionTracker = () => {
  useEffect(() => {
    let isMounted = true;

    const trackSession = async () => {
      if (!isMounted) return;
      await trackCurrentSession();
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
