import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Shield, 
  ShieldOff,
  Search,
  Loader2,
  RefreshCw,
  Fingerprint,
  Globe,
  Ban,
  CheckCircle,
  XCircle,
  User,
  Clock,
  Trash2,
  Plus,
  Monitor,
  Smartphone,
  AlertTriangle,
  Activity,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface BlockedDevice {
  id: string;
  fingerprint: string | null;
  ip_address: string | null;
  banned_user_id: string;
  banned_by_admin_id: string | null;
  reason: string | null;
  is_active: boolean;
  created_at: string;
}

interface DeviceLog {
  id: string;
  user_id: string;
  fingerprint: string;
  ip_address: string | null;
  user_agent: string | null;
  last_seen: string;
  created_at: string;
}

interface Profile {
  username: string | null;
  telegram_username: string | null;
}

const AdminBlockedDevices = () => {
  const [blockedDevices, setBlockedDevices] = useState<BlockedDevice[]>([]);
  const [deviceLogs, setDeviceLogs] = useState<DeviceLog[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedDevice, setSelectedDevice] = useState<BlockedDevice | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [newBlock, setNewBlock] = useState({ type: "ip", value: "", reason: "" });
  const [stats, setStats] = useState({ 
    totalBlocked: 0, 
    activeBlocks: 0, 
    fingerprintBlocks: 0, 
    ipBlocks: 0,
    uniqueUsers: 0
  });

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      setIsAdmin(!!data);
      if (!data) {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  // Fetch blocked devices
  const fetchBlockedDevices = async () => {
    if (!isAdmin) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('blocked_devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blocked devices:', error);
      toast.error("Failed to fetch blocked devices");
    } else {
      setBlockedDevices(data || []);
      
      // Calculate stats
      const activeBlocks = data?.filter(d => d.is_active).length || 0;
      const fingerprintBlocks = data?.filter(d => d.fingerprint && d.is_active).length || 0;
      const ipBlocks = data?.filter(d => d.ip_address && d.is_active).length || 0;
      const uniqueUsers = new Set(data?.map(d => d.banned_user_id)).size || 0;
      
      setStats({ 
        totalBlocked: data?.length || 0, 
        activeBlocks, 
        fingerprintBlocks, 
        ipBlocks,
        uniqueUsers
      });

      // Fetch user profiles
      const userIds = [...new Set(data?.map(d => d.banned_user_id) || [])];
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

  // Fetch device logs for overview
  const fetchDeviceLogs = async () => {
    if (!isAdmin) return;

    const { data, error } = await supabase
      .from('user_device_logs')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(100);

    if (!error && data) {
      setDeviceLogs(data);
      
      // Fetch profiles for device logs
      const userIds = [...new Set(data.map(d => d.user_id))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, telegram_username')
          .in('user_id', userIds);

        const profilesMap: Record<string, Profile> = {};
        profilesData?.forEach(p => {
          profilesMap[p.user_id] = { username: p.username, telegram_username: p.telegram_username };
        });
        setProfiles(prev => ({ ...prev, ...profilesMap }));
      }
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchBlockedDevices();
      fetchDeviceLogs();
    }
  }, [isAdmin]);

  // Real-time subscription
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('admin-blocked-devices')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocked_devices'
        },
        () => {
          fetchBlockedDevices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const handleUnblock = async () => {
    if (!selectedDevice) return;

    setActionLoading(true);
    const { error } = await supabase
      .from('blocked_devices')
      .update({ is_active: false })
      .eq('id', selectedDevice.id);

    if (error) {
      toast.error("Failed to unblock device");
    } else {
      toast.success("Device unblocked successfully");
      setSelectedDevice(null);
      setShowUnblockConfirm(false);
    }
    setActionLoading(false);
  };

  const handleAddBlock = async () => {
    if (!newBlock.value.trim()) {
      toast.error("Please enter a value to block");
      return;
    }

    // Validate IP format
    if (newBlock.type === "ip") {
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(newBlock.value)) {
        toast.error("Invalid IP address format");
        return;
      }
    }

    // Validate fingerprint
    if (newBlock.type === "fingerprint" && newBlock.value.length < 8) {
      toast.error("Fingerprint must be at least 8 characters");
      return;
    }

    setActionLoading(true);
    
    const blockData: Record<string, unknown> = {
      banned_user_id: "00000000-0000-0000-0000-000000000000",
      reason: newBlock.reason || "Manually blocked by admin",
      is_active: true,
    };

    if (newBlock.type === "ip") {
      blockData.ip_address = newBlock.value;
    } else {
      blockData.fingerprint = newBlock.value;
    }

    const { error } = await supabase
      .from('blocked_devices')
      .insert([blockData as { banned_user_id: string; reason: string; is_active: boolean; ip_address?: string; fingerprint?: string }]);

    if (error) {
      console.error("Error adding block:", error);
      toast.error("Failed to add block");
    } else {
      toast.success(`${newBlock.type === "ip" ? "IP Address" : "Fingerprint"} blocked successfully`);
      setShowBlockDialog(false);
      setNewBlock({ type: "ip", value: "", reason: "" });
    }
    setActionLoading(false);
  };

  const handleDeleteBlock = async (id: string) => {
    const { error } = await supabase
      .from('blocked_devices')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error("Failed to delete block");
    } else {
      toast.success("Block deleted permanently");
    }
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return { browser: "Unknown", os: "Unknown", device: "desktop" };
    
    let browser = "Unknown";
    let os = "Unknown";
    let device: "desktop" | "mobile" | "tablet" = "desktop";

    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";
    else if (ua.includes("FBAN") || ua.includes("FBAV")) browser = "Facebook";
    else if (ua.includes("Instagram")) browser = "Instagram";

    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) { os = "Android"; device = "mobile"; }
    else if (ua.includes("iPhone")) { os = "iOS"; device = "mobile"; }
    else if (ua.includes("iPad")) { os = "iPadOS"; device = "tablet"; }

    return { browser, os, device };
  };

  const getDeviceIcon = (device: string) => {
    switch (device) {
      case "mobile": return <Smartphone className="h-4 w-4" />;
      case "tablet": return <Monitor className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const filteredBlocks = blockedDevices.filter(device => {
    const matchesSearch = 
      device.fingerprint?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ip_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profiles[device.banned_user_id]?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.reason?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = 
      typeFilter === "all" ||
      (typeFilter === "fingerprint" && device.fingerprint) ||
      (typeFilter === "ip" && device.ip_address);
    
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && device.is_active) ||
      (statusFilter === "inactive" && !device.is_active);

    return matchesSearch && matchesType && matchesStatus;
  });

  const isDeviceBlocked = (fingerprint: string | null, ip: string | null) => {
    return blockedDevices.some(b => 
      b.is_active && (
        (fingerprint && b.fingerprint === fingerprint) ||
        (ip && b.ip_address === ip)
      )
    );
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="p-2 bg-destructive/20 rounded-lg">
              <ShieldOff className="h-6 w-6 text-destructive" />
            </div>
            Blocked Devices
          </h1>
          <p className="text-muted-foreground mt-1">Manage blocked devices, fingerprints and IP addresses</p>
        </div>
        <Button 
          onClick={() => setShowBlockDialog(true)}
          className="bg-destructive hover:bg-destructive/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Block
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-card to-card/50 border-border hover:border-primary/30 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Blocks</p>
                <p className="text-xl font-bold text-foreground">{stats.totalBlocked}</p>
              </div>
              <div className="p-2 bg-secondary rounded-lg">
                <Ban className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-destructive/10 to-card border-destructive/30 hover:border-destructive/50 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold text-destructive">{stats.activeBlocks}</p>
              </div>
              <div className="p-2 bg-destructive/20 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-card border-purple-500/30 hover:border-purple-500/50 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Fingerprints</p>
                <p className="text-xl font-bold text-purple-400">{stats.fingerprintBlocks}</p>
              </div>
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Fingerprint className="h-5 w-5 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-card border-blue-500/30 hover:border-blue-500/50 transition-colors">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">IP Addresses</p>
                <p className="text-xl font-bold text-blue-400">{stats.ipBlocks}</p>
              </div>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Globe className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-card border-orange-500/30 hover:border-orange-500/50 transition-colors col-span-2 md:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Affected Users</p>
                <p className="text-xl font-bold text-orange-400">{stats.uniqueUsers}</p>
              </div>
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <User className="h-5 w-5 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="blocked" className="space-y-4">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="blocked" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ban className="h-4 w-4 mr-2" />
            Blocked ({stats.activeBlocks})
          </TabsTrigger>
          <TabsTrigger value="devices" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Activity className="h-4 w-4 mr-2" />
            Device Logs
          </TabsTrigger>
        </TabsList>

        {/* Blocked Devices Tab */}
        <TabsContent value="blocked" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by fingerprint, IP, user, or reason..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-secondary border-border"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-32 bg-secondary border-border">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="fingerprint">Fingerprint</SelectItem>
                      <SelectItem value="ip">IP Address</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 bg-secondary border-border">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => { fetchBlockedDevices(); fetchDeviceLogs(); }}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredBlocks.length === 0 ? (
                <div className="text-center py-12">
                  <ShieldOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No blocked devices found</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] sm:h-[500px]">
                  <div className="space-y-3">
                    {filteredBlocks.map((device) => (
                      <div 
                        key={device.id} 
                        className={`p-4 rounded-lg border transition-all hover:shadow-lg ${
                          device.is_active 
                            ? "bg-destructive/5 border-destructive/30 hover:border-destructive/50" 
                            : "bg-secondary/50 border-border hover:border-primary/30"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${device.is_active ? "bg-destructive/20" : "bg-secondary"}`}>
                              {device.fingerprint ? (
                                <Fingerprint className={`h-5 w-5 ${device.is_active ? "text-destructive" : "text-muted-foreground"}`} />
                              ) : (
                                <Globe className={`h-5 w-5 ${device.is_active ? "text-destructive" : "text-muted-foreground"}`} />
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-sm font-mono bg-secondary px-2 py-0.5 rounded">
                                  {device.fingerprint || device.ip_address}
                                </code>
                                <Badge variant={device.is_active ? "destructive" : "secondary"} className="text-xs">
                                  {device.is_active ? "Active" : "Inactive"}
                                </Badge>
                                {device.fingerprint && (
                                  <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">
                                    Fingerprint
                                  </Badge>
                                )}
                                {device.ip_address && (
                                  <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">
                                    IP
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {profiles[device.banned_user_id]?.username || "Manual Block"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(device.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              {device.reason && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-medium">Reason:</span> {device.reason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            {device.is_active && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setSelectedDevice(device); setShowUnblockConfirm(true); }}
                                className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Unblock
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBlock(device.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Device Logs Tab */}
        <TabsContent value="devices" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-primary" />
                Recent Device Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] sm:h-[500px]">
                <div className="space-y-2">
                  {deviceLogs.map((log) => {
                    const { browser, os, device } = parseUserAgent(log.user_agent);
                    const blocked = isDeviceBlocked(log.fingerprint, log.ip_address);
                    
                    return (
                      <div 
                        key={log.id} 
                        className={`p-3 rounded-lg border transition-colors ${
                          blocked 
                            ? "bg-destructive/5 border-destructive/20" 
                            : "bg-secondary/30 border-border hover:border-primary/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-1.5 rounded ${blocked ? "bg-destructive/20" : "bg-secondary"}`}>
                              {getDeviceIcon(device)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">
                                  {profiles[log.user_id]?.username || "Unknown"}
                                </span>
                                {blocked && (
                                  <Badge variant="destructive" className="text-xs">
                                    Blocked
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{browser}/{os}</span>
                                <span>{log.ip_address || "Unknown IP"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(log.last_seen), { addSuffix: true })}
                            </p>
                            <code className="text-xs font-mono text-muted-foreground">
                              {log.fingerprint.substring(0, 8)}...
                            </code>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Add New Block
            </DialogTitle>
            <DialogDescription>
              Block a specific IP address or device fingerprint
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Block Type</label>
              <Select value={newBlock.type} onValueChange={(v) => setNewBlock({ ...newBlock, type: v })}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ip">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-400" />
                      IP Address
                    </div>
                  </SelectItem>
                  <SelectItem value="fingerprint">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-purple-400" />
                      Fingerprint
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {newBlock.type === "ip" ? "IP Address" : "Fingerprint"}
              </label>
              <Input
                placeholder={newBlock.type === "ip" ? "e.g., 192.168.1.1" : "e.g., abc123def456"}
                value={newBlock.value}
                onChange={(e) => setNewBlock({ ...newBlock, value: e.target.value })}
                className="bg-secondary border-border font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Input
                placeholder="Why is this being blocked?"
                value={newBlock.reason}
                onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  This will immediately block access from this {newBlock.type === "ip" ? "IP address" : "device"} to the platform.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddBlock} 
              disabled={actionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Block {newBlock.type === "ip" ? "IP" : "Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Confirmation */}
      <AlertDialog open={showUnblockConfirm} onOpenChange={setShowUnblockConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock this device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow the {selectedDevice?.fingerprint ? "device" : "IP address"} to access the platform again.
              <div className="mt-3 p-3 bg-secondary rounded-lg">
                <code className="text-sm">
                  {selectedDevice?.fingerprint || selectedDevice?.ip_address}
                </code>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnblock}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBlockedDevices;