import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Mail,
  MessageSquare,
  CreditCard,
  Calendar,
  Clock,
  Shield,
  Fingerprint,
  Globe,
  MapPin,
  Activity,
  DollarSign,
  Hash,
  Wifi,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface UserDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null; // this is user_id (auth uid)
  username: string | null;
}

interface DetailData {
  email: string | null;
  totalChecks: number;
  lastTopup: { amount: number; created_at: string; status: string } | null;
  deviceLogs: {
    fingerprint: string;
    ip_address: string | null;
    user_agent: string | null;
    last_seen: string;
  }[];
  lastSession: {
    last_active: string;
    ip_address: string | null;
    browser: string | null;
    os: string | null;
    location: string | null;
  } | null;
}

const InfoRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number | null | undefined; color?: string }) => (
  <div className="flex items-start gap-3 py-2">
    <div className="p-1.5 rounded-md bg-secondary shrink-0 mt-0.5">
      <Icon className={`h-3.5 w-3.5 ${color || 'text-muted-foreground'}`} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium break-all">{value || 'N/A'}</p>
    </div>
  </div>
);

const UserDetailModal = ({ open, onOpenChange, userId, username }: UserDetailModalProps) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);

  useEffect(() => {
    if (open && userId) {
      fetchFullDetails();
    }
  }, [open, userId]);

  const fetchFullDetails = async () => {
    if (!userId) return;
    setLoading(true);

    const [profileRes, checksRes, topupRes, deviceRes, sessionRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('card_checks').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('topup_transactions').select('amount, created_at, status').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
      supabase.from('user_device_logs').select('fingerprint, ip_address, user_agent, last_seen').eq('user_id', userId).order('last_seen', { ascending: false }).limit(5),
      supabase.from('user_sessions').select('last_active, ip_address, browser, os, location').eq('user_id', userId).order('last_active', { ascending: false }).limit(1),
    ]);

    setProfile(profileRes.data);
    setDetail({
      email: null, // will be set below
      totalChecks: checksRes.count || 0,
      lastTopup: topupRes.data?.[0] || null,
      deviceLogs: deviceRes.data || [],
      lastSession: sessionRes.data?.[0] || null,
    });

    setLoading(false);
  };

  const initials = (username || '??').slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg p-0 gap-0 max-h-[85vh] overflow-hidden">
        {loading || !profile ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Header Banner */}
            <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 pb-4">
              <DialogHeader className="space-y-0">
                <DialogTitle className="sr-only">User Profile</DialogTitle>
              </DialogHeader>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-primary/30">
                  <AvatarFallback className="bg-primary/20 text-primary text-lg font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold truncate">{profile.username || 'Unknown'}</h2>
                    {profile.is_banned ? (
                      <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Banned</Badge>
                    ) : (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">Active</Badge>
                    )}
                  </div>
                  {profile.name && (
                    <p className="text-sm text-muted-foreground">{profile.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground/70 font-mono mt-1 truncate">{userId}</p>
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-card/60 backdrop-blur rounded-lg p-2.5 text-center border border-border/50">
                  <p className="text-lg font-bold text-primary">{profile.credits.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Credits</p>
                </div>
                <div className="bg-card/60 backdrop-blur rounded-lg p-2.5 text-center border border-border/50">
                  <p className="text-lg font-bold text-foreground">{(detail?.totalChecks || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Checks</p>
                </div>
                <div className="bg-card/60 backdrop-blur rounded-lg p-2.5 text-center border border-border/50">
                  <p className="text-lg font-bold text-foreground">
                    {detail?.lastTopup ? `$${detail.lastTopup.amount}` : '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">Last Topup</p>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <ScrollArea className="max-h-[45vh]">
              <div className="px-6 pb-6 space-y-1">
                <Separator className="mb-3" />

                {/* Account Info */}
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold pt-1 pb-1">Account Information</p>
                <InfoRow icon={User} label="Username" value={profile.username} color="text-primary" />
                <InfoRow icon={Hash} label="Chat ID" value={profile.telegram_chat_id} color="text-blue-400" />
                <InfoRow icon={MessageSquare} label="Telegram" value={profile.telegram_username ? `@${profile.telegram_username}` : null} color="text-sky-400" />
                <InfoRow icon={Calendar} label="Registered" value={profile.created_at ? format(new Date(profile.created_at), 'PPpp') : null} color="text-purple-400" />

                <Separator className="my-2" />

                {/* Session & Device Info */}
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold pt-1 pb-1">Device & Session</p>
                {detail?.lastSession ? (
                  <>
                    <InfoRow icon={Clock} label="Last Online" value={
                      detail.lastSession.last_active
                        ? formatDistanceToNow(new Date(detail.lastSession.last_active), { addSuffix: true })
                        : null
                    } color="text-green-400" />
                    <InfoRow icon={Wifi} label="IP Address" value={detail.lastSession.ip_address} color="text-orange-400" />
                    <InfoRow icon={Globe} label="Browser / OS" value={
                      [detail.lastSession.browser, detail.lastSession.os].filter(Boolean).join(' · ') || null
                    } color="text-cyan-400" />
                    <InfoRow icon={MapPin} label="Location" value={detail.lastSession.location} color="text-pink-400" />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No session data available</p>
                )}

                {detail?.deviceLogs && detail.deviceLogs.length > 0 && (
                  <>
                    <InfoRow icon={Fingerprint} label="Fingerprint" value={detail.deviceLogs[0].fingerprint} color="text-yellow-400" />
                    {detail.deviceLogs[0].ip_address && detail.deviceLogs[0].ip_address !== detail?.lastSession?.ip_address && (
                      <InfoRow icon={Wifi} label="Device IP" value={detail.deviceLogs[0].ip_address} color="text-orange-400" />
                    )}
                  </>
                )}

                <Separator className="my-2" />

                {/* Financial */}
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold pt-1 pb-1">Financial</p>
                <InfoRow icon={CreditCard} label="Credits Balance" value={profile.credits.toLocaleString()} color="text-primary" />
                <InfoRow icon={DollarSign} label="Last Top-up" value={
                  detail?.lastTopup
                    ? `$${detail.lastTopup.amount} — ${format(new Date(detail.lastTopup.created_at), 'MMM d, yyyy')} (${detail.lastTopup.status})`
                    : 'No top-ups'
                } color="text-emerald-400" />
                <InfoRow icon={Activity} label="Total Checks" value={(detail?.totalChecks || 0).toLocaleString()} color="text-violet-400" />

                {/* Ban Info */}
                {profile.is_banned && (
                  <>
                    <Separator className="my-2" />
                    <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="h-4 w-4 text-destructive" />
                        <p className="text-sm font-semibold text-destructive">Account Banned</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{profile.ban_reason || 'No reason specified'}</p>
                      {profile.banned_at && (
                        <p className="text-xs text-muted-foreground mt-1">Since {format(new Date(profile.banned_at), 'PPpp')}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserDetailModal;
