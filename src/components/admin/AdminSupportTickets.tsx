import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Search,
  Loader2,
  RefreshCw,
  MessageSquare,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface SupportTicket {
  id: string;
  ticket_id: string;
  user_id: string;
  user_email: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_admin: boolean;
  created_at: string;
}

interface Profile {
  username: string | null;
  telegram_username: string | null;
}

const AdminSupportTickets = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
      toast.error("Failed to fetch tickets");
    } else {
      setTickets(data || []);
      
      // Fetch user profiles
      const userIds = [...new Set(data?.map(t => t.user_id) || [])];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, telegram_username')
          .in('user_id', userIds);

        const profilesMap: Record<string, Profile> = {};
        profilesData?.forEach(p => {
          profilesMap[p.user_id] = { username: p.username, telegram_username: p.telegram_username };
        });
        setProfiles(profilesMap);
      }
    }
    setLoading(false);
  };

  const fetchMessages = async (ticketId: string) => {
    const { data, error } = await supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  useEffect(() => {
    if (selectedTicket) {
      fetchMessages(selectedTicket.id);
    }
  }, [selectedTicket]);

  const handleSendMessage = async () => {
    if (!selectedTicket || !newMessage.trim()) return;

    setSendingMessage(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setSendingMessage(false);
      return;
    }

    const { error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: selectedTicket.id,
        user_id: user.id,
        message: newMessage.trim(),
        is_admin: true
      });

    if (error) {
      console.error('Error sending message:', error);
      toast.error("Failed to send message");
    } else {
      toast.success("Reply sent");
      setNewMessage("");
      fetchMessages(selectedTicket.id);
      
      // Update ticket status to in_progress if it was open
      if (selectedTicket.status === 'open') {
        await supabase
          .from('support_tickets')
          .update({ status: 'in_progress', updated_at: new Date().toISOString() })
          .eq('id', selectedTicket.id);
        fetchTickets();
      }
    }
    setSendingMessage(false);
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedTicket) return;

    setUpdatingStatus(true);
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', selectedTicket.id);

    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Ticket status updated to ${newStatus}`);
      setSelectedTicket({ ...selectedTicket, status: newStatus });
      fetchTickets();
    }
    setUpdatingStatus(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Open</Badge>;
      case 'in_progress':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">In Progress</Badge>;
      case 'resolved':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Resolved</Badge>;
      case 'closed':
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Closed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">High</Badge>;
      case 'medium':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Medium</Badge>;
      case 'low':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = 
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.ticket_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.user_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profiles[ticket.user_id]?.username?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Support Tickets
            </span>
            <Button variant="outline" size="sm" onClick={fetchTickets}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by subject, email, or ticket ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 bg-secondary border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tickets found</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {filteredTickets.map((ticket) => (
                  <Card 
                    key={ticket.id}
                    className="bg-secondary/50 border-border hover:bg-secondary/80 transition-colors cursor-pointer"
                    onClick={() => setSelectedTicket(ticket)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              #{ticket.ticket_id}
                            </span>
                            {getStatusBadge(ticket.status)}
                            {getPriorityBadge(ticket.priority)}
                          </div>
                          <h4 className="font-medium text-foreground truncate">
                            {ticket.subject}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {profiles[ticket.user_id]?.username || ticket.user_email}
                          </p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {format(new Date(ticket.created_at), 'MMM d, HH:mm')}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>Ticket #{selectedTicket?.ticket_id}</span>
              {selectedTicket && getStatusBadge(selectedTicket.status)}
            </DialogTitle>
            <DialogDescription>{selectedTicket?.subject}</DialogDescription>
          </DialogHeader>

          {selectedTicket && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Ticket Info */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-secondary rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">User:</span>
                  <span className="ml-2">{profiles[selectedTicket.user_id]?.username || selectedTicket.user_email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Priority:</span>
                  <span className="ml-2">{getPriorityBadge(selectedTicket.priority)}</span>
                </div>
              </div>

              {/* Status Update */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Update Status:</span>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant={selectedTicket.status === 'in_progress' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('in_progress')}
                    disabled={updatingStatus}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    In Progress
                  </Button>
                  <Button 
                    size="sm" 
                    variant={selectedTicket.status === 'resolved' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('resolved')}
                    disabled={updatingStatus}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Resolved
                  </Button>
                  <Button 
                    size="sm" 
                    variant={selectedTicket.status === 'closed' ? 'default' : 'outline'}
                    onClick={() => handleUpdateStatus('closed')}
                    disabled={updatingStatus}
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Closed
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 border rounded-lg p-3 bg-secondary/30">
                <div className="space-y-3">
                  {/* Original message */}
                  <div className="p-3 rounded-lg bg-secondary">
                    <p className="text-sm text-muted-foreground mb-1">Original Message:</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedTicket.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(new Date(selectedTicket.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>

                  {/* Replies */}
                  {messages.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`p-3 rounded-lg ${
                        msg.is_admin 
                          ? 'bg-primary/20 border border-primary/30 ml-4' 
                          : 'bg-secondary mr-4'
                      }`}
                    >
                      <p className="text-xs text-muted-foreground mb-1">
                        {msg.is_admin ? '👑 Admin' : '👤 User'}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(msg.created_at), 'MMM d, HH:mm')}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Reply Input */}
              <div className="flex gap-2">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your reply..."
                  className="flex-1 bg-secondary border-border resize-none"
                  rows={2}
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !newMessage.trim()}
                  className="self-end"
                >
                  {sendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminSupportTickets;
