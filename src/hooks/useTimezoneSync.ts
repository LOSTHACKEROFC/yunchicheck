import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-detects the user's IANA timezone (e.g. "Asia/Kolkata", "Asia/Shanghai")
 * and saves it to their profile so Telegram notifications use local time.
 */
export function useTimezoneSync() {
  useEffect(() => {
    const syncTimezone = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!detectedTimezone) return;

        // Only update if changed
        const { data: profile } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("user_id", user.id)
          .single();

        if (profile?.timezone !== detectedTimezone) {
          await supabase
            .from("profiles")
            .update({ timezone: detectedTimezone } as any)
            .eq("user_id", user.id);
        }
      } catch (err) {
        // Silent fail - timezone is non-critical
      }
    };

    syncTimezone();
  }, []);
}
