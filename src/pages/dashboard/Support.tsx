import { useState, useEffect } from "react";
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
  ExternalLink,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Ticket {
  id: string;
  ticket_id: string;
  subject: string;
  status: string;
  created_at: string;
}

const Support = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || "");
        const { data } = await supabase
          .from("profiles")
          .select("username, name")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserName(data?.name || data?.username || "");
      }
    };
    fetchUserInfo();
  }, []);

  // Fetch tickets and set up realtime subscription
  useEffect(() => {
    if (!userId) return;

    const fetchTickets = async () => {
      setTicketsLoading(true);
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, ticket_id, subject, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching tickets:", error);
      } else {
        setTickets(data || []);
      }
      setTicketsLoading(false);
    };

    fetchTickets();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('support-tickets-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log("Realtime update:", payload);
          if (payload.eventType === 'INSERT') {
            setTickets(prev => [payload.new as Ticket, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTickets(prev => prev.map(t => 
              t.id === (payload.new as Ticket).id ? payload.new as Ticket : t
            ));
          } else if (payload.eventType === 'DELETE') {
            setTickets(prev => prev.filter(t => t.id !== (payload.old as Ticket).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail || !subject || !message) {
      toast.error("Please fill in all fields");
      return;
    }
    if (!userId) {
      toast.error("You must be logged in to submit a ticket");
      return;
    }
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('send-support-ticket', {
        body: { subject, message, userEmail, userName, userId }
      });

      if (error) throw error;
      
      toast.success(`Ticket ${data.ticketId} submitted successfully!`);
      setSubject("");
      setMessage("");
    } catch (error: any) {
      console.error("Error submitting ticket:", error);
      toast.error("Failed to submit ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return { bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/50' };
      case 'in_progress':
        return { bg: 'bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500/50' };
      case 'resolved':
        return { bg: 'bg-green-500/20', text: 'text-green-500', border: 'border-green-500/50' };
      case 'closed':
        return { bg: 'bg-gray-500/20', text: 'text-gray-500', border: 'border-gray-500/50' };
      default:
        return { bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/50' };
    }
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
                <Label htmlFor="email">Your Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={userEmail}
                  disabled
                  className="bg-secondary border-border opacity-70"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject <span className="text-red-500">*</span></Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="bg-secondary border-border"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message <span className="text-red-500">*</span></Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe your issue in detail..."
                  className="bg-secondary border-border min-h-[150px]"
                  required
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
              <a 
                href="mailto:losthackerofc@gmail.com"
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                <Mail className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Email</p>
                  <p className="text-xs text-muted-foreground">losthackerofc@gmail.com</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>

              <a 
                href="https://t.me/YunchiSupport"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                <MessageSquare className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Telegram</p>
                  <p className="text-xs text-muted-foreground">@YunchiSupport</p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
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
            {tickets.length > 0 && (
              <Badge variant="secondary" className="ml-2">{tickets.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticketsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No support tickets yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => {
                const statusColors = getStatusColor(ticket.status);
                return (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusColors.bg}`}>
                        {ticket.status === "open" || ticket.status === "in_progress" ? (
                          <Clock className={`h-5 w-5 ${statusColors.text}`} />
                        ) : (
                          <CheckCircle className={`h-5 w-5 ${statusColors.text}`} />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{ticket.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {ticket.ticket_id} • {formatDate(ticket.created_at)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`capitalize ${statusColors.border} ${statusColors.text}`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Support;
