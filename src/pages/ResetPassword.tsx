import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, CheckCircle, Eye, EyeOff, KeyRound } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Password strength state
  const [passwordStrength, setPasswordStrength] = useState<"weak" | "medium" | "strong" | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<string[]>([]);

  // Check if user has a valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // If no session or no recovery token, redirect to auth
      if (!session) {
        // Check if we have the required hash params from the reset link
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get("type");
        
        if (type !== "recovery") {
          toast.error("Invalid or expired reset link");
          navigate("/auth");
        }
      }
    };

    checkSession();
  }, [navigate]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      toast.success("Password updated successfully!");
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to update password");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-display font-bold text-primary mb-2">
              Yunchi Checker
            </h1>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 shadow-card text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Password Updated!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your password has been successfully changed.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-primary mb-2">
            Yunchi Checker
          </h1>
          <p className="text-muted-foreground">
            Set your new password
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center space-y-2 mb-4">
              <KeyRound className="h-12 w-12 mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">
                Enter your new password below.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  placeholder="Enter new password"
                  className="bg-secondary border-border pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className={`bg-secondary border-border pr-10 ${
                    confirmPassword && password !== confirmPassword
                      ? "border-red-500 focus-visible:ring-red-500"
                      : confirmPassword && password === confirmPassword
                      ? "border-green-500 focus-visible:ring-green-500"
                      : ""
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-red-500">Passwords do not match</p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p className="text-sm text-green-500">Passwords match!</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full btn-primary"
              disabled={loading || password !== confirmPassword || !password}
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
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
