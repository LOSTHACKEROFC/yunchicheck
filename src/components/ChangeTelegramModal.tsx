import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { MessageCircle, Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

interface ChangeTelegramModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTelegramId: string;
  onSuccess: (newChatId: string) => void;
}

type Step = "enter_id" | "verify" | "success";

const ChangeTelegramModal = ({
  open,
  onOpenChange,
  currentTelegramId,
  onSuccess,
}: ChangeTelegramModalProps) => {
  const [step, setStep] = useState<Step>("enter_id");
  const [newTelegramId, setNewTelegramId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [serverCode, setServerCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [checkingVerification, setCheckingVerification] = useState(false);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("enter_id");
        setNewTelegramId("");
        setVerificationCode("");
        setServerCode("");
        setIsAvailable(null);
        setExpiresAt(null);
        setCountdown(0);
      }, 300);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateCountdown = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        toast.error("Verification code expired. Please try again.");
        setStep("enter_id");
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Check verification status automatically
  useEffect(() => {
    if (step !== "verify" || !serverCode) return;

    const checkVerification = async () => {
      setCheckingVerification(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-verification-status", {
          body: { verification_code: serverCode },
        });

        if (error) {
          console.error("Error checking verification:", error);
          return;
        }

        if (data.verified && !data.expired) {
          // Auto-fill the verification code
          setVerificationCode(serverCode);
        }
      } catch (error) {
        console.error("Error checking verification status:", error);
      } finally {
        setCheckingVerification(false);
      }
    };

    const interval = setInterval(checkVerification, 3000);
    return () => clearInterval(interval);
  }, [step, serverCode]);

  // Check availability as user types
  useEffect(() => {
    if (!newTelegramId || newTelegramId.length < 5) {
      setIsAvailable(null);
      return;
    }

    // Don't check if it's the same as current
    if (newTelegramId === currentTelegramId) {
      setIsAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingAvailability(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-telegram-availability", {
          body: { telegramChatId: newTelegramId },
        });

        if (error) {
          console.error("Error checking availability:", error);
          setIsAvailable(null);
          return;
        }

        setIsAvailable(data.available);
      } catch (error) {
        console.error("Error checking availability:", error);
        setIsAvailable(null);
      } finally {
        setCheckingAvailability(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [newTelegramId, currentTelegramId]);

  const handleSendVerification = async () => {
    if (!newTelegramId || !/^\d+$/.test(newTelegramId)) {
      toast.error("Please enter a valid Telegram Chat ID (numbers only)");
      return;
    }

    if (newTelegramId === currentTelegramId) {
      toast.error("This is already your current Telegram ID");
      return;
    }

    if (isAvailable === false) {
      toast.error("This Telegram ID is already linked to another account");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke("send-telegram-verification", {
        body: { 
          telegramChatId: newTelegramId,
          email: user?.email,
        },
      });

      if (error) {
        toast.error(error.message || "Failed to send verification");
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setServerCode(data.verificationCode);
      setExpiresAt(new Date(data.expiresAt));
      setStep("verify");
      toast.success("Verification sent to your new Telegram account!");
    } catch (error) {
      console.error("Error sending verification:", error);
      toast.error("Failed to send verification. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast.error("Please enter the complete 6-character code");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("User session not found. Please log in again.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("change-telegram-id", {
        body: {
          verification_code: verificationCode.toUpperCase(),
          new_telegram_chat_id: newTelegramId,
          user_id: user.id,
        },
      });

      if (error) {
        toast.error(error.message || "Verification failed");
        return;
      }

      if (!data.success) {
        toast.error(data.error || "Verification failed");
        return;
      }

      setStep("success");
      toast.success("Telegram ID changed successfully!");
      onSuccess(newTelegramId);
      
      // Close modal after showing success
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error("Error verifying:", error);
      toast.error("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setVerificationCode("");
    await handleSendVerification();
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            {step === "success" ? "Success!" : "Change Telegram ID"}
          </DialogTitle>
          <DialogDescription>
            {step === "enter_id" && "Enter your new Telegram Chat ID to link it to your account."}
            {step === "verify" && "Verify ownership by entering the code sent to your new Telegram."}
            {step === "success" && "Your Telegram ID has been updated successfully."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "enter_id" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="newTelegramId">New Telegram Chat ID</Label>
                <div className="relative">
                  <Input
                    id="newTelegramId"
                    value={newTelegramId}
                    onChange={(e) => setNewTelegramId(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter your new Chat ID"
                    className="pr-10"
                    disabled={loading}
                  />
                  {checkingAvailability && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!checkingAvailability && isAvailable === true && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                  {!checkingAvailability && isAvailable === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {isAvailable === false && (
                  <p className="text-xs text-destructive">This Telegram ID is already linked to another account</p>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-1">How to get your Chat ID:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Open Telegram and search for <span className="text-primary">@YunchiSupportbot</span></li>
                  <li>Click "Start" to initialize the bot</li>
                  <li>Send the command <code className="bg-muted px-1 rounded">/id</code></li>
                  <li>Copy the numeric ID shown</li>
                </ol>
                <a
                  href="https://t.me/YunchiSupportbot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline mt-2"
                >
                  Open Bot <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendVerification}
                  disabled={loading || !newTelegramId || isAvailable === false || newTelegramId === currentTelegramId}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Verification"
                  )}
                </Button>
              </div>
            </>
          )}

          {step === "verify" && (
            <>
              <div className="text-center space-y-4">
                <div className="bg-primary/10 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    A verification message was sent to:
                  </p>
                  <p className="font-mono text-lg font-bold text-primary">{newTelegramId}</p>
                </div>

                {countdown > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Code expires in <span className="font-mono text-primary">{formatCountdown(countdown)}</span>
                  </p>
                )}

                <div className="space-y-2">
                  <Label>Enter Verification Code</Label>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={verificationCode}
                      onChange={(value) => setVerificationCode(value.toUpperCase())}
                      disabled={loading}
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
                  </div>
                  {checkingVerification && (
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking for verification...
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Click the "Verify" button in Telegram or enter the code manually
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("enter_id")}
                  disabled={loading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={loading || verificationCode.length !== 6}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & Update"
                  )}
                </Button>
              </div>

              {countdown > 0 && countdown < 60 && (
                <Button
                  variant="ghost"
                  onClick={handleResend}
                  disabled={loading}
                  className="w-full text-sm"
                >
                  Resend Verification Code
                </Button>
              )}
            </>
          )}

          {step === "success" && (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <p className="text-muted-foreground">
                Your Telegram ID has been updated to:
              </p>
              <p className="font-mono text-lg font-bold text-primary mt-2">{newTelegramId}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeTelegramModal;
