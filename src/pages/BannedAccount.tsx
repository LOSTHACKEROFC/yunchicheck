import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ban, MessageCircle, ShieldAlert, Send, ArrowLeft, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const BannedAccount = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [banReason, setBanReason] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [appealMessage, setAppealMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);

  useEffect(() => {
    // Get ban info from URL params or localStorage
    const reason = searchParams.get("reason") || localStorage.getItem("banReason");
    const user = searchParams.get("username") || localStorage.getItem("bannedUsername");
    const userEmail = searchParams.get("email") || localStorage.getItem("bannedEmail");
    
    setBanReason(reason);
    setUsername(user);
    if (userEmail) setEmail(userEmail);
  }, [searchParams]);

  const handleSubmitAppeal = () => {
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }
    if (!appealMessage.trim()) {
      toast.error("Please explain why you should be unbanned");
      return;
    }

    setIsSubmitting(true);

    // Open Telegram with pre-filled appeal message
    const fullMessage = encodeURIComponent(
      `🔓 *Ban Appeal Request*\n\n` +
      `📧 Email: ${email}\n` +
      `👤 Username: ${username || 'N/A'}\n\n` +
      `📝 *Ban Reason:*\n${banReason || 'No reason provided'}\n\n` +
      `✉️ *Appeal Message:*\n${appealMessage}\n\n` +
      `Please review my case and consider unbanning my account.`
    );
    
    window.open(`https://t.me/8496943061?text=${fullMessage}`, "_blank");
    
    setIsSubmitting(false);
    setAppealSubmitted(true);
    toast.success("Appeal request opened in Telegram");
  };

  const handleContactSupport = () => {
    window.open("https://t.me/8496943061", "_blank");
  };

  const handleBackToLogin = () => {
    // Clear stored ban info
    localStorage.removeItem("banReason");
    localStorage.removeItem("bannedUsername");
    localStorage.removeItem("bannedEmail");
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center">
            <Ban className="h-10 w-10 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Account Banned</h1>
            <p className="text-muted-foreground mt-1">
              Your account has been suspended by Support
            </p>
          </div>
        </div>

        {/* Ban Reason Card */}
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-500 text-base">
              <ShieldAlert className="h-5 w-5" />
              Ban Reason
            </CardTitle>
          </CardHeader>
          <CardContent>
            {banReason ? (
              <p className="text-foreground">{banReason}</p>
            ) : (
              <p className="text-muted-foreground italic">No reason was provided for this ban.</p>
            )}
          </CardContent>
        </Card>

        {/* Appeal Form */}
        {!appealSubmitted ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submit an Appeal</CardTitle>
              <CardDescription>
                If you believe this ban was a mistake, submit an appeal request explaining your case.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="appeal">Why should you be unbanned?</Label>
                <Textarea
                  id="appeal"
                  placeholder="Explain why you believe this ban should be lifted..."
                  value={appealMessage}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleSubmitAppeal}
                disabled={isSubmitting}
              >
                <Send className="mr-2 h-4 w-4" />
                Submit Appeal Request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="pt-6">
              <div className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Appeal Submitted</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your appeal has been sent to our support team via Telegram. 
                    Please wait for a response.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleContactSupport}
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Contact Support Directly
          </Button>
          
          <Button 
            variant="ghost" 
            className="w-full text-muted-foreground"
            onClick={handleBackToLogin}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Login
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Appeals are typically reviewed within 24-48 hours.
        </p>
      </div>
    </div>
  );
};

export default BannedAccount;
