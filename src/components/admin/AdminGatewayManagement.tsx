import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Search,
  Loader2,
  RefreshCw,
  Settings,
  Edit,
  Wifi,
  CreditCard,
  Shield,
  Zap,
  Globe,
  Lock,
  Star,
  Activity,
  DollarSign,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Gateway {
  id: string;
  name: string;
  code: string | null;
  type: string;
  status: string;
  is_active: boolean;
  card_types: string;
  speed: string;
  success_rate: string;
  description: string;
  icon_name: string;
  icon_color: string;
  edge_function_name: string | null;
  charge_amount: string | null;
  cvc_required: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface GatewayStats {
  total_checks: number;
  live_count: number;
  dead_count: number;
}

const ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "CreditCard", label: "Credit Card", icon: CreditCard },
  { value: "Shield", label: "Shield", icon: Shield },
  { value: "Zap", label: "Zap", icon: Zap },
  { value: "Globe", label: "Globe", icon: Globe },
  { value: "Lock", label: "Lock", icon: Lock },
  { value: "Star", label: "Star", icon: Star },
  { value: "Activity", label: "Activity", icon: Activity },
  { value: "DollarSign", label: "Dollar Sign", icon: DollarSign },
  { value: "Layers", label: "Layers", icon: Layers },
  { value: "Settings", label: "Settings", icon: Settings },
];

const COLOR_OPTIONS = [
  { value: "text-blue-500", label: "Blue", preview: "bg-blue-500" },
  { value: "text-green-500", label: "Green", preview: "bg-green-500" },
  { value: "text-red-500", label: "Red", preview: "bg-red-500" },
  { value: "text-yellow-500", label: "Yellow", preview: "bg-yellow-500" },
  { value: "text-purple-500", label: "Purple", preview: "bg-purple-500" },
  { value: "text-pink-500", label: "Pink", preview: "bg-pink-500" },
  { value: "text-orange-500", label: "Orange", preview: "bg-orange-500" },
  { value: "text-cyan-500", label: "Cyan", preview: "bg-cyan-500" },
  { value: "text-emerald-500", label: "Emerald", preview: "bg-emerald-500" },
  { value: "text-indigo-500", label: "Indigo", preview: "bg-indigo-500" },
];

const getIconComponent = (iconName: string): LucideIcon => {
  const found = ICON_OPTIONS.find(o => o.value === iconName);
  return found?.icon || CreditCard;
};

