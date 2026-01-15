import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  CreditCard,
  History,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";

interface TopupTransaction {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface CardCheck {
  id: string;
  gateway: string;
  status: string;
  created_at: string;
}

interface Transaction {
  id: string;
  type: "topup" | "check";
  credits: number;
  method?: string;
  gateway?: string;
  date: string;
  status: string;
}

const ITEMS_PER_PAGE = 50;

// Gateway display name mapping
const GATEWAY_DISPLAY_NAMES: Record<string, string> = {
  "stripe_auth": "Yunchi Auth",
  "stripe_preauth": "Yunchi Pre Auth",
  "braintree_auth": "Yunchi Auth 2",
  "clover_charge": "Yunchi Clover",
  "square_charge": "Yunchi Square",
  "shopify_charge": "Yunchi Shopify",
};

const getGatewayDisplayName = (gateway: string): string => {
  return GATEWAY_DISPLAY_NAMES[gateway] || gateway;
};

const Balance = () => {
  const [credits, setCredits] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchData = async (loadMore = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    setUserId(user.id);

    if (!loadMore) {
      setLoading(true);
    }

    // Fetch credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setCredits(profile?.credits || 0);

    // Get total counts for pagination
    const [{ count: topupCount }, { count: checkCount }] = await Promise.all([
      supabase.from("topup_transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("card_checks").select("id", { count: "exact", head: true }).eq("user_id", user.id)
    ]);

    const total = (topupCount || 0) + (checkCount || 0);
    setTotalCount(total);

    // Calculate offset for pagination
    const currentOffset = loadMore ? transactions.length : 0;
    const halfPage = Math.ceil(ITEMS_PER_PAGE / 2);

    // Fetch topup transactions with pagination
    const { data: topups } = await supabase
      .from("topup_transactions")
      .select("id, amount, payment_method, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(loadMore ? Math.floor(currentOffset / 2) : 0, loadMore ? Math.floor(currentOffset / 2) + halfPage - 1 : halfPage - 1);

    // Fetch card checks with pagination
    const { data: checks } = await supabase
      .from("card_checks")
      .select("id, gateway, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(loadMore ? Math.floor(currentOffset / 2) : 0, loadMore ? Math.floor(currentOffset / 2) + halfPage - 1 : halfPage - 1);

    // Combine and sort transactions
    const newTransactions: Transaction[] = [];

    if (topups) {
      topups.forEach((tx: TopupTransaction) => {
        newTransactions.push({
          id: tx.id,
          type: "topup",
          credits: tx.status === "completed" ? tx.amount : 0,
          method: tx.payment_method,
          date: tx.created_at,
          status: tx.status
        });
      });
    }

    if (checks) {
      checks.forEach((check: CardCheck) => {
        newTransactions.push({
          id: check.id,
          type: "check",
          credits: -1,
          gateway: check.gateway,
          date: check.created_at,
          status: check.status
        });
      });
    }

    // Sort by date descending
    newTransactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    if (loadMore) {
      setTransactions(prev => {
        const existingIds = new Set(prev.map(t => t.id));
        const uniqueNew = newTransactions.filter(t => !existingIds.has(t.id));
        return [...prev, ...uniqueNew];
      });
    } else {
      setTransactions(newTransactions);
    }

    const fetchedCount = loadMore ? transactions.length + newTransactions.length : newTransactions.length;
    setHasMore(newTransactions.length > 0 && fetchedCount < total);
    setLoading(false);
    setLoadingMore(false);
  };

  const loadMoreTransactions = async () => {
    setLoadingMore(true);
    await fetchData(true);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time subscription for credits updates
  useEffect(() => {
    if (!userId) return;

    const profileChannel = supabase
      .channel('credits-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Credits updated:', payload);
          if (payload.new && typeof payload.new.credits === 'number') {
            setCredits(payload.new.credits);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [userId]);

  // Real-time subscription for topup transactions
  useEffect(() => {
    if (!userId) return;

    const topupChannel = supabase
      .channel('topup-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topup_transactions',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Topup transaction updated:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(topupChannel);
    };
  }, [userId]);

  // Real-time subscription for card checks
  useEffect(() => {
    if (!userId) return;

    const checkChannel = supabase
      .channel('check-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'card_checks',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Card check updated:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(checkChannel);
    };
  }, [userId]);

  const completedTopups = transactions.filter(t => t.type === "topup" && t.status === "completed");
  const totalCreditsAdded = completedTopups.reduce((sum, t) => sum + t.credits, 0);
  const totalCreditsUsed = Math.abs(
    transactions
      .filter(t => t.type === "check" && t.status === "completed")
      .reduce((sum, t) => sum + t.credits, 0)
  );
  const totalChecks = transactions.filter(t => t.type === "check").length;

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed":
        return "border-green-500/50 text-green-500";
      case "pending":
        return "border-yellow-500/50 text-yellow-500";
      case "failed":
        return "border-destructive/50 text-destructive";
      default:
        return "border-muted-foreground/50 text-muted-foreground";
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy HH:mm");
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Credits & History</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">View your credits and transaction history</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Current Credits
            </CardTitle>
            <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-primary flex items-center gap-1">
              {credits.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground">credits</span>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Available to use</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Credits Added
            </CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-green-500">{totalCreditsAdded.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Credits Used
            </CardTitle>
            <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-destructive">{totalCreditsUsed.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total Checks
            </CardTitle>
            <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold">{totalChecks}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Transaction History
            <Badge variant="outline" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              Live
            </Badge>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground font-normal ml-auto">
                {transactions.length} of {totalCount}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          {transactions.length === 0 ? (
            <div className="text-center py-6 sm:py-8 text-muted-foreground">
              <Clock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 opacity-50" />
              <p className="text-sm sm:text-base">No transactions yet</p>
              <p className="text-xs sm:text-sm mt-1">Your transaction history will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] sm:h-[500px] pr-3">
              <div className="space-y-2 sm:space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-2 sm:p-4 rounded-lg bg-secondary/50 border border-border transition-all hover:bg-secondary/70"
                  >
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                        tx.type === "topup" 
                          ? tx.status === "completed" 
                            ? "bg-green-500/20" 
                            : tx.status === "pending"
                              ? "bg-yellow-500/20"
                              : "bg-destructive/20"
                          : "bg-primary/20"
                      }`}>
                        {tx.type === "topup" ? (
                          <ArrowUpRight className={`h-4 w-4 sm:h-5 sm:w-5 ${
                            tx.status === "completed" 
                              ? "text-green-500" 
                              : tx.status === "pending"
                                ? "text-yellow-500"
                                : "text-destructive"
                          }`} />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">
                          {tx.type === "topup" ? `Credit Purchase via ${tx.method}` : `Check - ${getGatewayDisplayName(tx.gateway || '')}`}
                        </p>
                        <p className="text-[10px] sm:text-sm text-muted-foreground">{formatDate(tx.date)}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={`font-bold text-xs sm:text-base flex items-center gap-1 justify-end ${
                        tx.type === "topup" 
                          ? tx.status === "completed" 
                            ? "text-green-500" 
                            : "text-muted-foreground"
                          : "text-foreground"
                      }`}>
                        {tx.type === "topup" ? "+" : ""}{tx.credits}
                        <Coins className="h-3 w-3 sm:hidden" />
                        <span className="hidden sm:inline">credits</span>
                      </p>
                      <Badge
                        variant="outline"
                        className={`text-[10px] sm:text-xs ${getStatusBadgeClass(tx.status)}`}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={loadMoreTransactions}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>Load More ({totalCount - transactions.length} remaining)</>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Balance;
