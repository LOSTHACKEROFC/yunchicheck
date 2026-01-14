import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  Loader2,
  RefreshCw,
  DollarSign,
  Users,
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  X
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TopupTransaction {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  status: string;
  wallet_address: string | null;
  transaction_hash: string | null;
  proof_image_url: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Profile {
  username: string | null;
  balance: number;
}

const AdminTopups = () => {
  const [transactions, setTransactions] = useState<TopupTransaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTx, setSelectedTx] = useState<TopupTransaction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({ pending: 0, completed: 0, total: 0 });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

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

  // Fetch transactions
  const fetchTransactions = async () => {
    if (!isAdmin) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('topup_transactions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      toast.error("Failed to fetch transactions");
    } else {
      setTransactions(data || []);
      
      // Calculate stats
      const pending = data?.filter(t => t.status === 'pending').length || 0;
      const completed = data?.filter(t => t.status === 'completed').length || 0;
      const total = data?.reduce((sum, t) => t.status === 'completed' ? sum + Number(t.amount) : sum, 0) || 0;
      setStats({ pending, completed, total });

      // Fetch user profiles
      const userIds = [...new Set(data?.map(t => t.user_id) || [])];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, balance')
          .in('user_id', userIds);

        const profilesMap: Record<string, Profile> = {};
        profilesData?.forEach(p => {
          profilesMap[p.user_id] = { username: p.username, balance: p.balance };
        });
        setProfiles(profilesMap);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchTransactions();
    }
  }, [isAdmin]);

  // Real-time subscription
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('admin-topup-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topup_transactions'
        },
        () => {
          fetchTransactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  const handleUpdateStatus = async (status: 'completed' | 'failed', reason?: string) => {
    if (!selectedTx) return;

    setActionLoading(true);
    
    const updateData: { status: string; rejection_reason?: string } = { status };
    if (status === 'failed' && reason) {
      updateData.rejection_reason = reason;
    }
    
    const { error } = await supabase
      .from('topup_transactions')
      .update(updateData)
      .eq('id', selectedTx.id);

    setActionLoading(false);

    if (error) {
      console.error('Error updating transaction:', error);
      toast.error("Failed to update transaction");
    } else {
      toast.success(`Transaction ${status === 'completed' ? 'approved' : 'rejected'}`);
      setSelectedTx(null);
      setRejectionReason("");
      setShowRejectConfirm(false);
    }
  };
  
  const handleRejectClick = () => {
    setShowRejectConfirm(true);
  };
  
  const handleConfirmReject = () => {
    handleUpdateStatus('failed', rejectionReason);
  };
  
  const handleCancelReject = () => {
    setShowRejectConfirm(false);
    setRejectionReason("");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      btc: 'Bitcoin',
      eth: 'Ethereum',
      ltc: 'Litecoin',
      usdt: 'USDT TRC20'
    };
    return labels[method] || method;
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      profiles[tx.user_id]?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Admin: Topup Management</h1>
        <p className="text-muted-foreground mt-1">Review and approve pending topup transactions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approvals</p>
                <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Processed</p>
                <p className="text-2xl font-bold text-primary">${stats.total.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              All Transactions
            </span>
            <Button variant="outline" size="sm" onClick={fetchTransactions}>
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
                placeholder="Search by username or ID..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No transactions found
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead>User</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-secondary/30">
                      <TableCell>
                        <div>
                          <p className="font-medium">{profiles[tx.user_id]?.username || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">
                            Balance: ${profiles[tx.user_id]?.balance?.toFixed(2) || '0.00'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-primary">
                        ${Number(tx.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{getPaymentMethodLabel(tx.payment_method)}</TableCell>
                      <TableCell>{getStatusBadge(tx.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(tx.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTx(tx)}
                          >
                            Review
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Review Transaction</DialogTitle>
            <DialogDescription>
              Approve or reject this topup request
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">User</p>
                  <p className="font-medium">{profiles[selectedTx.user_id]?.username || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium text-primary">${Number(selectedTx.amount).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Method</p>
                  <p className="font-medium">{getPaymentMethodLabel(selectedTx.payment_method)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className="font-medium">${profiles[selectedTx.user_id]?.balance?.toFixed(2) || '0.00'}</p>
                </div>
              </div>

              {selectedTx.proof_image_url && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Payment Proof
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLightboxImage(selectedTx.proof_image_url)}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ZoomIn className="h-3 w-3" />
                        Zoom
                      </button>
                      <a
                        href={selectedTx.proof_image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        Open Full Size
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div 
                    className="relative rounded-lg overflow-hidden border border-border bg-secondary cursor-zoom-in group"
                    onClick={() => setLightboxImage(selectedTx.proof_image_url)}
                  >
                    <img
                      src={selectedTx.proof_image_url}
                      alt="Payment proof"
                      className="w-full max-h-64 object-contain transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              )}

              {selectedTx.wallet_address && (
                <div className="p-3 bg-secondary rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Wallet Address</p>
                  <p className="text-xs font-mono break-all">{selectedTx.wallet_address}</p>
                </div>
              )}

              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-sm text-yellow-400">
                  Approving this transaction will add ${Number(selectedTx.amount).toFixed(2)} to the user's balance.
                </p>
              </div>
            </div>
          )}

          {showRejectConfirm ? (
            <div className="space-y-4 w-full">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Rejection Reason
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter the reason for rejection (optional but recommended)..."
                  className="w-full min-h-[80px] px-3 py-2 rounded-md border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleCancelReject}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmReject}
                  disabled={actionLoading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Confirm Rejection
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={handleRejectClick}
                disabled={actionLoading}
                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={() => handleUpdateStatus('completed')}
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <img
            src={lightboxImage}
            alt="Payment proof full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default AdminTopups;