const AdminGatewayManagement = () => {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gatewayStats, setGatewayStats] = useState<Record<string, GatewayStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGateway, setSelectedGateway] = useState<Gateway | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    success_rate: '',
    speed: '',
    description: '',
    icon_name: '',
    icon_color: '',
    charge_amount: '',
    card_types: '',
    cvc_required: true,
  });

  const fetchGatewayStats = useCallback(async () => {
    const PAGE_SIZE = 1000;
    let allChecks: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('card_checks')
        .select('gateway, result')
        .range(from, from + PAGE_SIZE - 1);
      if (error) break;
      if (!data || data.length === 0) break;
      allChecks = [...allChecks, ...data];
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const statsMap: Record<string, GatewayStats> = {};
    allChecks.forEach(check => {
      const gateway = check.gateway;
      if (!statsMap[gateway]) {
        statsMap[gateway] = { total_checks: 0, live_count: 0, dead_count: 0 };
      }
      statsMap[gateway].total_checks++;
      const resultLower = check.result?.toLowerCase() || '';
      if (gateway === 'killer_auth') {
        if (resultLower.includes('killed')) statsMap[gateway].live_count++;
        else if (resultLower.includes('unknown')) statsMap[gateway].dead_count++;
      } else {
        if (resultLower.includes('live') || resultLower.includes('approved')) statsMap[gateway].live_count++;
        else if (resultLower.includes('dead') || resultLower.includes('declined')) statsMap[gateway].dead_count++;
      }
    });
    setGatewayStats(statsMap);
  }, []);

  const fetchGateways = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('gateways')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching gateways:', error);
      toast.error("Failed to fetch gateways");
    } else {
      setGateways(data || []);
    }
    await fetchGatewayStats();
    setLoading(false);
  }, [fetchGatewayStats]);

  useEffect(() => {
    fetchGateways();
  }, [fetchGateways]);

  // Real-time subscription
  useEffect(() => {
    if (!isLive) return;

    const channel = supabase
      .channel('admin-gateways-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gateways' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setGateways(prev => [...prev, payload.new as Gateway].sort((a, b) => a.display_order - b.display_order));
          } else if (payload.eventType === 'UPDATE') {
            setGateways(prev => prev.map(g => g.id === (payload.new as Gateway).id ? payload.new as Gateway : g));
          } else if (payload.eventType === 'DELETE') {
            setGateways(prev => prev.filter(g => g.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLive]);

  const handleToggleActive = async (gateway: Gateway) => {
    setActionLoading(true);
    const { error } = await supabase
      .from('gateways')
      .update({ is_active: !gateway.is_active, updated_at: new Date().toISOString() })
      .eq('id', gateway.id);

    if (error) {
      toast.error("Failed to update gateway");
    } else {
      toast.success(`Gateway ${gateway.is_active ? 'disabled' : 'enabled'}`);
    }
    setActionLoading(false);
  };

  const handleToggleStatus = async (gateway: Gateway) => {
    const newStatus = gateway.status === 'online' ? 'offline' : 'online';
    setActionLoading(true);
    const { error } = await supabase
      .from('gateways')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', gateway.id);

    if (error) {
      toast.error("Failed to update gateway status");
    } else {
      toast.success(`Gateway status set to ${newStatus}`);
    }
    setActionLoading(false);
  };

  const handleOpenEdit = (gateway: Gateway) => {
    setSelectedGateway(gateway);
    setEditForm({
      name: gateway.name,
      status: gateway.status,
      success_rate: gateway.success_rate,
      speed: gateway.speed,
      description: gateway.description,
      icon_name: gateway.icon_name,
      icon_color: gateway.icon_color,
      charge_amount: gateway.charge_amount || '',
      card_types: gateway.card_types,
      cvc_required: gateway.cvc_required,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedGateway) return;

    setActionLoading(true);
    const { error } = await supabase
      .from('gateways')
      .update({
        name: editForm.name,
        status: editForm.status,
        success_rate: editForm.success_rate,
        speed: editForm.speed,
        description: editForm.description,
        icon_name: editForm.icon_name,
        icon_color: editForm.icon_color,
        charge_amount: editForm.charge_amount || null,
        card_types: editForm.card_types,
        cvc_required: editForm.cvc_required,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedGateway.id);

    if (error) {
      toast.error("Failed to update gateway");
    } else {
      toast.success("Gateway updated successfully");
      setShowEditDialog(false);
    }
    setActionLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Online</Badge>;
      case 'offline':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Offline</Badge>;
      case 'maintenance':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Maintenance</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredGateways = gateways.filter(gateway => {
    const query = searchQuery.toLowerCase();
    return (
      gateway.name.toLowerCase().includes(query) ||
      gateway.code?.toLowerCase().includes(query) ||
      gateway.type.toLowerCase().includes(query)
    );
  });

  const IconPreview = ({ iconName, iconColor }: { iconName: string; iconColor: string }) => {
    const Icon = getIconComponent(iconName);
    return <Icon className={`h-5 w-5 ${iconColor}`} />;
  };

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Gateway Management
              {isLive && (
                <span className="flex items-center gap-1 text-xs font-normal text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                  <Wifi className="h-3 w-3" />
                  Live
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant={isLive ? "default" : "outline"}
                size="sm"
                onClick={() => setIsLive(!isLive)}
                className="gap-1"
              >
                <Wifi className="h-3.5 w-3.5" />
                {isLive ? "Live" : "Paused"}
              </Button>
              <Button variant="outline" size="sm" onClick={fetchGateways}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search gateways..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto pb-4 -mx-2 px-2">
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {filteredGateways.map((gateway) => {
                  const stats = gatewayStats[gateway.id] || { total_checks: 0, live_count: 0, dead_count: 0 };
                  const actualSuccessRate = stats.total_checks > 0 
                    ? ((stats.live_count / stats.total_checks) * 100).toFixed(1) + '%'
                    : 'N/A';
                  
                  return (
                    <Card key={gateway.id} className="min-w-[240px] w-[240px] bg-secondary/30 border-border flex-shrink-0">
                      <CardContent className="p-4 space-y-3">
                        {/* Header: Icon + Name + Status */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <IconPreview iconName={gateway.icon_name} iconColor={gateway.icon_color} />
                            <div>
                              <p className="font-medium text-sm leading-tight">{gateway.name}</p>
                              <p className="text-[10px] text-muted-foreground">{gateway.code || gateway.id}</p>
                            </div>
                          </div>
                          <button onClick={() => handleToggleStatus(gateway)} disabled={actionLoading}>
                            {getStatusBadge(gateway.status)}
                          </button>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="p-2 rounded bg-secondary/50">
                            <p className="text-[10px] text-muted-foreground">Checks</p>
                            <p className="text-sm font-bold">{stats.total_checks.toLocaleString()}</p>
                          </div>
                          <div className="p-2 rounded bg-secondary/50">
                            <p className="text-[10px] text-muted-foreground">Success</p>
                            <p className="text-sm font-bold text-green-400">{actualSuccessRate}</p>
                          </div>
                        </div>

                        {/* Type + Speed */}
                        <div className="flex items-center justify-between text-xs">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{gateway.type}</Badge>
                          <span className="text-muted-foreground">{gateway.speed}</span>
                        </div>

                        {/* Actions: Active toggle + Edit */}
                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={gateway.is_active}
                              onCheckedChange={() => handleToggleActive(gateway)}
                              disabled={actionLoading}
                            />
                            <span className="text-xs text-muted-foreground">
                              {gateway.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenEdit(gateway)}
                            className="gap-1 h-7 text-xs"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
          )}
        </CardContent>
      </Card>

      {/* Edit Gateway Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Edit Gateway
            </DialogTitle>
            <DialogDescription>
              Update gateway settings. Changes save to the database and reflect in real time.
            </DialogDescription>
          </DialogHeader>

          {/* Live Preview */}
          {selectedGateway && (
            <div className="p-3 rounded-lg bg-secondary/50 border border-border flex items-center gap-3">
              <IconPreview iconName={editForm.icon_name} iconColor={editForm.icon_color} />
              <div>
                <p className="font-medium text-sm">{editForm.name || 'Gateway Name'}</p>
                <p className="text-xs text-muted-foreground">{editForm.description || 'Description'}</p>
              </div>
              {getStatusBadge(editForm.status)}
            </div>
          )}

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Gateway Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="bg-secondary border-border min-h-[60px]"
              />
            </div>

            {/* Icon & Color side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Icon (Logo)</Label>
                <Select
                  value={editForm.icon_name}
                  onValueChange={(v) => setEditForm({ ...editForm, icon_name: v })}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {opt.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>UI Color</Label>
                <Select
                  value={editForm.icon_color}
                  onValueChange={(v) => setEditForm({ ...editForm, icon_color: v })}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${opt.preview}`} />
                          {opt.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status & Speed */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                >
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Speed</Label>
                <Input
                  value={editForm.speed}
                  onChange={(e) => setEditForm({ ...editForm, speed: e.target.value })}
                  className="bg-secondary border-border"
                  placeholder="e.g. Fast, Medium"
                />
              </div>
            </div>

            {/* Success Rate & Charge Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Success Rate (display)</Label>
                <Input
                  value={editForm.success_rate}
                  onChange={(e) => setEditForm({ ...editForm, success_rate: e.target.value })}
                  className="bg-secondary border-border"
                  placeholder="e.g. 90%"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Charge Amount</Label>
                <Input
                  value={editForm.charge_amount}
                  onChange={(e) => setEditForm({ ...editForm, charge_amount: e.target.value })}
                  className="bg-secondary border-border"
                  placeholder="e.g. $1, £0.30"
                />
              </div>
            </div>

            {/* Card Types & CVC */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Card Types</Label>
                <Input
                  value={editForm.card_types}
                  onChange={(e) => setEditForm({ ...editForm, card_types: e.target.value })}
                  className="bg-secondary border-border"
                  placeholder="e.g. Visa/MC"
                />
              </div>

              <div className="space-y-1.5">
                <Label>CVC Required</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={editForm.cvc_required}
                    onCheckedChange={(v) => setEditForm({ ...editForm, cvc_required: v })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {editForm.cvc_required ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminGatewayManagement;
