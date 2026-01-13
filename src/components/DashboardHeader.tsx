import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu, Wallet, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DashboardHeader = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setBalance(profile.balance);
      }

      // Fetch unread admin messages (messages from admin that are newer than last viewed)
      const { data: tickets } = await supabase
        .from("support_tickets")
        .select("id, updated_at")
        .eq("user_id", user.id);

      if (tickets && tickets.length > 0) {
        const ticketIds = tickets.map(t => t.id);
        
        // Get admin messages from the last 24 hours
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        
        const { data: adminMessages, count } = await supabase
          .from("ticket_messages")
          .select("*", { count: "exact" })
          .in("ticket_id", ticketIds)
          .eq("is_admin", true)
          .gte("created_at", oneDayAgo.toISOString());

        setUnreadCount(count || 0);
      }

      setLoading(false);
    };

    fetchData();

    // Subscribe to realtime updates for ticket messages
    const channel = supabase
      .channel("header-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
        },
        async (payload) => {
          if (payload.new && payload.new.is_admin) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          if (payload.new && payload.new.balance !== undefined) {
            setBalance(payload.new.balance);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors">
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
        <span className="text-sm text-muted-foreground">Dashboard</span>
      </div>

      <div className="flex items-center gap-3">
        <TooltipProvider>
          {/* Balance */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/dashboard/balance")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20"
              >
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  {loading ? "..." : `$${balance.toFixed(2)}`}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Your Balance</p>
            </TooltipContent>
          </Tooltip>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/dashboard/support")}
                className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-destructive hover:bg-destructive"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{unreadCount > 0 ? `${unreadCount} new ticket response${unreadCount > 1 ? 's' : ''}` : "No new notifications"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
};

export default DashboardHeader;
