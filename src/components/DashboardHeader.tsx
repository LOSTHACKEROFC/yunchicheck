import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Menu, Coins, Bell, Check, Trash2, CheckCheck, MessageSquare, DollarSign, Megaphone, ArrowUpCircle, X, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNotificationSound } from "@/hooks/useNotificationSound";
import SettingsDropdown from "@/components/SettingsDropdown";
import { useLanguage } from "@/contexts/LanguageContext";

interface Notification {
  id: string;
  type: "ticket_reply" | "balance_update" | "system" | "topup" | "announcement" | "spending_alert" | "credits_update" | "topup_approved" | "topup_rejected";
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

interface TelegramProfile {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

const notificationConfig: Record<string, { icon: typeof MessageSquare; color: string; bgColor: string }> = {
  ticket_reply: { icon: MessageSquare, color: "text-blue-500", bgColor: "bg-blue-500/20" },
  balance_update: { icon: DollarSign, color: "text-green-500", bgColor: "bg-green-500/20" },
  system: { icon: Megaphone, color: "text-amber-500", bgColor: "bg-amber-500/20" },
  topup: { icon: ArrowUpCircle, color: "text-purple-500", bgColor: "bg-purple-500/20" },
  announcement: { icon: Megaphone, color: "text-orange-500", bgColor: "bg-orange-500/20" },
  spending_alert: { icon: AlertTriangle, color: "text-red-500", bgColor: "bg-red-500/20" },
  credits_update: { icon: DollarSign, color: "text-emerald-500", bgColor: "bg-emerald-500/20" },
  topup_approved: { icon: ArrowUpCircle, color: "text-green-500", bgColor: "bg-green-500/20" },
  topup_rejected: { icon: ArrowUpCircle, color: "text-red-500", bgColor: "bg-red-500/20" },
};

const DashboardHeader = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [credits, setCredits] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("notification-sound-enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    const saved = localStorage.getItem("notification-preferences");
    return saved ? JSON.parse(saved) : {
      ticket_reply: true,
      balance_update: true,
      system: true,
      topup: true,
      announcement: true,
    };
  });
  const { playNotificationSound } = useNotificationSound();
  const [open, setOpen] = useState(false);
  const [telegramProfile, setTelegramProfile] = useState<TelegramProfile | null>(null);
  const [loadingTelegramProfile, setLoadingTelegramProfile] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Notification | null>(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem("notification-sound-enabled", String(enabled));
    toast.success(enabled ? t.notificationSoundEnabled : t.notificationSoundDisabled);
  };

  // Sync notification preferences from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem("notification-preferences");
      if (saved) {
        setNotificationPrefs(JSON.parse(saved));
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const fetchNotifications = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (data) {
      setNotifications(data as Notification[]);
    }
  };

