import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Volume2, VolumeX, UserX, Sun, Moon, Monitor, Bell, MessageSquare, DollarSign, Megaphone, Globe, Radio, AlertTriangle, CreditCard, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useLanguage, languageNames, type Language } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface NotificationPreferences {
  ticket_reply: boolean;
  balance_update: boolean;
  system: boolean;
  topup: boolean;
  announcement: boolean;
  spending_alert: boolean;
  live_card_sound: boolean;
}

interface EmailPreferences {
  email_announcements: boolean;
  email_topup_status: boolean;
  email_ticket_replies: boolean;
  email_credit_additions: boolean;
}

interface SettingsDropdownProps {
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
}

const defaultNotificationPrefs: NotificationPreferences = {
  ticket_reply: true,
  balance_update: true,
  system: true,
  topup: true,
  announcement: true,
  spending_alert: true,
  live_card_sound: true,
};

const defaultEmailPrefs: EmailPreferences = {
  email_announcements: true,
  email_topup_status: true,
  email_ticket_replies: true,
  email_credit_additions: true,
};

const SettingsDropdown = ({ soundEnabled, onSoundToggle }: SettingsDropdownProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() => {
    const saved = localStorage.getItem("notification-preferences");
    return saved ? JSON.parse(saved) : defaultNotificationPrefs;
  });
  const [emailPrefs, setEmailPrefs] = useState<EmailPreferences>(defaultEmailPrefs);
  const [emailPrefsLoaded, setEmailPrefsLoaded] = useState(false);

  // Load email preferences from database
  useEffect(() => {
    const loadEmailPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setEmailPrefs({
          email_announcements: data.email_announcements ?? true,
          email_topup_status: data.email_topup_status ?? true,
          email_ticket_replies: data.email_ticket_replies ?? true,
          email_credit_additions: (data as any).email_credit_additions ?? true,
        });
      }
      setEmailPrefsLoaded(true);
    };

    loadEmailPrefs();
  }, []);

  // Save notification preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("notification-preferences", JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  const handleDeactivateClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmDeactivation = () => {
    setShowConfirmDialog(false);
    setOpen(false);
    // Navigate to the verification page
    navigate("/verify-deactivation");
  };

  const handleNotificationPrefChange = (key: keyof NotificationPreferences, value: boolean) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: value }));
    toast.success(`${key.replace("_", " ")} ${value ? t.notificationsEnabled : t.notificationsDisabled}`);
  };

  const handleEmailPrefChange = async (key: keyof EmailPreferences, value: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newPrefs = { ...emailPrefs, [key]: value };
    setEmailPrefs(newPrefs);

    // Upsert to database
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        ...newPrefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      console.error("Error saving email preferences:", error);
      toast.error("Failed to save preference");
      setEmailPrefs(emailPrefs); // Revert
    } else {
      const label = key.replace("email_", "").replace("_", " ");
      toast.success(`Email ${label} ${value ? "enabled" : "disabled"}`);
    }
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    toast.success(`${t.languageChanged} ${languageNames[lang]}`);
  };

  const themeOptions = [
    { value: "light", icon: Sun, label: t.light },
    { value: "dark", icon: Moon, label: t.dark },
    { value: "system", icon: Monitor, label: t.system },
  ];

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <Settings className="h-5 w-5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-72 p-0 bg-card border border-border shadow-lg" 
          align="end"
          sideOffset={8}
        >
          <div className="p-3 border-b border-border">
            <h4 className="font-semibold text-sm">{t.settings}</h4>
          </div>

          <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Language Settings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.language}
              </Label>
              <Select value={language} onValueChange={(value) => handleLanguageChange(value as Language)}>
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(languageNames) as Language[]).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {languageNames[lang]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Theme Settings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.theme}
              </Label>
              <div className="flex gap-1">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = theme === option.value;
                  return (
                    <Tooltip key={option.value}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            setTheme(option.value);
                            toast.success(`${t.themeSetTo} ${option.label}`);
                          }}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary hover:bg-secondary/80 text-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-xs">{option.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{option.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Sound Settings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.sound}
              </Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-primary" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm">{t.notificationSound}</span>
                </div>
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={onSoundToggle}
                />
              </div>
            </div>

            <Separator />

            {/* Notification Preferences */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.notificationTypes}
              </Label>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">{t.ticketReplies}</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.ticket_reply}
                    onCheckedChange={(v) => handleNotificationPrefChange("ticket_reply", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span className="text-sm">{t.balanceUpdates}</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.balance_update}
                    onCheckedChange={(v) => handleNotificationPrefChange("balance_update", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">{t.systemAnnouncements}</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.system}
                    onCheckedChange={(v) => handleNotificationPrefChange("system", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">{t.topupAlerts}</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.topup}
                    onCheckedChange={(v) => handleNotificationPrefChange("topup", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">{t.broadcastAnnouncements}</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.announcement}
                    onCheckedChange={(v) => handleNotificationPrefChange("announcement", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-sm">Spending Alerts</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.spending_alert}
                    onCheckedChange={(v) => handleNotificationPrefChange("spending_alert", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Live Card Sound</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.live_card_sound}
                    onCheckedChange={(v) => handleNotificationPrefChange("live_card_sound", v)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Email Notification Preferences */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Control which emails you receive from Yunchi
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">Broadcast Emails</span>
                  </div>
                  <Switch
                    checked={emailPrefs.email_announcements}
                    onCheckedChange={(v) => handleEmailPrefChange("email_announcements", v)}
                    disabled={!emailPrefsLoaded}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Top-up Status Emails</span>
                  </div>
                  <Switch
                    checked={emailPrefs.email_topup_status}
                    onCheckedChange={(v) => handleEmailPrefChange("email_topup_status", v)}
                    disabled={!emailPrefsLoaded}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Ticket Reply Emails</span>
                  </div>
                  <Switch
                    checked={emailPrefs.email_ticket_replies}
                    onCheckedChange={(v) => handleEmailPrefChange("email_ticket_replies", v)}
                    disabled={!emailPrefsLoaded}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm">Credit Addition Emails</span>
                  </div>
                  <Switch
                    checked={emailPrefs.email_credit_additions}
                    onCheckedChange={(v) => handleEmailPrefChange("email_credit_additions", v)}
                    disabled={!emailPrefsLoaded}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Deactivate Account */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t.dangerZone}
              </Label>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDeactivateClick}
              >
                <UserX className="h-4 w-4 mr-2" />
                {t.deactivateAccount}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t.permanentlyDeleteAccount}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t.deactivateAccountQuestion}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deactivateWarning}
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{t.profileInfo}</li>
                <li>{t.balanceHistory}</li>
                <li>{t.supportTickets}</li>
                <li>{t.allNotifications}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDeactivation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.yesContinue}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SettingsDropdown;
