import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Volume2, VolumeX, UserX, Sun, Moon, Monitor, Bell, MessageSquare, DollarSign, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface NotificationPreferences {
  ticket_reply: boolean;
  balance_update: boolean;
  system: boolean;
  topup: boolean;
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
};

const SettingsDropdown = ({ soundEnabled, onSoundToggle }: SettingsDropdownProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
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
    setEmail("");
    setPassword("");
  };

  const handleDeactivateClick = () => {
    setConfirmStep(1);
  };

  const handleFirstConfirm = () => {
    setConfirmStep(2);
  };

  const handleSecondConfirm = () => {
    setConfirmStep(3);
  };

  const handleNotificationPrefChange = (key: keyof NotificationPreferences, value: boolean) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: value }));
    toast.success(`${key.replace("_", " ")} notifications ${value ? "enabled" : "disabled"}`);
  };

  const handleFinalDeactivation = async () => {
    if (!email || !password) {
      toast.error("Please enter your email and password");
      return;
    }

    setIsDeleting(true);

    try {
      // Verify credentials by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        toast.error("Invalid credentials. Please check your email and password.");
        setIsDeleting(false);
        return;
      }

      // Call edge function to delete account
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete account");
      }

      // Sign out and redirect
      await supabase.auth.signOut();
      toast.success("Your account has been deleted successfully");
      navigate("/");
    } catch (error: unknown) {
      console.error("Error deleting account:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
      resetDeactivation();
    }
  };

  const themeOptions = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];

  return (
    <>
      <Popover open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetDeactivation();
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
            <h4 className="font-semibold text-sm">Settings</h4>
          </div>

          <div className="p-3 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Theme Settings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Theme
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
                            toast.success(`Theme set to ${option.label}`);
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
                      <TooltipContent>{option.label} mode</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Sound Settings */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sound
              </Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-primary" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm">Notification Sound</span>
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
                Notification Types
              </Label>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Ticket Replies</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.ticket_reply}
                    onCheckedChange={(v) => handleNotificationPrefChange("ticket_reply", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Balance Updates</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.balance_update}
                    onCheckedChange={(v) => handleNotificationPrefChange("balance_update", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">System Announcements</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.system}
                    onCheckedChange={(v) => handleNotificationPrefChange("system", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Topup Alerts</span>
                  </div>
                  <Switch
                    checked={notificationPrefs.topup}
                    onCheckedChange={(v) => handleNotificationPrefChange("topup", v)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Deactivate Account */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Danger Zone
              </Label>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleDeactivateClick}
              >
                <UserX className="h-4 w-4 mr-2" />
                Deactivate Account
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Permanently delete your account and all data.
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* First Confirmation Dialog */}
      <AlertDialog open={confirmStep === 1} onOpenChange={(isOpen) => !isOpen && resetDeactivation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Deactivate Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate your account? This action will permanently delete all your data including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Your profile information</li>
                <li>Your balance and transaction history</li>
                <li>All support tickets and messages</li>
                <li>All notifications</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetDeactivation}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleFirstConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second Confirmation Dialog */}
      <AlertDialog open={confirmStep === 2} onOpenChange={(isOpen) => !isOpen && resetDeactivation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Final Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This is your last chance to cancel. Once you proceed, your account will be permanently deleted and <strong>cannot be recovered</strong>.
              <br /><br />
              Are you absolutely sure you want to delete your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetDeactivation}>No, Keep My Account</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSecondConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Delete My Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credentials Verification Dialog */}
      <AlertDialog open={confirmStep === 3} onOpenChange={(isOpen) => !isOpen && resetDeactivation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Verify Your Identity</AlertDialogTitle>
            <AlertDialogDescription>
              Please enter your email and password to confirm account deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-email">Email</Label>
              <Input
                id="confirm-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resetDeactivation}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleFinalDeactivation}
              disabled={isDeleting || !email || !password}
            >
              {isDeleting ? "Deleting..." : "Delete Account Permanently"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SettingsDropdown;
