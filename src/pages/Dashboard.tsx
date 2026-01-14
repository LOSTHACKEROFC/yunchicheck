import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Outlet } from "react-router-dom";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { toast } from "sonner";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Track user session for security
  useSessionTracker();

  // Check if user is banned
  const checkBanStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (profile?.is_banned) {
      await supabase.auth.signOut();
      toast.error("Your account has been banned. Please contact support.");
      navigate("/auth");
      return true;
    }
    return false;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        } else {
          // Check ban status when auth state changes
          setTimeout(() => {
            checkBanStatus(session.user.id);
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
        // Check ban status on initial load
        checkBanStatus(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary animate-pulse text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col">
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
