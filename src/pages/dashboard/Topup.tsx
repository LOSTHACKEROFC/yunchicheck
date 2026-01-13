import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowUpCircle, Bitcoin, CreditCard, Banknote } from "lucide-react";
import { toast } from "sonner";

const paymentMethods = [
  { id: "crypto", name: "Crypto", icon: Bitcoin },
  { id: "card", name: "Card", icon: CreditCard },
  { id: "bank", name: "Bank Transfer", icon: Banknote },
];

const Topup = () => {
  const [amount, setAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");

  const handleTopup = () => {
    if (!amount || !selectedMethod) {
      toast.error("Please enter amount and select payment method");
      return;
    }
    toast.info("Payment processing coming soon!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Topup</h1>
        <p className="text-muted-foreground mt-1">Add funds to your account</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              Add Funds
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="bg-secondary border-border"
                min="1"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                      selectedMethod === method.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary hover:border-primary/50"
                    }`}
                  >
                    <method.icon className={`h-6 w-6 ${
                      selectedMethod === method.id ? "text-primary" : "text-muted-foreground"
                    }`} />
                    <span className={`text-xs ${
                      selectedMethod === method.id ? "text-primary" : "text-muted-foreground"
                    }`}>
                      {method.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button onClick={handleTopup} className="w-full btn-primary">
              Proceed to Payment
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Quick Amounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[10, 25, 50, 100].map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  onClick={() => setAmount(value.toString())}
                  className="border-border hover:border-primary hover:text-primary"
                >
                  ${value}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Topup;
