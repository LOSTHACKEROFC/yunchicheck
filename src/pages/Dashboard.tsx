import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import FloatingCardsBackground from "@/components/FloatingCardsBackground";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Outlet } from "react-router-dom";
import { useSessionTracker } from "@/hooks/useSessionTracker";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Track user session for security
  useSessionTracker();

  // Check if user is banned or deleted
  const checkUserStatus = async (userId: string) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_banned, ban_reason, username, banned_until")
      .eq("user_id", userId)
      .maybeSingle();
    
    // If no profile found, user was likely deleted - sign out
    if (!profile && !error) {
      console.log("User profile not found, signing out...");
      await supabase.auth.signOut();
      navigate("/auth");
      return true;
    }
    
    if (profile?.is_banned) {
      await supabase.auth.signOut();
      // Store ban info and redirect to banned page
      localStorage.setItem("banReason", profile.ban_reason || "");
      localStorage.setItem("bannedUsername", profile.username || "");
      localStorage.setItem("bannedUntil", profile.banned_until || "");
      navigate(`/banned?reason=${encodeURIComponent(profile.ban_reason || "")}&username=${encodeURIComponent(profile.username || "")}&until=${encodeURIComponent(profile.banned_until || "")}`);
      return true;
    }
    return false;
  };

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        } else {
          // Check user status when auth state changes
          setTimeout(() => {
            checkUserStatus(session.user.id);
          }, 0);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      } else {
        // Check user status on initial load
        checkUserStatus(session.user.id);

        // Subscribe to real-time ban status changes
        realtimeChannel = supabase
          .channel('ban-status-changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `user_id=eq.${session.user.id}`,
            },
            (payload) => {
              const newProfile = payload.new as { is_banned?: boolean; ban_reason?: string | null; username?: string | null; banned_until?: string | null };
              if (newProfile?.is_banned === true) {
                supabase.auth.signOut().then(() => {
                  localStorage.setItem("banReason", newProfile.ban_reason || "");
                  localStorage.setItem("bannedUsername", newProfile.username || "");
                  localStorage.setItem("bannedUntil", newProfile.banned_until || "");
                  navigate(`/banned?reason=${encodeURIComponent(newProfile.ban_reason || "")}&username=${encodeURIComponent(newProfile.username || "")}&until=${encodeURIComponent(newProfile.banned_until || "")}`);
                });
              }
            }
          )
          .subscribe();
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center relative">
        <FloatingCardsBackground />
        <div className="text-primary animate-pulse text-xl relative z-10">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background relative">
        <FloatingCardsBackground />
        <DashboardSidebar />
        <div className="flex-1 flex flex-col relative z-10">
          <DashboardHeader />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
