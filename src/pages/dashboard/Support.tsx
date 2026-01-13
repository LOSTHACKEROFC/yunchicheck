import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  HeadphonesIcon, 
  MessageSquare, 
  Mail, 
  Send,
  Clock,
  CheckCircle,
  FileText,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

// Mock tickets
const tickets = [
  { id: "TKT-001", subject: "Payment not received", status: "open", date: "2024-01-10" },
  { id: "TKT-002", subject: "Account verification", status: "resolved", date: "2024-01-08" },
];

const Support = () => {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      toast.success("Support ticket submitted successfully!");
      setSubject("");
      setMessage("");
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Contract Support</h1>
        <p className="text-muted-foreground mt-1">Get help with your account and services</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submit Ticket Form */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Submit a Support Ticket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="bg-secondary border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe your issue in detail..."
                  className="bg-secondary border-border min-h-[150px]"
                />
              </div>

              <Button type="submit" className="w-full btn-primary" disabled={loading}>
                <Send className="h-4 w-4 mr-2" />
                {loading ? "Submitting..." : "Submit Ticket"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Contact Options */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <HeadphonesIcon className="h-4 w-4 text-primary" />
                Contact Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                <Mail className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Email</p>
                  <p className="text-xs text-muted-foreground">support@yunchichecker.com</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                <MessageSquare className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Telegram</p>
                  <p className="text-xs text-muted-foreground">@YunchiSupport</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Response Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">&lt; 24 Hours</p>
              <p className="text-xs text-muted-foreground mt-1">Average response time</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Previous Tickets */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Your Tickets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No support tickets yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      ticket.status === "open" ? "bg-yellow-500/20" : "bg-green-500/20"
                    }`}>
                      {ticket.status === "open" ? (
                        <Clock className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{ticket.subject}</p>
                      <p className="text-sm text-muted-foreground">{ticket.id} • {ticket.date}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`capitalize ${
                      ticket.status === "open" 
                        ? "border-yellow-500/50 text-yellow-500" 
                        : "border-green-500/50 text-green-500"
                    }`}
                  >
                    {ticket.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Support;
