import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  Loader2,
  RefreshCw,
  DollarSign,
  Image as ImageIcon,
  ExternalLink,
  ZoomIn,
  X,
  CreditCard
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
  rejection_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Profile {
  username: string | null;
  credits: number;
  telegram_username: string | null;
}

const TopupUser = () => {
  const [transactions, setTransactions] = useState<TopupTransaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTx, setSelectedTx] = useState<TopupTransaction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showRejectAllConfirm, setShowRejectAllConfirm] = useState(false);
  const [rejectAllReason, setRejectAllReason] = useState("");
  const [rejectAllLoading, setRejectAllLoading] = useState(false);
  const [stats, setStats] = useState({ pending: 0, totalCredits: 0 });
  
  // Track previous pending count for sound notification
  const prevPendingCountRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasInitialLoad = useRef(false);

  // Sound notification for new pending topups
  const playNewTopupSound = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Play a cash register / coin drop sound effect
      const playTone = (frequency: number, startTime: number, duration: number, volume: number = 0.3) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      // Ascending "cha-ching" sound
      playTone(880, now, 0.08, 0.25);        // A5
      playTone(1108.73, now + 0.06, 0.08, 0.25); // C#6
      playTone(1318.51, now + 0.12, 0.15, 0.3);  // E6
      playTone(1760, now + 0.18, 0.25, 0.35);    // A6
    } catch (error) {
      console.warn("Could not play topup notification sound:", error);
    }
  }, []);

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

  // Fetch pending transactions only
  const fetchTransactions = async () => {
    if (!isAdmin) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      toast.error("Failed to fetch transactions");
    } else {
      setTransactions(data || []);
      
      // Calculate stats
      const pending = data?.length || 0;
      const totalCredits = data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      setStats({ pending, totalCredits });

      // Fetch user profiles
      const userIds = [...new Set(data?.map(t => t.user_id) || [])];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, credits, telegram_username')
          .in('user_id', userIds);

        const profilesMap: Record<string, Profile> = {};
        profilesData?.forEach(p => {
          profilesMap[p.user_id] = { 
            username: p.username, 
            credits: p.credits,
            telegram_username: p.telegram_username
          };
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

  // Real-time subscription for pending topups with sound notification
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('topupuser-pending-transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'topup_transactions',
          filter: 'status=eq.pending'
        },
        (payload) => {
          // New pending topup arrived - play sound and show toast
          if (hasInitialLoad.current) {
            playNewTopupSound();
            const amount = (payload.new as TopupTransaction).amount;
            toast.info(`💰 New topup request: ${Number(amount).toLocaleString()} credits`, {
              duration: 5000,
            });
          }
          fetchTransactions();
        }
      )
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
  }, [isAdmin, playNewTopupSound]);

  // Mark initial load complete after first fetch
  useEffect(() => {
    if (!loading && isAdmin && !hasInitialLoad.current) {
      hasInitialLoad.current = true;
      prevPendingCountRef.current = stats.pending;
    }
  }, [loading, isAdmin, stats.pending]);

  const handleApprove = async () => {
    if (!selectedTx) return;

    setActionLoading(true);
    
    try {
      const { data, error } = await supabase.rpc('handle_topup_completion', {
        p_transaction_id: selectedTx.id
      });

      if (error) {
        console.error('Error completing topup:', error);
        toast.error("Failed to approve transaction");
        setActionLoading(false);
        return;
      }

      const result = data as { success: boolean; error?: string; credits?: number } | null;
      if (result && !result.success) {
        toast.error(result.error || "Failed to approve transaction");
        setActionLoading(false);
        return;
      }

      toast.success(`✅ Approved! ${result?.credits || selectedTx.amount} credits added to user`);
      setSelectedTx(null);
    } catch (err) {
      console.error('Error updating transaction:', err);
      toast.error("Failed to update transaction");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTx) return;

    setActionLoading(true);
    
    try {
      const { error } = await supabase
        .from('topup_transactions')
        .update({ 
          status: 'failed',
          rejection_reason: rejectionReason || 'Rejected by admin',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTx.id);

      if (error) {
        console.error('Error rejecting transaction:', error);
        toast.error("Failed to reject transaction");
        setActionLoading(false);
        return;
      }

      toast.success("❌ Transaction rejected");
      setSelectedTx(null);
      setRejectionReason("");
      setShowRejectConfirm(false);
    } catch (err) {
      console.error('Error updating transaction:', err);
      toast.error("Failed to update transaction");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectAll = async () => {
    if (transactions.length === 0) return;

    setRejectAllLoading(true);
    
    try {
      const pendingIds = transactions.map(tx => tx.id);
      
      const { error } = await supabase
        .from('topup_transactions')
        .update({ 
          status: 'failed',
          rejection_reason: rejectAllReason || 'Bulk rejected by admin',
          updated_at: new Date().toISOString()
        })
        .in('id', pendingIds);

      if (error) {
        console.error('Error rejecting all transactions:', error);
        toast.error("Failed to reject transactions");
        setRejectAllLoading(false);
        return;
      }

      toast.success(`❌ Rejected ${pendingIds.length} pending topups`);
      setShowRejectAllConfirm(false);
      setRejectAllReason("");
    } catch (err) {
      console.error('Error rejecting all transactions:', err);
      toast.error("Failed to reject transactions");
    } finally {
      setRejectAllLoading(false);
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      btc: 'Bitcoin',
      eth: 'Ethereum',
      ltc: 'Litecoin',
      usdt: 'USDT TRC20'
    };
    return labels[method] || method.toUpperCase();
  };

  const filteredTransactions = transactions.filter(tx => {
    const username = profiles[tx.user_id]?.username?.toLowerCase() || '';
    const telegram = profiles[tx.user_id]?.telegram_username?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    return username.includes(query) || telegram.includes(query) || tx.id.toLowerCase().includes(query);
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
        <h1 className="text-3xl font-display font-bold text-foreground">Pending Topups</h1>
        <p className="text-muted-foreground mt-1">Review and process user topup requests</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
                <p className="text-3xl font-bold text-yellow-400">{stats.pending}</p>
              </div>
              <Clock className="h-10 w-10 text-yellow-400/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Credits Pending</p>
                <p className="text-3xl font-bold text-primary">{stats.totalCredits.toLocaleString()}</p>
              </div>
              <CreditCard className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Refresh */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Pending Requests
            </span>
            <div className="flex items-center gap-2">
              {transactions.length > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowRejectAllConfirm(true)}
                  className="gap-1"
                >
                  <XCircle className="h-4 w-4" />
                  Reject All ({transactions.length})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={fetchTransactions}>
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
              placeholder="Search by username, telegram, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500/50" />
              <p className="text-lg">No pending requests!</p>
              <p className="text-sm">All topup requests have been processed.</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3 pr-4">
                {filteredTransactions.map((tx) => (
                  <Card 
                    key={tx.id} 
                    className="bg-secondary/50 border-border hover:bg-secondary/80 transition-colors cursor-pointer"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                              <span className="text-primary font-bold">
                                {profiles[tx.user_id]?.username?.[0]?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {profiles[tx.user_id]?.username || 'Unknown User'}
                              </p>
                              {profiles[tx.user_id]?.telegram_username && (
                                <p className="text-xs text-muted-foreground">
                                  @{profiles[tx.user_id]?.telegram_username}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-primary font-bold">
                              {Number(tx.amount).toLocaleString()} credits
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {getPaymentMethodLabel(tx.payment_method)}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {format(new Date(tx.created_at), 'MMM d, HH:mm')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {tx.proof_image_url && (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            Pending
                          </Badge>
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

      {/* Review Dialog */}
      <Dialog open={!!selectedTx && !showRejectConfirm} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Review Topup Request
            </DialogTitle>
            <DialogDescription>
              Accept or reject this payment request
            </DialogDescription>
          </DialogHeader>

          {selectedTx && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="p-4 bg-secondary rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">
                      {profiles[selectedTx.user_id]?.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-lg">
                      {profiles[selectedTx.user_id]?.username || 'Unknown'}
                    </p>
                    {profiles[selectedTx.user_id]?.telegram_username && (
                      <p className="text-sm text-muted-foreground">
                        @{profiles[selectedTx.user_id]?.telegram_username}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-bold text-primary text-xl">{Number(selectedTx.amount).toLocaleString()} credits</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Balance</p>
                    <p className="font-medium">{profiles[selectedTx.user_id]?.credits?.toLocaleString() || '0'} credits</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Method</p>
                    <p className="font-medium">{getPaymentMethodLabel(selectedTx.payment_method)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted</p>
                    <p className="font-medium text-sm">{format(new Date(selectedTx.created_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                </div>
              </div>

              {/* Payment Proof */}
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
                        Full Size
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div 
                    className="relative rounded-lg overflow-hidden border border-border bg-secondary cursor-zoom-in"
                    onClick={() => setLightboxImage(selectedTx.proof_image_url)}
                  >
                    <img
                      src={selectedTx.proof_image_url}
                      alt="Payment proof"
                      className="w-full h-48 object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <DialogFooter className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTx(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={actionLoading}
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Accept
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectConfirm} onOpenChange={setShowRejectConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Reject Transaction
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection (optional)
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="bg-secondary border-border"
            rows={3}
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectConfirm(false);
                setRejectionReason("");
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject All Confirmation Dialog */}
      <Dialog open={showRejectAllConfirm} onOpenChange={setShowRejectAllConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Reject All Pending Topups
            </DialogTitle>
            <DialogDescription>
              This will reject all {transactions.length} pending topup requests. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Warning: You are about to reject {transactions.length} pending requests totaling {stats.totalCredits.toLocaleString()} credits.
            </p>
          </div>

          <Textarea
            placeholder="Enter rejection reason for all (optional)..."
            value={rejectAllReason}
            onChange={(e) => setRejectAllReason(e.target.value)}
            className="bg-secondary border-border"
            rows={2}
          />

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectAllConfirm(false);
                setRejectAllReason("");
              }}
              disabled={rejectAllLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectAll}
              disabled={rejectAllLoading}
              className="gap-2"
            >
              {rejectAllLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Reject All ({transactions.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox for image zoom */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="h-8 w-8" />
          </button>
          <img
            src={lightboxImage}
            alt="Payment proof"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default TopupUser;
