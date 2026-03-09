import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
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
  ExternalLink,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface UserDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  username: string | null;
}

interface DetailData {
  totalChecks: number;
  lastTopup: { amount: number; created_at: string; status: string } | null;
  totalTopup: number;
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

interface IpGeoData {
  country: string;
  city: string;
  regionName: string;
  isp: string;
  org: string;
}

const InfoRow = ({ icon: Icon, label, value, color, onClick, linkHref }: {
  icon: any; label: string; value: string | number | null | undefined; color?: string;
  onClick?: () => void; linkHref?: string;
}) => (
  <div className="flex items-start gap-3 py-2">
    <div className="p-1.5 rounded-md bg-secondary shrink-0 mt-0.5">
      <Icon className={`h-3.5 w-3.5 ${color || 'text-muted-foreground'}`} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      {linkHref ? (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium break-all text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer"
        >
          {value || 'N/A'}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      ) : (
        <p className={`text-sm font-medium break-all ${onClick ? 'text-primary hover:underline cursor-pointer' : ''}`} onClick={onClick}>
          {value || 'N/A'}
        </p>
      )}
    </div>
  </div>
);

const UserDetailModal = ({ open, onOpenChange, userId, username }: UserDetailModalProps) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [telegramPhoto, setTelegramPhoto] = useState<string | null>(null);
  const [telegramName, setTelegramName] = useState<string | null>(null);
  const [ipGeo, setIpGeo] = useState<IpGeoData | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    if (open && userId) {
      setTelegramPhoto(null);
      setTelegramName(null);
      setIpGeo(null);
      fetchFullDetails();
    }
  }, [open, userId]);

  const fetchFullDetails = async () => {
    if (!userId) return;
    setLoading(true);

    const [profileRes, checksRes, topupRes, allTopupsRes, deviceRes, sessionRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('card_checks').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('topup_transactions').select('amount, created_at, status').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
      supabase.from('topup_transactions').select('amount').eq('user_id', userId).eq('status', 'completed'),
      supabase.from('user_device_logs').select('fingerprint, ip_address, user_agent, last_seen').eq('user_id', userId).order('last_seen', { ascending: false }).limit(5),
      supabase.from('user_sessions').select('last_active, ip_address, browser, os, location').eq('user_id', userId).order('last_active', { ascending: false }).limit(1),
    ]);

    const profileData = profileRes.data;
    const sessionData = sessionRes.data?.[0] || null;
    const deviceData = deviceRes.data || [];

    setProfile(profileData);
    const totalTopup = (allTopupsRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0);
    setDetail({
      totalChecks: checksRes.count || 0,
      lastTopup: topupRes.data?.[0] || null,
      totalTopup,
      deviceLogs: deviceData,
      lastSession: sessionData,
    });
    setLoading(false);

    // Fetch telegram photo if chat_id exists
    if (profileData?.telegram_chat_id) {
      fetchTelegramPhoto(profileData.telegram_chat_id);
    }

    // Fetch IP geolocation
    const ip = sessionData?.ip_address || deviceData?.[0]?.ip_address;
    if (ip) {
      fetchIpGeo(ip);
    }
  };

  const fetchTelegramPhoto = async (chatId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-telegram-profile', {
        body: { chat_id: chatId },
      });
      if (!error) {
        if (data?.photo_url) setTelegramPhoto(data.photo_url);
        const nameParts = [data?.first_name, data?.last_name].filter(Boolean);
        if (nameParts.length > 0) setTelegramName(nameParts.join(' '));
      }
    } catch (err) {
      console.error('Failed to fetch telegram photo:', err);
    }
  };

  const fetchIpGeo = async (ip: string) => {
    // Skip private/local IPs
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('127.') || ip === '::1') {
      setIpGeo({ country: 'Local', city: 'Local Network', regionName: '', isp: '', org: '' });
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,regionName,isp,org`);
      if (res.ok) {
        const data = await res.json();
        setIpGeo(data);
      }
    } catch (err) {
      console.error('Failed to fetch IP geo:', err);
    }
    setGeoLoading(false);
  };

  const initials = (username || '??').slice(0, 2).toUpperCase();

  const getTelegramLink = () => {
    if (profile?.telegram_username) {
      return `https://t.me/${profile.telegram_username}`;
    }
    if (profile?.telegram_chat_id) {
      return `tg://user?id=${profile.telegram_chat_id}`;
    }
    return undefined;
  };

  const locationString = (() => {
    if (geoLoading) return 'Fetching location...';
    if (ipGeo) {
      return [ipGeo.city, ipGeo.regionName, ipGeo.country].filter(Boolean).join(', ');
    }
    return detail?.lastSession?.location || null;
  })();

  const ispString = ipGeo ? [ipGeo.isp, ipGeo.org].filter(Boolean).join(' · ') : null;

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
                  {telegramPhoto && (
                    <AvatarImage src={telegramPhoto} alt={profile.username || 'User'} />
                  )}
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
                  {(telegramName || profile.name) && (
                    <p className="text-sm text-muted-foreground">
                      {telegramName || profile.name}
                      {telegramName && telegramName !== profile.name && (
                        <span className="text-[10px] text-muted-foreground/60 ml-1.5">(Telegram)</span>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/70 font-mono mt-1 truncate">{userId}</p>
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-4 gap-2 mt-4">
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
                    ${(detail?.totalTopup || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Topup</p>
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
                <InfoRow
                  icon={Hash}
                  label="Chat ID"
                  value={profile.telegram_chat_id}
                  color="text-blue-400"
                  linkHref={getTelegramLink()}
                />
                <InfoRow icon={MessageSquare} label="Telegram" value={profile.telegram_username ? `@${profile.telegram_username}` : null} color="text-sky-400" linkHref={profile.telegram_username ? `https://t.me/${profile.telegram_username}` : undefined} />
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
                    <InfoRow icon={MapPin} label="Location" value={
                      geoLoading ? (
                        'Resolving location...'
                      ) : locationString
                    } color="text-pink-400" />
                    {ispString && (
                      <InfoRow icon={Globe} label="ISP / Org" value={ispString} color="text-indigo-400" />
                    )}
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
