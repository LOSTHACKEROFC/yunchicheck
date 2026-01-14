import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageCircle, CheckCircle, Clock, ExternalLink, Loader2, XCircle, AlertCircle, ArrowLeft, Mail } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").max(30, "Username must be at most 30 characters").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  telegramChatId: z.string().min(1, "Telegram Chat ID is required"),
});

type RegistrationStep = "telegram" | "verification" | "details";

const VERIFICATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds

const Auth = () => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetOtpSent, setResetOtpSent] = useState(false);
  const [resetOtp, setResetOtp] = useState("");
  const [resetOtpVerified, setResetOtpVerified] = useState(false);
  const [resetOtpExpiry, setResetOtpExpiry] = useState<Date | null>(null);
  const [resetTimeRemaining, setResetTimeRemaining] = useState(0);
  const [hasTelegramForReset, setHasTelegramForReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetPasswordStrength, setResetPasswordStrength] = useState<"weak" | "medium" | "strong" | null>(null);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState<string[]>([]);
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

  // Username availability state
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameError, setUsernameError] = useState<string>("");
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // Email availability state
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [emailError, setEmailError] = useState<string>("");
  const emailCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // Password strength state
  const [passwordStrength, setPasswordStrength] = useState<"weak" | "medium" | "strong" | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<string[]>([]);

  // Telegram ID availability state
  const [telegramIdStatus, setTelegramIdStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [telegramIdError, setTelegramIdError] = useState<string>("");
  const telegramIdCheckTimeout = useRef<NodeJS.Timeout | null>(null);

  // Telegram profile state
  const [telegramProfile, setTelegramProfile] = useState<{
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  } | null>(null);
  const [fetchingProfile, setFetchingProfile] = useState(false);

  // Fetch Telegram profile after verification
  const fetchTelegramProfile = useCallback(async () => {
    if (!telegramChatId) return;
    
    setFetchingProfile(true);
    try {
      const response = await supabase.functions.invoke("get-telegram-profile", {
        body: { chat_id: telegramChatId },
      });

      if (response.error) {
        console.error("Error fetching Telegram profile:", response.error);
      } else if (response.data) {
        setTelegramProfile(response.data);
      }
    } catch (error) {
      console.error("Error fetching Telegram profile:", error);
    } finally {
      setFetchingProfile(false);
      setRegistrationStep("details");
    }
  }, [telegramChatId]);

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
            toast.success("Telegram verified! Fetching your profile...");
            fetchTelegramProfile();
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
        toast.success("Telegram verified! Fetching your profile...");
        fetchTelegramProfile();
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

  // Real-time username availability check
  const checkUsernameAvailability = useCallback(async (usernameToCheck: string) => {
    // Validate format first
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(usernameToCheck)) {
      setUsernameStatus("invalid");
      setUsernameError("Only letters, numbers, and underscores allowed");
      return;
    }

    if (usernameToCheck.length < 3) {
      setUsernameStatus("invalid");
      setUsernameError("Username must be at least 3 characters");
      return;
    }

    if (usernameToCheck.length > 30) {
      setUsernameStatus("invalid");
      setUsernameError("Username must be at most 30 characters");
      return;
    }

    setUsernameStatus("checking");
    setUsernameError("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", usernameToCheck.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error("Error checking username:", error);
        setUsernameStatus("idle");
        return;
      }

      if (data) {
        setUsernameStatus("taken");
        setUsernameError("This username is already taken");
      } else {
        setUsernameStatus("available");
        setUsernameError("");
      }
    } catch (error) {
      console.error("Error checking username:", error);
      setUsernameStatus("idle");
    }
  }, []);

  // Debounced username check
  const handleUsernameChange = (value: string) => {
    setUsername(value);
    
    // Clear previous timeout
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Reset status if empty
    if (!value.trim()) {
      setUsernameStatus("idle");
      setUsernameError("");
      return;
    }

    // Debounce the check
    usernameCheckTimeout.current = setTimeout(() => {
      checkUsernameAvailability(value.trim());
    }, 500);
  };

  // Real-time email availability check
  const checkEmailAvailability = useCallback(async (emailToCheck: string) => {
    // Validate format first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToCheck)) {
      setEmailStatus("invalid");
      setEmailError("Please enter a valid email address");
      return;
    }

    setEmailStatus("checking");
    setEmailError("");

    try {
      const response = await supabase.functions.invoke("check-email-availability", {
        body: { email: emailToCheck.toLowerCase() },
      });

      if (response.error) {
        console.error("Error checking email:", response.error);
        setEmailStatus("idle");
        return;
      }

      if (response.data?.available === false) {
        setEmailStatus("taken");
        setEmailError("This email is already registered");
      } else if (response.data?.available === true) {
        setEmailStatus("available");
        setEmailError("");
      } else {
        setEmailStatus("idle");
      }
    } catch (error) {
      console.error("Error checking email:", error);
      setEmailStatus("idle");
    }
  }, []);

  // Debounced email check
  const handleEmailChange = (value: string) => {
    setEmail(value);
    
    // Clear previous timeout
    if (emailCheckTimeout.current) {
      clearTimeout(emailCheckTimeout.current);
    }

    // Reset status if empty
    if (!value.trim()) {
      setEmailStatus("idle");
      setEmailError("");
      return;
    }

    // Debounce the check
    emailCheckTimeout.current = setTimeout(() => {
      checkEmailAvailability(value.trim());
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
      if (emailCheckTimeout.current) {
        clearTimeout(emailCheckTimeout.current);
      }
      if (telegramIdCheckTimeout.current) {
        clearTimeout(telegramIdCheckTimeout.current);
      }
    };
  }, []);

  // Check if Telegram ID is already registered using edge function (bypasses RLS)
  const checkTelegramIdAvailability = useCallback(async (chatId: string) => {
    // Only check if it looks like a valid chat ID (numeric)
    if (!/^\d+$/.test(chatId)) {
      setTelegramIdStatus("idle");
      setTelegramIdError("");
      return;
    }

    setTelegramIdStatus("checking");
    setTelegramIdError("");

    try {
      const response = await supabase.functions.invoke("check-telegram-availability", {
        body: { telegramChatId: chatId },
      });

      if (response.error) {
        console.error("Error checking Telegram ID:", response.error);
        setTelegramIdStatus("idle");
        return;
      }

      if (response.data?.available === false) {
        setTelegramIdStatus("taken");
        setTelegramIdError(response.data.message || "This Telegram ID is already linked to another account");
      } else if (response.data?.available === true) {
        setTelegramIdStatus("available");
        setTelegramIdError("");
      } else {
        setTelegramIdStatus("idle");
      }
    } catch (error) {
      console.error("Error checking Telegram ID:", error);
      setTelegramIdStatus("idle");
    }
  }, []);

  // Debounced Telegram ID check
  const handleTelegramIdChange = (value: string) => {
    setTelegramChatId(value);
    
    // Clear previous timeout
    if (telegramIdCheckTimeout.current) {
      clearTimeout(telegramIdCheckTimeout.current);
    }

    // Reset status if empty
    if (!value.trim()) {
      setTelegramIdStatus("idle");
      setTelegramIdError("");
      return;
    }

    // Debounce the check
    telegramIdCheckTimeout.current = setTimeout(() => {
      checkTelegramIdAvailability(value.trim());
    }, 500);
  };

  const getTelegramIdStatusIcon = () => {
    switch (telegramIdStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "available":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "taken":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getEmailStatusIcon = () => {
    switch (emailStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "available":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "taken":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "invalid":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Password strength calculation
  const calculatePasswordStrength = (pwd: string): { strength: "weak" | "medium" | "strong"; feedback: string[] } => {
    const feedback: string[] = [];
    let score = 0;

    if (pwd.length >= 8) {
      score += 1;
    } else {
      feedback.push("Use at least 8 characters");
    }

    if (pwd.length >= 12) {
      score += 1;
    }

    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) {
      score += 1;
    } else {
      feedback.push("Mix uppercase and lowercase letters");
    }

    if (/\d/.test(pwd)) {
      score += 1;
    } else {
      feedback.push("Add at least one number");
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      score += 1;
    } else {
      feedback.push("Add a special character (!@#$%^&*)");
    }

    let strength: "weak" | "medium" | "strong";
    if (score <= 2) {
      strength = "weak";
    } else if (score <= 4) {
      strength = "medium";
    } else {
      strength = "strong";
    }

    return { strength, feedback };
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (value) {
      const { strength, feedback } = calculatePasswordStrength(value);
      setPasswordStrength(strength);
      setPasswordFeedback(feedback);
    } else {
      setPasswordStrength(null);
      setPasswordFeedback([]);
    }
  };

  const handleSendVerification = async () => {
    if (!telegramChatId.trim()) {
      toast.error("Please enter your Telegram Chat ID");
      return;
    }

    // Check if Telegram ID is already registered
    if (telegramIdStatus === "taken") {
      toast.error("This Telegram ID is already registered. Please use a different one.");
      return;
    }

    if (telegramIdStatus !== "available") {
      toast.error("Please wait for Telegram ID verification");
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

  // Countdown timer for password reset OTP
  useEffect(() => {
    if (!resetOtpExpiry || resetOtpVerified) return;

    const interval = setInterval(() => {
      const remaining = resetOtpExpiry.getTime() - Date.now();
      if (remaining <= 0) {
        setResetTimeRemaining(0);
        clearInterval(interval);
        toast.error("OTP expired. Please request a new one.");
        setResetOtpSent(false);
        setResetOtp("");
        setResetOtpExpiry(null);
      } else {
        setResetTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [resetOtpExpiry, resetOtpVerified]);

  const handleResetPasswordChange = (value: string) => {
    setNewPassword(value);
    if (value) {
      const { strength, feedback } = calculatePasswordStrength(value);
      setResetPasswordStrength(strength);
      setResetPasswordFeedback(feedback);
    } else {
      setResetPasswordStrength(null);
      setResetPasswordFeedback([]);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("send-password-reset-otp", {
        body: { email: email.trim() },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to send OTP");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setResetOtpSent(true);
      setHasTelegramForReset(response.data?.hasTelegram || false);
      setResetOtpExpiry(new Date(response.data.expiresAt));
      setResetTimeRemaining(2 * 60 * 1000); // 2 minutes
      toast.success("OTP sent! Check your email" + (response.data?.hasTelegram ? " and Telegram" : ""));
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to send OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!resetOtp.trim() || resetOtp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("verify-password-reset-otp", {
        body: { email: email.trim(), otp: resetOtp.trim() },
      });

      if (response.error) {
        throw new Error(response.error.message || "Invalid OTP");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (response.data?.verified) {
        setResetOtpVerified(true);
        toast.success("OTP verified! Set your new password.");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to verify OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const response = await supabase.functions.invoke("verify-password-reset-otp", {
        body: { 
          email: email.trim(), 
          otp: resetOtp.trim(),
          newPassword: newPassword
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to reset password");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success("Password updated successfully!");
      
      // Auto-login with new password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: newPassword,
      });

      if (signInError) {
        toast.info("Password updated! Please login with your new password.");
        handleBackToLogin();
      } else {
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to reset password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setShowForgotPassword(false);
    setResetOtpSent(false);
    setResetOtp("");
    setResetOtpVerified(false);
    setResetOtpExpiry(null);
    setResetTimeRemaining(0);
    setNewPassword("");
    setConfirmNewPassword("");
    setResetPasswordStrength(null);
    setResetPasswordFeedback([]);
    setHasTelegramForReset(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
        
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // Check if user is banned
        if (signInData.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("is_banned, ban_reason, banned_until")
            .eq("user_id", signInData.user.id)
            .maybeSingle();
          
          if (profile?.is_banned) {
            // Sign out the banned user immediately
            await supabase.auth.signOut();
            // Store ban info and redirect to banned page
            localStorage.setItem("banReason", profile.ban_reason || "");
            localStorage.setItem("bannedEmail", email);
            localStorage.setItem("bannedUntil", profile.banned_until || "");
            navigate(`/banned?reason=${encodeURIComponent(profile.ban_reason || "")}&email=${encodeURIComponent(email)}&until=${encodeURIComponent(profile.banned_until || "")}`);
            setLoading(false);
            return;
          }
        }
        
        toast.success(t.loginSuccessful);
      } else {
        signupSchema.parse({ email, password, username, telegramChatId });
        
        // Verify that the Telegram verification is complete
        if (!isVerified) {
          toast.error("Please complete Telegram verification first");
          setLoading(false);
          return;
        }

        // Check username availability one more time before signup
        if (usernameStatus !== "available") {
          toast.error("Please choose a valid and available username");
          setLoading(false);
          return;
        }

        // Check email availability one more time before signup
        if (emailStatus !== "available") {
          toast.error("Please use a valid and available email address");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { username: username.toLowerCase() },
          },
        });
        if (error) throw error;
        
        // Update the profile with telegram info after signup
        if (data.user) {
          const profileUpdate: {
            telegram_chat_id: string;
            telegram_username?: string;
            name?: string;
          } = {
            telegram_chat_id: telegramChatId,
          };

          if (telegramProfile?.username) {
            profileUpdate.telegram_username = telegramProfile.username;
          }
          if (telegramProfile?.first_name) {
            profileUpdate.name = telegramProfile.last_name 
              ? `${telegramProfile.first_name} ${telegramProfile.last_name}`
              : telegramProfile.first_name;
          }

          const { error: profileError } = await supabase
            .from("profiles")
            .update(profileUpdate)
            .eq("user_id", data.user.id);
          
          if (profileError) {
            console.error("Error updating profile with Telegram info:", profileError);
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
    setUsernameStatus("idle");
    setUsernameError("");
    setEmailStatus("idle");
    setEmailError("");
    setTelegramIdStatus("idle");
    setTelegramIdError("");
    setTelegramProfile(null);
  };

  const getUsernameStatusIcon = () => {
    switch (usernameStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "available":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "taken":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "invalid":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
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
            <div className="relative">
              <Input
                id="telegramChatId"
                type="text"
                value={telegramChatId}
                onChange={(e) => handleTelegramIdChange(e.target.value)}
                placeholder={t.enterTelegramChatId}
                className={`bg-secondary border-border pr-10 ${
                  telegramIdStatus === "taken"
                    ? "border-red-500 focus-visible:ring-red-500"
                    : telegramIdStatus === "available"
                    ? "border-green-500 focus-visible:ring-green-500"
                    : ""
                }`}
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getTelegramIdStatusIcon()}
              </div>
            </div>
            {telegramIdError && (
              <p className="text-sm text-red-500">{telegramIdError}</p>
            )}
            {telegramIdStatus === "available" && (
              <p className="text-sm text-green-500">Telegram ID is available!</p>
            )}
          </div>

          <Button
            type="button"
            className="w-full btn-primary"
            onClick={handleSendVerification}
            disabled={loading || !telegramChatId.trim() || telegramIdStatus !== "available"}
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

        {/* Telegram Profile Card */}
        {fetchingProfile ? (
          <div className="bg-secondary/50 rounded-lg p-4 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Fetching your Telegram profile...</span>
          </div>
        ) : telegramProfile ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-4">
              {telegramProfile.photo_url ? (
                <img 
                  src={telegramProfile.photo_url} 
                  alt="Telegram profile" 
                  className="w-14 h-14 rounded-full object-cover border-2 border-green-500"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                  <MessageCircle className="h-7 w-7 text-green-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-green-500">Telegram Verified</span>
                </div>
                <p className="font-semibold truncate">
                  {telegramProfile.first_name}
                  {telegramProfile.last_name && ` ${telegramProfile.last_name}`}
                </p>
                {telegramProfile.username && (
                  <p className="text-sm text-muted-foreground truncate">@{telegramProfile.username}</p>
                )}
                <p className="text-xs text-muted-foreground font-mono">ID: {telegramChatId}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-sm text-green-500">Telegram verified: {telegramChatId}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t.username}</Label>
            <div className="relative">
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={t.enterUsername}
                className={`bg-secondary border-border pr-10 ${
                  usernameStatus === "taken" || usernameStatus === "invalid"
                    ? "border-red-500 focus-visible:ring-red-500"
                    : usernameStatus === "available"
                    ? "border-green-500 focus-visible:ring-green-500"
                    : ""
                }`}
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getUsernameStatusIcon()}
              </div>
            </div>
            {usernameError && (
              <p className="text-sm text-red-500">{usernameError}</p>
            )}
            {usernameStatus === "available" && (
              <p className="text-sm text-green-500">Username is available!</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t.email}</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder={t.enterEmail}
                className={`bg-secondary border-border pr-10 ${
                  emailStatus === "taken" || emailStatus === "invalid"
                    ? "border-red-500 focus-visible:ring-red-500"
                    : emailStatus === "available"
                    ? "border-green-500 focus-visible:ring-green-500"
                    : ""
                }`}
                required
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getEmailStatusIcon()}
              </div>
            </div>
            {emailError && (
              <p className="text-sm text-red-500">{emailError}</p>
            )}
            {emailStatus === "available" && (
              <p className="text-sm text-green-500">Email is available!</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.password}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder={t.enterPassword}
              className="bg-secondary border-border"
              required
            />
            {password && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                    passwordStrength === "weak" ? "bg-red-500" : 
                    passwordStrength === "medium" ? "bg-yellow-500" : 
                    passwordStrength === "strong" ? "bg-green-500" : "bg-muted"
                  }`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                    passwordStrength === "medium" ? "bg-yellow-500" : 
                    passwordStrength === "strong" ? "bg-green-500" : "bg-muted"
                  }`} />
                  <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                    passwordStrength === "strong" ? "bg-green-500" : "bg-muted"
                  }`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${
                    passwordStrength === "weak" ? "text-red-500" : 
                    passwordStrength === "medium" ? "text-yellow-500" : 
                    passwordStrength === "strong" ? "text-green-500" : ""
                  }`}>
                    {passwordStrength === "weak" && "Weak"}
                    {passwordStrength === "medium" && "Medium"}
                    {passwordStrength === "strong" && "Strong"}
                  </span>
                </div>
                {passwordFeedback.length > 0 && passwordStrength !== "strong" && (
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {passwordFeedback.map((tip, i) => (
                      <li key={i}>• {tip}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <Button
            type="submit"
            className="w-full btn-primary"
            disabled={loading || usernameStatus !== "available" || emailStatus !== "available"}
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
            {showForgotPassword 
              ? "Reset your password" 
              : isLogin 
                ? t.signInToAccount 
                : t.createAccount}
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-card">
          {showForgotPassword ? (
            // Forgot Password Form with OTP
            <div className="space-y-4">
              {resetOtpVerified ? (
                // New password form after OTP verification
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="text-center space-y-2 mb-4">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
                    <h3 className="font-semibold text-lg">OTP Verified!</h3>
                    <p className="text-sm text-muted-foreground">
                      Enter your new password below.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => handleResetPasswordChange(e.target.value)}
                      placeholder="Enter new password"
                      className="bg-secondary border-border"
                      required
                    />
                    {newPassword && (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                            resetPasswordStrength === "weak" ? "bg-red-500" : 
                            resetPasswordStrength === "medium" ? "bg-yellow-500" : 
                            resetPasswordStrength === "strong" ? "bg-green-500" : "bg-muted"
                          }`} />
                          <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                            resetPasswordStrength === "medium" ? "bg-yellow-500" : 
                            resetPasswordStrength === "strong" ? "bg-green-500" : "bg-muted"
                          }`} />
                          <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                            resetPasswordStrength === "strong" ? "bg-green-500" : "bg-muted"
                          }`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${
                            resetPasswordStrength === "weak" ? "text-red-500" : 
                            resetPasswordStrength === "medium" ? "text-yellow-500" : 
                            resetPasswordStrength === "strong" ? "text-green-500" : ""
                          }`}>
                            {resetPasswordStrength === "weak" && "Weak"}
                            {resetPasswordStrength === "medium" && "Medium"}
                            {resetPasswordStrength === "strong" && "Strong"}
                          </span>
                        </div>
                        {resetPasswordFeedback.length > 0 && resetPasswordStrength !== "strong" && (
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {resetPasswordFeedback.map((tip, i) => (
                              <li key={i}>• {tip}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirm Password</Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className={`bg-secondary border-border ${
                        confirmNewPassword && newPassword !== confirmNewPassword
                          ? "border-red-500"
                          : confirmNewPassword && newPassword === confirmNewPassword
                          ? "border-green-500"
                          : ""
                      }`}
                      required
                    />
                    {confirmNewPassword && newPassword !== confirmNewPassword && (
                      <p className="text-sm text-red-500">Passwords do not match</p>
                    )}
                    {confirmNewPassword && newPassword === confirmNewPassword && (
                      <p className="text-sm text-green-500">Passwords match!</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full btn-primary"
                    disabled={loading || newPassword !== confirmNewPassword || !newPassword}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      "Update Password"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Cancel
                  </button>
                </form>
              ) : resetOtpSent ? (
                // OTP verification step
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <Clock className="h-12 w-12 mx-auto text-yellow-500" />
                    <h3 className="font-semibold text-lg">Enter OTP</h3>
                    <p className="text-sm text-muted-foreground">
                      We've sent a 6-digit OTP to <span className="font-medium text-foreground">{email}</span>
                      {hasTelegramForReset && (
                        <span className="block mt-1">Also sent to your Telegram!</span>
                      )}
                    </p>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4 space-y-3 text-center">
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-yellow-500">
                        <Clock className="h-4 w-4" />
                        <span className="font-mono text-lg">{formatTime(resetTimeRemaining)}</span>
                      </div>
                      <Progress value={(resetTimeRemaining / (2 * 60 * 1000)) * 100} className="h-2" />
                      <p className="text-xs text-muted-foreground">OTP expires in 2 minutes</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="otp-input">OTP Code</Label>
                    <Input
                      id="otp-input"
                      type="text"
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit OTP"
                      className="bg-secondary border-border text-center text-2xl tracking-widest font-mono"
                      maxLength={6}
                      required
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full btn-primary"
                    onClick={handleVerifyOtp}
                    disabled={loading || resetOtp.length !== 6}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify OTP"
                    )}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleBackToLogin}
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={handleForgotPassword}
                      disabled={loading}
                    >
                      Resend OTP
                    </Button>
                  </div>
                </div>
              ) : (
                // Email input form
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="text-center space-y-2 mb-4">
                    <Mail className="h-12 w-12 mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Enter your email address and we'll send you an OTP to reset your password.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reset-email">{t.email}</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t.enterEmail}
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
                        Sending OTP...
                      </>
                    ) : (
                      "Send OTP"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Login
                  </button>
                </form>
              )}
            </div>
          ) : isLogin ? (
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t.password}</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
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

          {!showForgotPassword && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleToggleMode}
                className="text-primary hover:underline text-sm"
              >
                {isLogin ? t.dontHaveAccount : t.alreadyHaveAccount}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
