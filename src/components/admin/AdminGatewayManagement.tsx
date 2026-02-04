import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  Search,
  Loader2,
  RefreshCw,
  CreditCard,
  Settings,
  Zap,
  CheckCircle,
  XCircle,
  Edit,
  Eye
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

const AdminGatewayManagement = () => {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gatewayStats, setGatewayStats] = useState<Record<string, GatewayStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGateway, setSelectedGateway] = useState<Gateway | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    status: '',
    success_rate: '',
    speed: '',
    description: ''
  });

  const fetchGateways = async () => {
    setLoading(true);
    
    // Fetch all gateways (admin can see inactive ones too)
    const { data, error } = await supabase
      .from('gateways')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching gateways:', error);
      toast.error("Failed to fetch gateways");
    } else {
      setGateways(data || []);
      
      // Fetch stats for each gateway
      if (data && data.length > 0) {
        const { data: checksData } = await supabase
          .from('card_checks')
          .select('gateway, result');

        if (checksData) {
          const statsMap: Record<string, GatewayStats> = {};
          checksData.forEach(check => {
            const gateway = check.gateway;
            if (!statsMap[gateway]) {
              statsMap[gateway] = { total_checks: 0, live_count: 0, dead_count: 0 };
            }
            statsMap[gateway].total_checks++;
            const resultLower = check.result?.toLowerCase() || '';
            // For Killer Auth, 'killed' = success, 'unknown' = failure
            if (gateway === 'killer_auth') {
              if (resultLower.includes('killed')) {
                statsMap[gateway].live_count++;
              } else if (resultLower.includes('unknown')) {
                statsMap[gateway].dead_count++;
              }
            } else {
              if (resultLower.includes('live') || resultLower.includes('approved')) {
                statsMap[gateway].live_count++;
              } else if (resultLower.includes('dead') || resultLower.includes('declined')) {
                statsMap[gateway].dead_count++;
              }
            }
          });
          setGatewayStats(statsMap);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGateways();
  }, []);

  const handleToggleActive = async (gateway: Gateway) => {
    setActionLoading(true);
    const { error } = await supabase
      .from('gateways')
      .update({ 
        is_active: !gateway.is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', gateway.id);

    if (error) {
      console.error('Error toggling gateway:', error);
      toast.error("Failed to update gateway");
    } else {
      toast.success(`Gateway ${gateway.is_active ? 'disabled' : 'enabled'}`);
      fetchGateways();
    }
    setActionLoading(false);
  };

  const handleToggleStatus = async (gateway: Gateway) => {
    const newStatus = gateway.status === 'online' ? 'offline' : 'online';
    setActionLoading(true);
    const { error } = await supabase
      .from('gateways')
      .update({ 
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', gateway.id);

    if (error) {
      console.error('Error updating gateway status:', error);
      toast.error("Failed to update gateway status");
    } else {
      toast.success(`Gateway status set to ${newStatus}`);
      fetchGateways();
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
      description: gateway.description
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
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedGateway.id);

    if (error) {
      console.error('Error updating gateway:', error);
      toast.error("Failed to update gateway");
    } else {
      toast.success("Gateway updated successfully");
      setShowEditDialog(false);
      fetchGateways();
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

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Gateway Management
            </span>
            <Button variant="outline" size="sm" onClick={fetchGateways}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
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
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>Gateway</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Checks</TableHead>
                    <TableHead>Success</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGateways.map((gateway) => {
                    const stats = gatewayStats[gateway.id] || { total_checks: 0, live_count: 0, dead_count: 0 };
                    const actualSuccessRate = stats.total_checks > 0 
                      ? ((stats.live_count / stats.total_checks) * 100).toFixed(1) + '%'
                      : 'N/A';
                    
                    return (
                      <TableRow key={gateway.id} className="hover:bg-secondary/30">
                        <TableCell>
                          <div>
                            <p className="font-medium">{gateway.name}</p>
                            <p className="text-xs text-muted-foreground">{gateway.code || gateway.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{gateway.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <button onClick={() => handleToggleStatus(gateway)} disabled={actionLoading}>
                            {getStatusBadge(gateway.status)}
                          </button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {stats.total_checks.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className="text-green-400">{actualSuccessRate}</span>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={gateway.is_active}
                            onCheckedChange={() => handleToggleActive(gateway)}
                            disabled={actionLoading}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleOpenEdit(gateway)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Edit Gateway Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Edit Gateway</DialogTitle>
            <DialogDescription>
              Update gateway settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="mt-1 bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-secondary text-foreground"
              >
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Speed</label>
              <Input
                value={editForm.speed}
                onChange={(e) => setEditForm({ ...editForm, speed: e.target.value })}
                className="mt-1 bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Success Rate (displayed)</label>
              <Input
                value={editForm.success_rate}
                onChange={(e) => setEditForm({ ...editForm, success_rate: e.target.value })}
                className="mt-1 bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="mt-1 bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminGatewayManagement;
