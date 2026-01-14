import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
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
  amount: number;
  method?: string;
  gateway?: string;
  date: string;
  status: string;
}

const Balance = () => {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    setUserId(user.id);

    // Fetch balance
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setBalance(profile?.balance || 0);

    // Fetch topup transactions
    const { data: topups } = await supabase
      .from("topup_transactions")
      .select("id, amount, payment_method, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch card checks
    const { data: checks } = await supabase
      .from("card_checks")
      .select("id, gateway, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Combine and sort transactions
    const allTransactions: Transaction[] = [];

    if (topups) {
      topups.forEach((tx: TopupTransaction) => {
        allTransactions.push({
          id: tx.id,
          type: "topup",
          amount: tx.status === "completed" ? tx.amount : 0,
          method: tx.payment_method,
          date: tx.created_at,
          status: tx.status
        });
      });
    }

    if (checks) {
      checks.forEach((check: CardCheck) => {
        allTransactions.push({
          id: check.id,
          type: "check",
          amount: -0.50, // Default check cost
          gateway: check.gateway,
          date: check.created_at,
          status: check.status
        });
      });
    }

    // Sort by date descending
    allTransactions.sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    setTransactions(allTransactions);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time subscription for balance updates
  useEffect(() => {
    if (!userId) return;

    const profileChannel = supabase
      .channel('balance-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Balance updated:', payload);
          if (payload.new && typeof payload.new.balance === 'number') {
            setBalance(payload.new.balance);
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
          // Refetch all data to ensure consistency
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
  const totalDeposits = completedTopups.reduce((sum, t) => sum + t.amount, 0);
  const totalSpent = Math.abs(
    transactions
      .filter(t => t.type === "check" && t.status === "completed")
      .reduce((sum, t) => sum + t.amount, 0)
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
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Balance & History</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">View your balance and transaction history</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30 col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Current Balance
            </CardTitle>
            <Wallet className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-primary">
              ${balance.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Available funds</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total Deposits
            </CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-green-500">${totalDeposits.toFixed(2)}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Total Spent
            </CardTitle>
            <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-destructive">${totalSpent.toFixed(2)}</div>
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
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-2 sm:space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <Clock className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 opacity-50" />
                <p className="text-sm sm:text-base">No transactions yet</p>
                <p className="text-xs sm:text-sm mt-1">Your transaction history will appear here</p>
              </div>
            ) : (
              transactions.map((tx) => (
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
                        {tx.type === "topup" ? `Topup via ${tx.method}` : `Check - ${tx.gateway}`}
                      </p>
                      <p className="text-[10px] sm:text-sm text-muted-foreground">{formatDate(tx.date)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className={`font-bold text-xs sm:text-base ${
                      tx.type === "topup" 
                        ? tx.status === "completed" 
                          ? "text-green-500" 
                          : "text-muted-foreground"
                        : "text-foreground"
                    }`}>
                      {tx.type === "topup" ? "+" : ""}{tx.type === "topup" ? tx.amount.toFixed(2) : tx.amount.toFixed(2)} <span className="hidden sm:inline">USD</span>
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] sm:text-xs ${getStatusBadgeClass(tx.status)}`}
                    >
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Balance;
