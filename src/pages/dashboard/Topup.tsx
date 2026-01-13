import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowUpCircle, 
  Bitcoin, 
  CreditCard, 
  Banknote, 
  Wallet,
  CheckCircle,
  Clock
} from "lucide-react";
import { toast } from "sonner";

const paymentMethods = [
  { id: "btc", name: "Bitcoin", icon: Bitcoin, fee: "0%", time: "10-30 min" },
  { id: "eth", name: "Ethereum", icon: Wallet, fee: "0%", time: "5-15 min" },
  { id: "ltc", name: "Litecoin", icon: Bitcoin, fee: "0%", time: "5-10 min" },
  { id: "usdt", name: "USDT TRC20", icon: Banknote, fee: "0%", time: "1-5 min" },
];

const quickAmounts = [10, 25, 50, 100, 250, 500];

const Topup = () => {
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");

  const handleTopup = () => {
    if (!amount || parseFloat(amount) < 5) {
      toast.error("Minimum topup amount is $5");
      return;
    }
    if (!selectedMethod) {
      toast.error("Please select a payment method");
      return;
    }
    toast.info("Payment processing coming soon! Contact support for manual topup.");
  };

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

            <Button onClick={handleTopup} className="w-full btn-primary h-12 text-lg">
              <ArrowUpCircle className="h-5 w-5 mr-2" />
              Proceed to Payment
            </Button>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Processing Time
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Crypto payments are usually confirmed within 1-30 minutes depending on network congestion.</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Auto Credit
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>Your balance will be credited automatically after payment confirmation.</p>
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
