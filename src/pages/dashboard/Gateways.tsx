import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap,
  Coins,
  Activity,
  Loader2,
  ShieldCheck,
  ShieldX,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Gateway {
  id: string;
  name: string;
  type: "auth" | "preauth" | "charge";
  status: "online" | "maintenance" | "offline";
  cardTypes: string;
  speed: string;
  successRate: string;
  description: string;
}

const gateways: Gateway[] = [
  { 
    id: "stripe_auth",
    name: "Stripe Auth", 
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "98%",
    description: "Zero-dollar authorization check"
  },
  { 
    id: "stripe_preauth",
    name: "Stripe Pre-Auth", 
    type: "preauth",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "97%",
    description: "$1 hold then void"
  },
  { 
    id: "braintree_auth",
    name: "Braintree Auth", 
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Discover",
    speed: "Fast",
    successRate: "96%",
    description: "Zero-dollar authorization"
  },
  { 
    id: "clover_charge",
    name: "Clover Charge", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC",
    speed: "Medium",
    successRate: "95%",
    description: "$0.50 charge verification"
  },
  { 
    id: "square_charge",
    name: "Square Charge", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "94%",
    description: "$0.50 charge verification"
  },
  { 
    id: "shopify_charge",
    name: "Shopify Charge", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex/Discover",
    speed: "Medium",
    successRate: "93%",
    description: "$1.00 charge verification"
  },
];

const CREDIT_COST = 1;

interface CheckResult {
  status: "live" | "dead" | "unknown";
  message: string;
  gateway: string;
}

