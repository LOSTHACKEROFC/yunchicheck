import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Loader2,
  Bell,
  Send,
  Users,
  AlertCircle,
  Info,
  CheckCircle,
  Megaphone,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface RecentAnnouncement {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  recipients: number;
}

const AdminAnnouncements = () => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [type, setType] = useState("info");
  const [sending, setSending] = useState(false);
  const [recentAnnouncements, setRecentAnnouncements] = useState<RecentAnnouncement[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Get user count
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    setUserCount(count || 0);

    // Get recent announcements (notifications with type 'announcement')
    const { data: announcements } = await supabase
      .from('notifications')
      .select('id, title, message, type, created_at')
      .eq('type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(10);

    if (announcements) {
      // Group by title and message to get unique announcements
      const uniqueMap = new Map<string, RecentAnnouncement>();
      announcements.forEach(a => {
        const key = `${a.title}-${a.message}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, {
            id: a.id,
            title: a.title,
            message: a.message,
            type: a.type,
            created_at: a.created_at,
            recipients: 1
          });
        } else {
          const existing = uniqueMap.get(key)!;
          existing.recipients++;
        }
      });
      setRecentAnnouncements(Array.from(uniqueMap.values()));
    }
    
    setLoading(false);
  };

  const handleSendAnnouncement = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Please enter both title and message");
      return;
    }

    setSending(true);

    try {
      // Fetch all user IDs
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('user_id');

      if (usersError) throw usersError;

      if (!users || users.length === 0) {
        toast.error("No users found");
        setSending(false);
        return;
      }

      // Create notification for each user
      const notifications = users.map(user => ({
        user_id: user.user_id,
        type: 'announcement',
        title: title.trim(),
        message: message.trim(),
        metadata: { announcement_type: type, ...(linkUrl.trim() ? { link_url: linkUrl.trim(), link_label: linkLabel.trim() || "Open Link" } : {}) }
      }));

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('notifications')
          .insert(batch);

        if (insertError) {
          console.error('Error inserting batch:', insertError);
          throw insertError;
        }
      }

      // Also send to Telegram for all users with telegram_chat_id
      const { data: telegramUsers } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .not('telegram_chat_id', 'is', null);

      if (telegramUsers && telegramUsers.length > 0) {
        const telegramLink = linkUrl.trim() || null;
        const telegramLinkLabel = linkLabel.trim() || "Open Link";
        
        // Send via edge function in batches
        const tgBatchSize = 25;
        for (let i = 0; i < telegramUsers.length; i += tgBatchSize) {
          const batch = telegramUsers.slice(i, i + tgBatchSize);
          await supabase.functions.invoke('send-announcement-telegram', {
            body: {
              chat_ids: batch.map(u => u.telegram_chat_id),
              title: title.trim(),
              message: message.trim(),
              announcement_type: type,
              link_url: telegramLink,
              link_label: telegramLinkLabel,
            }
          });
        }
      }

      toast.success(`Announcement sent to ${users.length} users!`);
      setTitle("");
      setMessage("");
      setLinkUrl("");
      setLinkLabel("");
      setType("info");
      fetchData();
    } catch (error) {
      console.error('Error sending announcement:', error);
      toast.error("Failed to send announcement");
    }

    setSending(false);
  };

  const getTypeIcon = (announcementType: string) => {
    switch (announcementType) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-400" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-400" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'urgent':
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Create Announcement */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            Send Announcement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-secondary/50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Recipients</span>
            <Badge variant="outline" className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {userCount.toLocaleString()} users
            </Badge>
          </div>

          <div>
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title..."
              className="mt-1 bg-secondary border-border"
              maxLength={100}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your announcement message..."
              className="mt-1 bg-secondary border-border resize-none"
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {message.length}/500
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-400" />
                    Information
                  </div>
                </SelectItem>
                <SelectItem value="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    Success
                  </div>
                </SelectItem>
                <SelectItem value="warning">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-400" />
                    Warning
                  </div>
                </SelectItem>
                <SelectItem value="urgent">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    Urgent
                  </div>
                </SelectItem>
              </SelectContent>
          </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Link URL (optional)</label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              className="mt-1 bg-secondary border-border"
              type="url"
            />
          </div>

          {linkUrl.trim() && (
            <div>
              <label className="text-sm font-medium">Link Button Text</label>
              <Input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Open Link"
                className="mt-1 bg-secondary border-border"
                maxLength={50}
              />
            </div>
          )}

          <Button 
            onClick={handleSendAnnouncement}
            disabled={sending || !title.trim() || !message.trim()}
            className="w-full"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending to {userCount} users...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Announcement
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Announcements */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Announcements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : recentAnnouncements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No announcements sent yet</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3 pr-4">
                {recentAnnouncements.map((announcement) => (
                  <Card 
                    key={announcement.id}
                    className="bg-secondary/50 border-border"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {getTypeIcon(announcement.type)}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">
                            {announcement.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {announcement.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{format(new Date(announcement.created_at), 'MMM d, HH:mm')}</span>
                            <span>•</span>
                            <span>{announcement.recipients} recipients</span>
                          </div>
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
    </div>
  );
};

export default AdminAnnouncements;
