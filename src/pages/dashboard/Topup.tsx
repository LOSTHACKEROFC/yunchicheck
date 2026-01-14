import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowUpCircle, 
  Bitcoin, 
  Banknote, 
  Wallet,
  CheckCircle,
  Clock,
  Copy,
  History,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TopupTransaction {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  wallet_address: string | null;
  transaction_hash: string | null;
  created_at: string;
  completed_at: string | null;
}

const paymentMethods = [
  { id: "btc", name: "Bitcoin", icon: Bitcoin, fee: "0%", time: "10-30 min", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "eth", name: "Ethereum", icon: Wallet, fee: "0%", time: "5-15 min", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  { id: "ltc", name: "Litecoin", icon: Bitcoin, fee: "0%", time: "5-10 min", address: "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "usdt", name: "USDT TRC20", icon: Banknote, fee: "0%", time: "1-5 min", address: "TJYeasypBvHPcTKe5ykGEVMR8Hgb5a9r4J" },
];

const quickAmounts = [10, 25, 50, 100, 250, 500];

const Topup = () => {
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [transactions, setTransactions] = useState<TopupTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [currentTransaction, setCurrentTransaction] = useState<TopupTransaction | null>(null);

  // Fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('topup_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching transactions:', error);
      } else {
        setTransactions(data || []);
      }
      setLoadingTransactions(false);
    };

    fetchTransactions();
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('topup-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topup_transactions'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTransactions(prev => [payload.new as TopupTransaction, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as TopupTransaction;
            setTransactions(prev => 
              prev.map(t => t.id === updated.id ? updated : t)
            );
            
            // If this is the current transaction and it's completed
            if (currentTransaction?.id === updated.id && updated.status === 'completed') {
              toast.success(`$${updated.amount} has been added to your balance!`);
              setShowPayment(false);
              setCurrentTransaction(null);
              setAmount("");
              setSelectedMethod("");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTransaction]);

  const handleTopup = async () => {
    if (!amount || parseFloat(amount) < 5) {
      toast.error("Minimum topup amount is $5");
      return;
    }
    if (!selectedMethod) {
      toast.error("Please select a payment method");
      return;
    }

    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please login to continue");
      setLoading(false);
      return;
    }

    const selectedPayment = paymentMethods.find(m => m.id === selectedMethod);
    
    const { data, error } = await supabase
      .from('topup_transactions')
      .insert({
        user_id: user.id,
        amount: parseFloat(amount),
        payment_method: selectedMethod,
        wallet_address: selectedPayment?.address || null,
        status: 'pending'
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      console.error('Error creating transaction:', error);
      toast.error("Failed to create transaction");
      return;
    }

    setCurrentTransaction(data);
    setShowPayment(true);
    toast.success("Transaction created! Send payment to the address below.");
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard!");
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

  const selectedPayment = paymentMethods.find(m => m.id === selectedMethod);

  if (showPayment && currentTransaction) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Complete Payment</h1>
          <p className="text-muted-foreground mt-1">Send the exact amount to the address below</p>
        </div>

        <Card className="bg-card border-border max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedPayment && <selectedPayment.icon className="h-5 w-5 text-primary" />}
              Pay with {selectedPayment?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center p-6 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Amount to Send</p>
              <p className="text-4xl font-bold text-primary">${currentTransaction.amount}</p>
            </div>

            <div className="space-y-2">
              <Label>Wallet Address</Label>
              <div className="flex gap-2">
                <Input 
                  value={currentTransaction.wallet_address || ''} 
                  readOnly 
                  className="bg-secondary border-border font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyAddress(currentTransaction.wallet_address || '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium text-yellow-500">Waiting for Payment</p>
                <p className="text-xs text-muted-foreground">
                  Your balance will be credited automatically once payment is confirmed
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setShowPayment(false);
                  setCurrentTransaction(null);
                }}
              >
                Back
              </Button>
              <Button 
                className="flex-1 btn-primary"
                onClick={() => copyAddress(currentTransaction.wallet_address || '')}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Address
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Topup</h1>
        <p className="text-muted-foreground mt-1">Add funds to your account</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Topup Form */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              Add Funds
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Amount Input */}
            <div className="space-y-3">
              <Label htmlFor="amount">Amount (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-secondary border-border pl-8 text-lg h-12"
                  min="5"
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum: $5.00</p>
            </div>

            {/* Quick Amounts */}
            <div className="space-y-3">
              <Label>Quick Select</Label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {quickAmounts.map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    onClick={() => setAmount(value.toString())}
                    className={`border-border hover:border-primary hover:text-primary transition-all ${
                      amount === value.toString() ? "border-primary text-primary bg-primary/10" : ""
                    }`}
                  >
                    ${value}
                  </Button>
                ))}
              </div>
            </div>

            {/* Payment Methods */}
            <div className="space-y-3">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
                      selectedMethod === method.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary hover:border-primary/50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      selectedMethod === method.id ? "bg-primary/20" : "bg-muted"
                    }`}>
                      <method.icon className={`h-5 w-5 ${
                        selectedMethod === method.id ? "text-primary" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${
                        selectedMethod === method.id ? "text-primary" : "text-foreground"
                      }`}>
                        {method.name}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs py-0">
                          Fee: {method.fee}
                        </Badge>
                        <Badge variant="outline" className="text-xs py-0">
                          {method.time}
                        </Badge>
                      </div>
                    </div>
                    {selectedMethod === method.id && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={handleTopup} 
              className="w-full btn-primary h-12 text-lg"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-5 w-5 mr-2" />
              )}
              Proceed to Payment
            </Button>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTransactions ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transactions yet
                </p>
              ) : (
                transactions.slice(0, 5).map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">${tx.amount}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), 'MMM d, HH:mm')}
                      </p>
                    </div>
                    {getStatusBadge(tx.status)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-primary">Need help?</p>
              <p className="text-xs text-muted-foreground mt-1">
                Contact support for manual topup or payment issues.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Topup;