const Gateways = () => {
  const [selectedGateway, setSelectedGateway] = useState<Gateway | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [userCredits, setUserCredits] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);

  const onlineCount = gateways.filter(g => g.status === "online").length;

  useEffect(() => {
    fetchUserCredits();
  }, []);

  const fetchUserCredits = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      setUserCredits(profile.credits);
    }

    // Subscribe to credit changes
    const channel = supabase
      .channel('gateway-credits')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          setUserCredits((payload.new as any).credits);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const validateCard = () => {
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 13 || digits.length > 16) {
      toast.error("Invalid card number length");
      return false;
    }
    if (!expMonth || !expYear || parseInt(expMonth) < 1 || parseInt(expMonth) > 12) {
      toast.error("Invalid expiration date");
      return false;
    }
    if (cvv.length < 3 || cvv.length > 4) {
      toast.error("Invalid CVV");
      return false;
    }
    return true;
  };

  const performCheck = async () => {
    if (!selectedGateway) {
      toast.error("Please select a gateway");
      return;
    }

    if (!validateCard()) return;

    if (userCredits < CREDIT_COST) {
      toast.error("Insufficient credits. Please top up your balance.");
      return;
    }

    if (!userId) {
      toast.error("Please login to continue");
      return;
    }

    setChecking(true);
    setResult(null);

    try {
      // Deduct credit first
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ credits: userCredits - CREDIT_COST })
        .eq('user_id', userId);

      if (deductError) {
        throw new Error("Failed to deduct credits");
      }

      // Log the card check
      const { error: logError } = await supabase
        .from('card_checks')
        .insert({
          user_id: userId,
          gateway: selectedGateway.id,
          status: 'completed'
        });

      if (logError) {
        console.error('Error logging check:', logError);
      }

      // Simulate gateway check (in production, this would call actual gateway APIs)
      await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

      // Simulate random result for demo
      const random = Math.random();
      let checkResult: CheckResult;

      if (random > 0.3) {
        checkResult = {
          status: "live",
          message: "Card is valid and active",
          gateway: selectedGateway.name
        };
      } else if (random > 0.1) {
        checkResult = {
          status: "dead",
          message: "Card declined or invalid",
          gateway: selectedGateway.name
        };
      } else {
        checkResult = {
          status: "unknown",
          message: "Unable to verify - try another gateway",
          gateway: selectedGateway.name
        };
      }

      setResult(checkResult);
      setUserCredits(prev => prev - CREDIT_COST);

      if (checkResult.status === "live") {
        toast.success("Card is LIVE!", { description: checkResult.message });
      } else if (checkResult.status === "dead") {
        toast.error("Card is DEAD", { description: checkResult.message });
      } else {
        toast.warning("Check inconclusive", { description: checkResult.message });
      }

    } catch (error) {
      console.error('Check error:', error);
      toast.error("Check failed. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const clearForm = () => {
    setCardNumber("");
    setExpMonth("");
    setExpYear("");
    setCvv("");
    setResult(null);
  };

  const getTypeLabel = (type: Gateway["type"]) => {
    switch (type) {
      case "auth": return "Auth";
      case "preauth": return "Pre-Auth";
      case "charge": return "Charge";
    }
  };

  const getTypeBadgeClass = (type: Gateway["type"]) => {
    switch (type) {
      case "auth": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "preauth": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "charge": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Gateways</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Select a gateway and check your cards</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-primary/50 text-primary py-1 px-3">
            <Coins className="h-3 w-3 mr-1" />
            {userCredits} Credits
          </Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-500 py-1 px-3">
            <Activity className="h-3 w-3 mr-1" />
            {onlineCount}/{gateways.length} Online
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gateway Selection */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Select Gateway</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {gateways.map((gateway) => (
              <Card 
                key={gateway.id} 
                onClick={() => gateway.status === "online" && setSelectedGateway(gateway)}
                className={`bg-card border-border transition-all cursor-pointer ${
                  gateway.status !== "online" ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50"
                } ${selectedGateway?.id === gateway.id ? "border-primary ring-2 ring-primary/20" : ""}`}
              >
                <CardHeader className="pb-2 p-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      {gateway.name}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {gateway.status === "online" ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : gateway.status === "maintenance" ? (
                        <Clock className="h-3 w-3 text-yellow-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className={`text-[10px] ${getTypeBadgeClass(gateway.type)}`}>
                      {getTypeLabel(gateway.type)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {gateway.cardTypes}
                    </Badge>
                  </div>
                  
                  <p className="text-xs text-muted-foreground">{gateway.description}</p>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" />
                      <span>{gateway.speed}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span className="text-green-500">{gateway.successRate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Coins className="h-3 w-3 text-primary" />
                      <span>{CREDIT_COST} Credit</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Card Check Form */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Check Card</h2>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-4">
              {selectedGateway ? (
                <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/30">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{selectedGateway.name}</span>
                  <Badge className={`ml-auto text-[10px] ${getTypeBadgeClass(selectedGateway.type)}`}>
                    {getTypeLabel(selectedGateway.type)}
                  </Badge>
                </div>
              ) : (
                <div className="p-3 bg-secondary rounded-lg text-center text-sm text-muted-foreground">
                  Select a gateway to start checking
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label htmlFor="cardNumber" className="text-xs">Card Number</Label>
                  <Input
                    id="cardNumber"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className="mt-1 font-mono"
                    disabled={checking}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="expMonth" className="text-xs">Month</Label>
                    <Input
                      id="expMonth"
                      placeholder="MM"
                      value={expMonth}
                      onChange={(e) => setExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      className="mt-1 font-mono"
                      disabled={checking}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expYear" className="text-xs">Year</Label>
                    <Input
                      id="expYear"
                      placeholder="YY"
                      value={expYear}
                      onChange={(e) => setExpYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      className="mt-1 font-mono"
                      disabled={checking}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cvv" className="text-xs">CVV</Label>
                    <Input
                      id="cvv"
                      placeholder="123"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="mt-1 font-mono"
                      type="password"
                      disabled={checking}
                    />
                  </div>
                </div>
              </div>

              {result && (
                <div className={`p-3 rounded-lg border flex items-start gap-3 ${
                  result.status === "live" 
                    ? "bg-green-500/10 border-green-500/30" 
                    : result.status === "dead"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-yellow-500/10 border-yellow-500/30"
                }`}>
                  {result.status === "live" ? (
                    <ShieldCheck className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  ) : result.status === "dead" ? (
                    <ShieldX className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`font-semibold text-sm ${
                      result.status === "live" 
                        ? "text-green-500" 
                        : result.status === "dead"
                          ? "text-red-500"
                          : "text-yellow-500"
                    }`}>
                      {result.status === "live" ? "LIVE" : result.status === "dead" ? "DEAD" : "UNKNOWN"}
                    </p>
                    <p className="text-xs text-muted-foreground">{result.message}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={clearForm}
                  disabled={checking}
                >
                  Clear
                </Button>
                <Button
                  className="flex-1 btn-primary"
                  onClick={performCheck}
                  disabled={!selectedGateway || checking || !cardNumber}
                >
                  {checking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Check ({CREDIT_COST} Credit)
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Each check deducts {CREDIT_COST} credit from your balance
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Gateways;
