import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Loader2, AlertTriangle, ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";

const VerifyDeactivation = () => {
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuthAndSendOtp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in to continue");
        navigate("/auth");
        return;
      }

      setUserEmail(session.user.email || null);
      setIsLoading(false);
      
      // Send OTP on page load
      await sendDeletionOtp();
    };

    checkAuthAndSendOtp();
  }, [navigate]);

  const sendDeletionOtp = async () => {
    setIsSendingOtp(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again");
        navigate("/auth");
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
        navigate("/auth");
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
    }
  };

  const handleCancel = () => {
    navigate("/dashboard");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl text-destructive">Verify Account Deletion</CardTitle>
          <CardDescription className="space-y-2">
            <p>We've sent a 6-digit verification code to:</p>
            <p className="font-medium text-foreground">{userEmail}</p>
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Warning Box */}
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm text-destructive">
                <p className="font-medium mb-1">This action cannot be undone</p>
                <p className="text-destructive/80">All your data will be permanently deleted including your profile, balance history, and support tickets.</p>
              </div>
            </div>
          </div>

          {/* OTP Input */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Enter verification code</span>
            </div>
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
              {isSendingOtp ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sending...
                </span>
              ) : (
                "Didn't receive the code? Resend"
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              variant="destructive"
              onClick={verifyAndDeleteAccount}
              disabled={isDeleting || otp.length !== 6}
              className="w-full"
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
            
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isDeleting}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel & Go Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyDeactivation;