  const fetchTelegramProfile = async (chatId: string) => {
    if (!chatId) {
      setTelegramProfile(null);
      return;
    }
    
    setLoadingTelegramProfile(true);
    try {
      const response = await supabase.functions.invoke("get-telegram-profile", {
        body: { chat_id: chatId },
      });
      
      if (response.error) {
        console.error("Error fetching Telegram profile:", response.error);
        setTelegramProfile(null);
      } else {
        setTelegramProfile(response.data);
      }
    } catch (error) {
      console.error("Error fetching Telegram profile:", error);
      setTelegramProfile(null);
    } finally {
      setLoadingTelegramProfile(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email || "");

      // Fetch credits and telegram chat id
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, telegram_chat_id, username")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        setCredits(profile.credits);
        setUsername(profile.username || "");
        
        // Fetch Telegram profile if chat ID exists
        if (profile.telegram_chat_id) {
          fetchTelegramProfile(profile.telegram_chat_id);
        }
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
          table: "notifications",
        },
        async (payload) => {
          const newNotif = payload.new as Notification;
          
          // Check if this notification type is enabled
          const prefs = JSON.parse(localStorage.getItem("notification-preferences") || "{}");
          const isEnabled = prefs[newNotif.type] !== false;
          
          if (!isEnabled) return;
          
          setNotifications(prev => [newNotif, ...prev]);
          
          // Play notification sound if enabled
          const soundPref = localStorage.getItem("notification-sound-enabled");
          if (soundPref !== "false") {
            playNotificationSound();
          }
          
          // Show toast for new notification
          toast.info(newNotif.title, {
            description: newNotif.message.substring(0, 50) + (newNotif.message.length > 50 ? "..." : ""),
          });
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
          if (payload.new && payload.new.credits !== undefined) {
            setCredits(payload.new.credits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success("All notifications marked as read");
  };

  const deleteNotification = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    toast.success("Notification deleted");
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setOpen(false);

    // Handle announcement type - show in modal
    if (notification.type === "announcement") {
      setSelectedAnnouncement(notification);
      return;
    }

    // Navigate based on notification type
    switch (notification.type) {
      case "ticket_reply":
        navigate("/dashboard/support");
        break;
      case "balance_update":
      case "topup":
        navigate("/dashboard/balance");
        break;
      default:
        break;
    }
  };

  const getNotificationConfig = (type: string) => {
    return notificationConfig[type] || notificationConfig.system;
  };

  const displayName = telegramProfile?.first_name 
    ? `${telegramProfile.first_name}${telegramProfile.last_name ? ` ${telegramProfile.last_name}` : ""}`
    : (username || email?.split("@")[0] || "User");

  return (
    <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between px-2 sm:px-4 bg-card">
      <div className="flex items-center gap-2 sm:gap-4">
        <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors">
          <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
        </SidebarTrigger>
        <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">{t.dashboard}</span>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        {/* User Profile - hidden on very small screens */}
        <div 
          className="hidden xs:flex items-center gap-1 sm:gap-2 cursor-pointer hover:bg-secondary/50 rounded-lg px-1 sm:px-2 py-1 transition-colors"
          onClick={() => navigate("/dashboard/profile")}
        >
          {loadingTelegramProfile ? (
            <>
              <Skeleton className="h-6 w-6 sm:h-7 sm:w-7 rounded-full" />
              <Skeleton className="h-4 w-16 hidden md:block" />
            </>
          ) : (
            <>
              <Avatar className="h-6 w-6 sm:h-7 sm:w-7 border border-primary/30">
                {telegramProfile?.photo_url ? (
                  <AvatarImage 
                    src={telegramProfile.photo_url} 
                    alt="Profile" 
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs sm:text-sm font-medium text-foreground hidden md:inline max-w-[100px] truncate">
                {displayName}
              </span>
            </>
          )}
        </div>

        <Separator orientation="vertical" className="h-4 sm:h-6 hidden xs:block" />

        <TooltipProvider>
          {/* Credits */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/dashboard/balance")}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors border border-primary/20"
              >
                <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
                <span className="text-xs sm:text-sm font-semibold text-primary">
                  {loading ? "..." : `${credits.toLocaleString()}`}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Your Credits</p>
            </TooltipContent>
          </Tooltip>

          {/* Notifications */}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button className="relative p-1.5 sm:p-2 rounded-lg hover:bg-secondary transition-colors">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <Badge 
                    className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 h-4 sm:h-5 min-w-4 sm:min-w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs bg-destructive hover:bg-destructive"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-[calc(100vw-16px)] sm:w-96 p-0 bg-card border border-border shadow-lg max-h-[80vh] overflow-hidden" 
              align="end"
              sideOffset={8}
            >
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h4 className="font-semibold text-sm">{t.notifications}</h4>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs h-7 px-2 text-primary hover:text-primary"
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    {t.markAllRead}
                  </Button>
                )}
              </div>

              <ScrollArea className="max-h-96">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t.noNotifications}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((notification) => {
                      const config = getNotificationConfig(notification.type);
                      const IconComponent = config.icon;
                      
                      return (
                        <div
                          key={notification.id}
                          className={`p-3 hover:bg-secondary/50 transition-colors ${
                            !notification.is_read ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 p-1.5 rounded-full ${config.bgColor}`}>
                              <IconComponent className={`h-3.5 w-3.5 ${config.color}`} />
                            </div>
                            <div 
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {notification.title}
                                </p>
                                {!notification.is_read && (
                                  <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                                {notification.message}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">
                                  {notification.type.replace("_", " ")}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(notification.created_at), "MMM d, h:mm a")}
                                </span>
                              </div>
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
                      );
                    })}
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
                      {t.viewAllTickets}
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

          {/* Settings */}
          <SettingsDropdown 
            soundEnabled={soundEnabled} 
            onSoundToggle={handleSoundToggle} 
          />
        </TooltipProvider>
      </div>

      {/* Announcement Detail Modal */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-orange-500/20">
                <Megaphone className="h-5 w-5 text-orange-500" />
              </div>
              {selectedAnnouncement?.title || "Announcement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                {selectedAnnouncement?.message}
              </p>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>— Yunchi Team</span>
              {selectedAnnouncement?.created_at && (
                <span>{format(new Date(selectedAnnouncement.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default DashboardHeader;
