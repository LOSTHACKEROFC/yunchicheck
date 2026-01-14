import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageCircle, CheckCircle, Clock, ExternalLink, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  telegramChatId: z.string().min(1, "Telegram Chat ID is required"),
});

type RegistrationStep = "telegram" | "verification" | "details";

const VERIFICATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

const Auth = () => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Registration step state
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>("telegram");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationExpiry, setVerificationExpiry] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          navigate("/dashboard");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Countdown timer for verification
  useEffect(() => {
    if (!verificationExpiry || isVerified) return;

    const interval = setInterval(() => {
      const remaining = verificationExpiry.getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemaining(0);
        clearInterval(interval);
        toast.error("Verification expired. Please request a new one.");
        setRegistrationStep("telegram");
        setVerificationCode("");
        setVerificationExpiry(null);
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [verificationExpiry, isVerified]);

  // Poll for verification status using realtime
  useEffect(() => {
    if (registrationStep !== "verification" || !verificationCode || isVerified) return;

    const channel = supabase
      .channel("verification-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pending_verifications",
          filter: `verification_code=eq.${verificationCode}`,
        },
        (payload) => {
          if (payload.new && (payload.new as { verified: boolean }).verified) {
            setIsVerified(true);
            toast.success("Telegram verified! Complete your registration.");
            setRegistrationStep("details");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [registrationStep, verificationCode, isVerified]);

  // Also poll periodically as a fallback
  const checkVerificationStatus = useCallback(async () => {
    if (!verificationCode || isVerified) return;

    setCheckingVerification(true);
    try {
      const { data, error } = await supabase
        .from("pending_verifications")
        .select("verified, expires_at")
        .eq("verification_code", verificationCode)
        .single();

      if (error) {
        console.error("Error checking verification:", error);
        return;
      }

      if (data?.verified) {
        setIsVerified(true);
        toast.success("Telegram verified! Complete your registration.");
        setRegistrationStep("details");
      } else if (new Date(data.expires_at) < new Date()) {
        toast.error("Verification expired. Please request a new one.");
        setRegistrationStep("telegram");
        setVerificationCode("");
        setVerificationExpiry(null);
      }
    } finally {
      setCheckingVerification(false);
    }
  }, [verificationCode, isVerified]);

  useEffect(() => {
    if (registrationStep !== "verification" || isVerified) return;

    const interval = setInterval(checkVerificationStatus, 3000);
    return () => clearInterval(interval);
  }, [registrationStep, isVerified, checkVerificationStatus]);

  const handleSendVerification = async () => {
    if (!telegramChatId.trim()) {
      toast.error("Please enter your Telegram Chat ID");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("send-telegram-verification", {
        body: { telegramChatId: telegramChatId.trim(), email },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send verification");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setVerificationCode(response.data.verificationCode);
      setVerificationExpiry(new Date(response.data.expiresAt));
      setTimeRemaining(VERIFICATION_TIMEOUT);
      setRegistrationStep("verification");
      toast.success("Verification sent to your Telegram!");
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to send verification");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
        
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success(t.loginSuccessful);
      } else {
        signupSchema.parse({ email, password, username, telegramChatId });
        
        // Verify that the Telegram verification is complete
        if (!isVerified) {
          toast.error("Please complete Telegram verification first");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { username },
          },
        });
        if (error) throw error;
        
        // Update the profile with telegram_chat_id after signup
        if (data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ telegram_chat_id: telegramChatId })
            .eq("user_id", data.user.id);
          
          if (profileError) {
            console.error("Error updating profile with Telegram Chat ID:", profileError);
          }

          // Clean up the pending verification
          await supabase
            .from("pending_verifications")
            .delete()
            .eq("verification_code", verificationCode);
        }
        
        toast.success(t.registrationSuccessful);
      }
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else if (error instanceof Error) {
        toast.error(error.message || "An error occurred");
      } else {
        toast.error("An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercentage = (timeRemaining / VERIFICATION_TIMEOUT) * 100;

  const resetRegistration = () => {
    setRegistrationStep("telegram");
    setVerificationCode("");
    setVerificationExpiry(null);
    setIsVerified(false);
    setTimeRemaining(0);
  };

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    resetRegistration();
  };

  const renderRegistrationStep = () => {
    if (registrationStep === "telegram") {
      return (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <MessageCircle className="h-12 w-12 mx-auto text-primary" />
            <h3 className="font-semibold text-lg">Step 1: Connect Telegram</h3>
            <p className="text-sm text-muted-foreground">
              First, start our Support Bot on Telegram, then enter your Chat ID
            </p>
          </div>

          <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium">How to get your Chat ID:</p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Click the button below to open our Telegram bot</li>
              <li>Press "Start" in the bot chat</li>
              <li>The bot will display your Chat ID</li>
              <li>Copy and paste it here</li>
            </ol>
            <a
              href="https://t.me/YunchiSupportbot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Open @YunchiSupportbot
            </a>
          </div>

          <div className="space-y-2">
            <Label htmlFor="telegramChatId" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              {t.telegramChatId} *
            </Label>
            <Input
              id="telegramChatId"
              type="text"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder={t.enterTelegramChatId}
              className="bg-secondary border-border"
              required
            />
          </div>

          <Button
            type="button"
            className="w-full btn-primary"
            onClick={handleSendVerification}
            disabled={loading || !telegramChatId.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Verification"
            )}
          </Button>
        </div>
      );
    }

    if (registrationStep === "verification") {
      return (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <Clock className="h-12 w-12 mx-auto text-yellow-500" />
            <h3 className="font-semibold text-lg">Step 2: Verify in Telegram</h3>
            <p className="text-sm text-muted-foreground">
              Click the verification button in the Telegram message
            </p>
          </div>

          <div className="bg-secondary/50 rounded-lg p-4 space-y-3 text-center">
            <p className="text-sm">Verification sent to Chat ID:</p>
            <p className="font-mono text-lg font-bold">{telegramChatId}</p>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-yellow-500">
                <Clock className="h-4 w-4" />
                <span className="font-mono text-lg">{formatTime(timeRemaining)}</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
              <p className="text-xs text-muted-foreground">Time remaining</p>
            </div>

            {checkingVerification && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Waiting for verification...</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={resetRegistration}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleSendVerification}
              disabled={loading}
            >
              Resend
            </Button>
          </div>
        </div>
      );
    }

    // Details step
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
          <h3 className="font-semibold text-lg">Step 3: Complete Registration</h3>
          <p className="text-sm text-muted-foreground">
            Telegram verified! Enter your account details
          </p>
        </div>

        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm text-green-500">Telegram verified: {telegramChatId}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t.username}</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.enterUsername}
              className="bg-secondary border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t.email}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.enterEmail}
              className="bg-secondary border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.password}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.enterPassword}
              className="bg-secondary border-border"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t.loading}
              </>
            ) : (
              t.signUp
            )}
          </Button>
        </form>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-primary mb-2">
            Yunchi Checker
          </h1>
          <p className="text-muted-foreground">
            {isLogin ? t.signInToAccount : t.createAccount}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-card">
          {isLogin ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t.email}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.enterEmail}
                  className="bg-secondary border-border"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t.password}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.enterPassword}
                  className="bg-secondary border-border"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full btn-primary"
                disabled={loading}
              >
                {loading ? t.loading : t.signIn}
              </Button>
            </form>
          ) : (
            renderRegistrationStep()
          )}

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleToggleMode}
              className="text-primary hover:underline text-sm"
            >
              {isLogin ? t.dontHaveAccount : t.alreadyHaveAccount}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
