import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu, Wallet, Bell, Check, Trash2, CheckCheck, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";

interface Notification {
  id: string;
  message: string;
  ticket_id: string;
  ticket_subject: string;
  created_at: string;
  is_read: boolean;
}

const DashboardHeader = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch user's tickets
    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id, subject")
      .eq("user_id", user.id);

    if (!tickets || tickets.length === 0) {
      setNotifications([]);
      return;
    }

    const ticketIds = tickets.map(t => t.id);
    const ticketMap = new Map(tickets.map(t => [t.id, t.subject]));

    // Fetch read message IDs
    const { data: readMessages } = await supabase
      .from("notification_reads")
      .select("message_id")
      .eq("user_id", user.id);

    const readMessageIds = new Set(readMessages?.map(r => r.message_id) || []);

    // Fetch deleted message IDs
    const { data: deletedMessages } = await supabase
      .from("deleted_notifications")
      .select("message_id")
      .eq("user_id", user.id);

    const deletedMessageIds = new Set(deletedMessages?.map(d => d.message_id) || []);

    // Fetch admin messages
    const { data: adminMessages } = await supabase
      .from("ticket_messages")
      .select("*")
      .in("ticket_id", ticketIds)
      .eq("is_admin", true)
      .order("created_at", { ascending: false })
      .limit(20);

    if (adminMessages) {
      const notifs: Notification[] = adminMessages
        .filter(msg => !deletedMessageIds.has(msg.id))
        .map(msg => ({
          id: msg.id,
          message: msg.message,
          ticket_id: msg.ticket_id,
          ticket_subject: ticketMap.get(msg.ticket_id) || "Support Ticket",
          created_at: msg.created_at,
          is_read: readMessageIds.has(msg.id),
        }));
      setNotifications(notifs);
    }
  };

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

      await fetchNotifications();
      setLoading(false);
    };

    fetchData();

    // Subscribe to realtime updates
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
            await fetchNotifications();
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

  const markAsRead = async (notificationId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("notification_reads")
      .upsert({ user_id: user.id, message_id: notificationId });

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const unreadNotifs = notifications.filter(n => !n.is_read);
    if (unreadNotifs.length === 0) return;

    const inserts = unreadNotifs.map(n => ({
      user_id: user.id,
      message_id: n.id,
    }));

    await supabase.from("notification_reads").upsert(inserts);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success("All notifications marked as read");
  };

  const deleteNotification = async (notificationId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("deleted_notifications")
      .upsert({ user_id: user.id, message_id: notificationId });

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    toast.success("Notification deleted");
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setOpen(false);
    navigate("/dashboard/support");
  };

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
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-destructive hover:bg-destructive"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-80 p-0 bg-card border border-border shadow-lg" 
              align="end"
              sideOffset={8}
            >
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h4 className="font-semibold text-sm">Notifications</h4>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs h-7 px-2 text-primary hover:text-primary"
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    Mark all read
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-80">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notifications yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 hover:bg-secondary/50 transition-colors ${
                          !notification.is_read ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div 
                            className={`mt-0.5 p-1.5 rounded-full ${
                              notification.is_read 
                                ? "bg-muted" 
                                : "bg-primary/20"
                            }`}
                          >
                            <MessageSquare className={`h-3.5 w-3.5 ${
                              notification.is_read 
                                ? "text-muted-foreground" 
                                : "text-primary"
                            }`} />
                          </div>
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <p className="text-xs font-medium text-primary truncate">
                              {notification.ticket_subject}
                            </p>
                            <p className="text-sm text-foreground line-clamp-2 mt-0.5">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(notification.created_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {!notification.is_read && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(notification.id);
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5 text-primary" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Mark as read</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {notifications.length > 0 && (
                <>
                  <Separator />
                  <div className="p-2">
                    <Button
                      variant="ghost"
                      className="w-full text-sm"
                      onClick={() => {
                        setOpen(false);
                        navigate("/dashboard/support");
                      }}
                    >
                      View all tickets
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </TooltipProvider>
      </div>
    </header>
  );
};

export default DashboardHeader;
