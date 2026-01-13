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
  History
} from "lucide-react";

// Mock transaction history
const transactions = [
  { id: 1, type: "topup", amount: 50, method: "Bitcoin", date: "2024-01-10", status: "completed" },
  { id: 2, type: "check", amount: -0.50, gateway: "Stripe", date: "2024-01-10", status: "completed" },
  { id: 3, type: "check", amount: -0.50, gateway: "Braintree", date: "2024-01-09", status: "completed" },
  { id: 4, type: "topup", amount: 25, method: "USDT", date: "2024-01-08", status: "completed" },
  { id: 5, type: "check", amount: -0.50, gateway: "Stripe", date: "2024-01-08", status: "failed" },
];

const Balance = () => {
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    const fetchBalance = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();
        setBalance(data?.balance || 0);
      }
    };
    fetchBalance();
  }, []);

  const totalDeposits = transactions.filter(t => t.type === "topup").reduce((sum, t) => sum + t.amount, 0);
  const totalSpent = Math.abs(transactions.filter(t => t.type === "check").reduce((sum, t) => sum + t.amount, 0));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Balance & History</h1>
        <p className="text-muted-foreground mt-1">View your balance and transaction history</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Balance
            </CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              ${balance.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Available funds</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Deposits
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">${totalDeposits.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spent
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${totalSpent.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Checks
            </CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.filter(t => t.type === "check").length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No transactions yet</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === "topup" ? "bg-green-500/20" : "bg-primary/20"
                    }`}>
                      {tx.type === "topup" ? (
                        <ArrowUpRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {tx.type === "topup" ? `Topup via ${tx.method}` : `Check - ${tx.gateway}`}
                      </p>
                      <p className="text-sm text-muted-foreground">{tx.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${tx.amount > 0 ? "text-green-500" : "text-foreground"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)} USD
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        tx.status === "completed" 
                          ? "border-green-500/50 text-green-500" 
                          : "border-destructive/50 text-destructive"
                      }`}
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
