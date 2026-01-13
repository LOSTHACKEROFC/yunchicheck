import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Clock, CheckCircle, User, Headphones, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Ticket {
  id: string;
  ticket_id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  user_email: string;
}

interface Message {
  id: string;
  message: string;
  is_admin: boolean;
  created_at: string;
}

interface TicketDetailModalProps {
  ticket: Ticket | null;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onTicketUpdate?: (updatedTicket: Ticket) => void;
}

// Request notification permission
const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    console.log("This browser does not support notifications");
    return false;
  }
  
  if (Notification.permission === "granted") {
    return true;
  }
  
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  
  return false;
};

// Show browser notification
const showBrowserNotification = (title: string, body: string) => {
  if (Notification.permission === "granted" && document.hidden) {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "ticket-message", // Prevents duplicate notifications
    });
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }
};

// Play notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log("Could not play notification sound:", error);
  }
};

const TicketDetailModal = ({ ticket, isOpen, onClose, userId, onTicketUpdate }: TicketDetailModalProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(ticket);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);

  // Request notification permission when modal opens
  useEffect(() => {
    if (isOpen) {
      requestNotificationPermission();
    }
  }, [isOpen]);

  // Sync currentTicket with prop
  useEffect(() => {
    setCurrentTicket(ticket);
  }, [ticket]);

  useEffect(() => {
    if (!ticket || !isOpen) {
      isInitialLoadRef.current = true;
      return;
    }

    const fetchMessages = async () => {
      setLoading(true);
      isInitialLoadRef.current = true;
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, message, is_admin, created_at")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
      // Allow sounds after initial load
      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 500);
    };

    fetchMessages();

    // Subscribe to realtime messages
    const messagesChannel = supabase
      .channel(`ticket-messages-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${ticket.id}`
        },
        (payload) => {
          console.log("New message received:", payload);
          const newMsg = payload.new as Message;
          setMessages(prev => [...prev, newMsg]);
          
          // Notify for admin messages only (not user's own messages)
          if (newMsg.is_admin && !isInitialLoadRef.current) {
            playNotificationSound();
            showBrowserNotification(
              "New Support Reply",
              newMsg.message.substring(0, 100) + (newMsg.message.length > 100 ? "..." : "")
            );
          }
        }
      )
      .subscribe();

    // Subscribe to ticket status updates
    const ticketChannel = supabase
      .channel(`ticket-status-${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `id=eq.${ticket.id}`
        },
        (payload) => {
          console.log("Ticket updated:", payload);
          const updatedTicket = payload.new as Ticket;
          setCurrentTicket(updatedTicket);
          onTicketUpdate?.(updatedTicket);
          toast.info(`Ticket status changed to ${updatedTicket.status.toUpperCase()}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(ticketChannel);
    };
  }, [ticket, isOpen, onTicketUpdate]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticket) return;

    setSending(true);
    const { error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        user_id: userId,
        message: newMessage.trim(),
        is_admin: false
      });

    if (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } else {
      setNewMessage("");
    }
    setSending(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return { bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/50' };
      case 'processing':
        return { bg: 'bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500/50' };
      case 'solved':
        return { bg: 'bg-green-500/20', text: 'text-green-500', border: 'border-green-500/50' };
      case 'closed':
        return { bg: 'bg-gray-500/20', text: 'text-gray-500', border: 'border-gray-500/50' };
      default:
        return { bg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/50' };
    }
  };

  if (!currentTicket) return null;

  const statusColors = getStatusColor(currentTicket.status);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold">{currentTicket.ticket_id}</DialogTitle>
            <Badge
              variant="outline"
              className={`capitalize ${statusColors.border} ${statusColors.text}`}
            >
              {currentTicket.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{currentTicket.subject}</p>
        </DialogHeader>

        {/* Ticket Details */}
        <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Created:</span>
            <span>{formatDate(currentTicket.created_at)}</span>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground mb-1">Original Message:</p>
            <p className="bg-background/50 rounded p-2">{currentTicket.message}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0">
          <p className="text-sm font-medium mb-2">Conversation</p>
          <ScrollArea className="h-[200px] border rounded-lg p-3" ref={scrollRef}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.is_admin ? 'justify-start' : 'justify-end'}`}
                  >
                    {msg.is_admin && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <Headphones className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-lg p-3 ${
                        msg.is_admin
                          ? 'bg-secondary'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      <p className="text-sm">{msg.message}</p>
                      <p className={`text-xs mt-1 ${msg.is_admin ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                    {!msg.is_admin && (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Send Message */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-secondary"
            disabled={sending || currentTicket.status === 'closed'}
          />
          <Button 
            type="submit" 
            disabled={sending || !newMessage.trim() || currentTicket.status === 'closed'}
            className="btn-primary"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        {currentTicket.status === 'closed' && (
          <p className="text-xs text-muted-foreground text-center">This ticket is closed and cannot receive new messages.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TicketDetailModal;
