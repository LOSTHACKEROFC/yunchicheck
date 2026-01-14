import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Outlet } from "react-router-dom";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { Ban, MessageCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBannedDialog, setShowBannedDialog] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const navigate = useNavigate();
  
  // Track user session for security
  useSessionTracker();

  // Check if user is banned
  const checkBanStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_banned, ban_reason")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (profile?.is_banned) {
      setBanReason(profile.ban_reason);
      await supabase.auth.signOut();
      setShowBannedDialog(true);
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
              const newProfile = payload.new as { is_banned?: boolean; ban_reason?: string | null };
              if (newProfile?.is_banned === true) {
                setBanReason(newProfile.ban_reason ?? null);
                supabase.auth.signOut().then(() => {
                  setShowBannedDialog(true);
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

      {/* Banned User Dialog */}
      <Dialog open={showBannedDialog} onOpenChange={setShowBannedDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
              <Ban className="h-8 w-8 text-red-500" />
            </div>
            <DialogTitle className="text-xl text-center">Account Banned</DialogTitle>
            <DialogDescription asChild>
              <div className="text-center space-y-3">
                <p className="text-base text-muted-foreground">
                  Your account has been banned by Support.
                </p>
                {banReason && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="h-4 w-4 text-red-500" />
                      <p className="text-sm font-semibold text-red-500">Ban Reason</p>
                    </div>
                    <p className="text-sm text-foreground">{banReason}</p>
                  </div>
                )}
                {!banReason && (
                  <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
                    <p className="text-sm text-muted-foreground italic">No reason provided</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  If you believe this was a mistake, you can appeal this decision.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                const appealMessage = encodeURIComponent(
                  `🔓 Ban Appeal Request\n\nI would like to appeal my account ban.\n\nReason given: ${banReason || 'No reason provided'}\n\nPlease review my case.`
                );
                window.open(`https://t.me/8496943061?text=${appealMessage}`, "_blank");
              }}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              Appeal Unban
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                window.open("https://t.me/8496943061", "_blank");
              }}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Contact Support
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                setShowBannedDialog(false);
                navigate("/auth");
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Dashboard;
