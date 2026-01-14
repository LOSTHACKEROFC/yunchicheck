import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageCircle } from "lucide-react";

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

const Auth = () => {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
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
            )}

            {!isLogin && (
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
                <p className="text-xs text-muted-foreground">
                  {t.telegramChatIdRequired}
                </p>
              </div>
            )}

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
              {loading ? t.loading : isLogin ? t.signIn : t.signUp}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
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
