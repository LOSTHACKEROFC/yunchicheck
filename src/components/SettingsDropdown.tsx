import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Volume2, VolumeX, UserX, Sun, Moon, Monitor, Bell, MessageSquare, DollarSign, Megaphone, Globe, Radio, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
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

interface NotificationPreferences {
  ticket_reply: boolean;
  balance_update: boolean;
  system: boolean;
  topup: boolean;
  announcement: boolean;
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
};

const SettingsDropdown = ({ soundEnabled, onSoundToggle }: SettingsDropdownProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);
  const [otp, setOtp] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(() => {
    const saved = localStorage.getItem("notification-preferences");
    return saved ? JSON.parse(saved) : defaultNotificationPrefs;
  });

  // Save notification preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("notification-preferences", JSON.stringify(notificationPrefs));
  }, [notificationPrefs]);

  const resetDeactivation = () => {
    setConfirmStep(0);
    setOtp("");
  };

  const handleDeactivateClick = () => {
    setConfirmStep(1);
  };

  const handleFirstConfirm = async () => {
    setConfirmStep(2);
    // Send OTP to email immediately
    await sendDeletionOtp();
  };

  const sendDeletionOtp = async () => {
    setIsSendingOtp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-deletion-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      toast.success("Verification code sent to your email");
    } catch (error: unknown) {
      console.error("Error sending OTP:", error);
      toast.error(error instanceof Error ? error.message : "Failed to send verification code");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const verifyAndDeleteAccount = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-deletion-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ otp }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code");
      }

      // Account deleted successfully - sign out and redirect
      await supabase.auth.signOut();
      toast.success("Your account has been permanently deleted");
      navigate("/");
    } catch (error: unknown) {
      console.error("Error deleting account:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
      resetDeactivation();
    }
  };

  const handleNotificationPrefChange = (key: keyof NotificationPreferences, value: boolean) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: value }));
    toast.success(`${key.replace("_", " ")} ${value ? t.notificationsEnabled : t.notificationsDisabled}`);
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
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        // Don't reset deactivation if a dialog step is active
        if (!isOpen && confirmStep === 0) resetDeactivation();
      }}>
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

      {/* First Confirmation Dialog */}
      <AlertDialog open={confirmStep === 1} onOpenChange={(isOpen) => !isOpen && resetDeactivation()}>
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
            <AlertDialogCancel onClick={resetDeactivation}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFirstConfirm}
              disabled={isSendingOtp}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSendingOtp ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Code...
                </>
              ) : (
                t.yesContinue
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email OTP Verification Dialog */}
      <AlertDialog open={confirmStep === 2} onOpenChange={(isOpen) => !isOpen && resetDeactivation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Mail className="h-5 w-5" />
              Verify Your Email
            </AlertDialogTitle>
            <AlertDialogDescription>
              We've sent a 6-digit verification code to your email. Enter it below to permanently delete your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col items-center gap-4 py-6">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <button
              type="button"
              onClick={sendDeletionOtp}
              disabled={isSendingOtp}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isSendingOtp ? "Sending..." : "Didn't receive the code? Resend"}
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetDeactivation}>{t.cancel}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={verifyAndDeleteAccount}
              disabled={isDeleting || otp.length !== 6}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting Account...
                </>
              ) : (
                "Verify & Delete Account"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SettingsDropdown;
