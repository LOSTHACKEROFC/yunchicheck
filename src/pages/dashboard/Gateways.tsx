import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle,
  Layers,
  Copy,
  Download,
  Pause,
  Play,
  Square,
  Building2,
  Globe,
  Wallet
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// BIN Lookup utilities
interface BinInfo {
  brand: string;
  type: string;
  level: string;
  bank: string;
  country: string;
  countryCode: string;
  brandColor: string;
  isRealData?: boolean;
  isLoading?: boolean;
}

const defaultBinInfo: BinInfo = {
  brand: "Unknown",
  type: "Unknown",
  level: "Standard",
  bank: "Unknown Bank",
  country: "Unknown",
  countryCode: "XX",
  brandColor: "bg-gray-500",
  isRealData: false,
  isLoading: false,
};

// Quick local brand detection for immediate feedback
const detectCardBrandLocal = (cardNumber: string): { brand: string; brandColor: string } => {
  const digits = cardNumber.replace(/\s/g, '');
  
  if (/^4/.test(digits)) return { brand: "Visa", brandColor: "bg-blue-600" };
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return { brand: "Mastercard", brandColor: "bg-orange-600" };
  if (/^3[47]/.test(digits)) return { brand: "Amex", brandColor: "bg-green-600" };
  if (/^6(?:011|5|4[4-9]|22)/.test(digits)) return { brand: "Discover", brandColor: "bg-orange-500" };
  if (/^3(?:0[0-5]|[68])/.test(digits)) return { brand: "Diners Club", brandColor: "bg-gray-700" };
  if (/^35(?:2[89]|[3-8])/.test(digits)) return { brand: "JCB", brandColor: "bg-red-600" };
  if (/^62/.test(digits)) return { brand: "UnionPay", brandColor: "bg-red-700" };
  if (/^(?:5[06-9]|6)/.test(digits)) return { brand: "Maestro", brandColor: "bg-blue-700" };
  
  return { brand: "Unknown", brandColor: "bg-gray-500" };
};

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
  card?: string;
}

interface BulkResult extends CheckResult {
  cardMasked: string;
  fullCard: string;
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
  
  // Bulk checking state
  const [bulkInput, setBulkInput] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkChecking, setBulkChecking] = useState(false);
  const [bulkPaused, setBulkPaused] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkCurrentIndex, setBulkCurrentIndex] = useState(0);
  const bulkAbortRef = useRef(false);
  const bulkPauseRef = useRef(false);

  const onlineCount = gateways.filter(g => g.status === "online").length;

  // BIN lookup state
  const [binInfo, setBinInfo] = useState<BinInfo>(defaultBinInfo);
  const binLookupRef = useRef<string>("");

  // Debounced BIN lookup via API
  useEffect(() => {
    const digits = cardNumber.replace(/\s/g, '');
    
    // Show immediate local detection
    if (digits.length >= 4) {
      const localBrand = detectCardBrandLocal(cardNumber);
      setBinInfo(prev => ({
        ...prev,
        brand: localBrand.brand,
        brandColor: localBrand.brandColor,
        isLoading: digits.length >= 6,
      }));
    } else {
      setBinInfo(defaultBinInfo);
      return;
    }

    // Only call API when we have 6+ digits
    if (digits.length < 6) return;

    const bin = digits.slice(0, 8);
    if (binLookupRef.current === bin) return;

    const timeoutId = setTimeout(async () => {
      binLookupRef.current = bin;
      try {
        const { data, error } = await supabase.functions.invoke('bin-lookup', {
          body: { bin },
        });

        if (error) throw error;

        if (data && !data.error) {
          setBinInfo({
            ...data,
            isLoading: false,
          });
        }
      } catch (err) {
        console.error('BIN lookup error:', err);
        // Keep local detection on error
        const localBrand = detectCardBrandLocal(cardNumber);
        setBinInfo(prev => ({
          ...prev,
          brand: localBrand.brand,
          brandColor: localBrand.brandColor,
          isLoading: false,
          isRealData: false,
        }));
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [cardNumber]);

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

  const simulateCheck = async (): Promise<"live" | "dead" | "unknown"> => {
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));
    const random = Math.random();
    if (random > 0.3) return "live";
    if (random > 0.1) return "dead";
    return "unknown";
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
      const { error: deductError } = await supabase
        .from('profiles')
        .update({ credits: userCredits - CREDIT_COST })
        .eq('user_id', userId);

      if (deductError) {
        throw new Error("Failed to deduct credits");
      }

      await supabase
        .from('card_checks')
        .insert({
          user_id: userId,
          gateway: selectedGateway.id,
          status: 'completed'
        });

      const checkStatus = await simulateCheck();
      
      const checkResult: CheckResult = {
        status: checkStatus,
        message: checkStatus === "live" 
          ? "Card is valid and active" 
          : checkStatus === "dead" 
            ? "Card declined or invalid"
            : "Unable to verify - try another gateway",
        gateway: selectedGateway.name
      };

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

  // Bulk checking functions
  const parseCards = (input: string): { card: string; month: string; year: string; cvv: string }[] => {
    const lines = input.trim().split('\n').filter(line => line.trim());
    const cards: { card: string; month: string; year: string; cvv: string }[] = [];

    for (const line of lines) {
      // Support formats: card|mm|yy|cvv or card|mm|yyyy|cvv
      const parts = line.trim().split(/[|/]/);
      if (parts.length >= 4) {
        const card = parts[0].replace(/\D/g, '');
        const month = parts[1].replace(/\D/g, '').slice(0, 2);
        let year = parts[2].replace(/\D/g, '');
        if (year.length === 4) year = year.slice(2);
        const cvv = parts[3].replace(/\D/g, '').slice(0, 4);

        if (card.length >= 13 && card.length <= 16 && month && year && cvv.length >= 3) {
          cards.push({ card, month, year, cvv });
        }
      }
    }

    return cards;
  };

  const maskCard = (card: string): string => {
    return `${card.slice(0, 6)}******${card.slice(-4)}`;
  };

  const startBulkCheck = async () => {
    if (!selectedGateway) {
      toast.error("Please select a gateway");
      return;
    }

    const cards = parseCards(bulkInput);
    if (cards.length === 0) {
      toast.error("No valid cards found. Use format: card|mm|yy|cvv");
      return;
    }

    if (userCredits < cards.length * CREDIT_COST) {
      toast.error(`Insufficient credits. Need ${cards.length * CREDIT_COST} credits for ${cards.length} cards.`);
      return;
    }

    if (!userId) {
      toast.error("Please login to continue");
      return;
    }

    setBulkChecking(true);
    setBulkPaused(false);
    setBulkResults([]);
    setBulkProgress(0);
    setBulkTotal(cards.length);
    setBulkCurrentIndex(0);
    bulkAbortRef.current = false;
    bulkPauseRef.current = false;

    let currentCredits = userCredits;

    for (let i = 0; i < cards.length; i++) {
      if (bulkAbortRef.current) {
        toast.info("Bulk check stopped");
        break;
      }

      while (bulkPauseRef.current && !bulkAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (bulkAbortRef.current) break;

      setBulkCurrentIndex(i + 1);
      const cardData = cards[i];

      try {
        // Deduct credit
        const { error: deductError } = await supabase
          .from('profiles')
          .update({ credits: currentCredits - CREDIT_COST })
          .eq('user_id', userId);

        if (deductError) {
          throw new Error("Failed to deduct credits");
        }

        currentCredits -= CREDIT_COST;
        setUserCredits(currentCredits);

        // Log check
        await supabase
          .from('card_checks')
          .insert({
            user_id: userId,
            gateway: selectedGateway.id,
            status: 'completed'
          });

        const checkStatus = await simulateCheck();

        const bulkResult: BulkResult = {
          status: checkStatus,
          message: checkStatus === "live" 
            ? "Valid" 
            : checkStatus === "dead" 
              ? "Declined"
              : "Unknown",
          gateway: selectedGateway.name,
          cardMasked: maskCard(cardData.card),
          fullCard: `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`
        };

        setBulkResults(prev => [...prev, bulkResult]);
        setBulkProgress(((i + 1) / cards.length) * 100);

      } catch (error) {
        console.error('Bulk check error:', error);
        const errorResult: BulkResult = {
          status: "unknown",
          message: "Error",
          gateway: selectedGateway.name,
          cardMasked: maskCard(cardData.card),
          fullCard: `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`
        };
        setBulkResults(prev => [...prev, errorResult]);
      }
    }

    setBulkChecking(false);
    setBulkPaused(false);
    toast.success(`Bulk check completed! Processed ${bulkAbortRef.current ? bulkCurrentIndex : cards.length} cards.`);
  };

  const pauseBulkCheck = () => {
    bulkPauseRef.current = true;
    setBulkPaused(true);
  };

  const resumeBulkCheck = () => {
    bulkPauseRef.current = false;
    setBulkPaused(false);
  };

  const stopBulkCheck = () => {
    bulkAbortRef.current = true;
    bulkPauseRef.current = false;
    setBulkPaused(false);
  };

  const copyResults = (type: "live" | "dead" | "all") => {
    let cards: string[];
    if (type === "all") {
      cards = bulkResults.map(r => r.fullCard);
    } else {
      cards = bulkResults.filter(r => r.status === type).map(r => r.fullCard);
    }
    
    if (cards.length === 0) {
      toast.error("No cards to copy");
      return;
    }

    navigator.clipboard.writeText(cards.join('\n'));
    toast.success(`Copied ${cards.length} ${type} cards`);
  };

  const downloadResults = (type: "live" | "dead" | "all") => {
    let cards: string[];
    if (type === "all") {
      cards = bulkResults.map(r => `${r.fullCard} | ${r.status.toUpperCase()}`);
    } else {
      cards = bulkResults.filter(r => r.status === type).map(r => r.fullCard);
    }
    
    if (cards.length === 0) {
      toast.error("No cards to download");
      return;
    }

    const blob = new Blob([cards.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cards_${type}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${cards.length} ${type} cards`);
  };

  const clearBulk = () => {
    setBulkInput("");
    setBulkResults([]);
    setBulkProgress(0);
    setBulkTotal(0);
    setBulkCurrentIndex(0);
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

  const liveCount = bulkResults.filter(r => r.status === "live").length;
  const deadCount = bulkResults.filter(r => r.status === "dead").length;
  const unknownCount = bulkResults.filter(r => r.status === "unknown").length;

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
          <Tabs defaultValue="single" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="single" className="text-xs sm:text-sm">
                <CreditCard className="h-3 w-3 mr-1" />
                Single
              </TabsTrigger>
              <TabsTrigger value="bulk" className="text-xs sm:text-sm">
                <Layers className="h-3 w-3 mr-1" />
                Bulk
              </TabsTrigger>
            </TabsList>

            {/* Single Card Check */}
            <TabsContent value="single" className="mt-4">
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

                    {/* BIN Info Display */}
                    {cardNumber.replace(/\s/g, '').length >= 6 && (
                      <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-5 rounded ${binInfo.brandColor} flex items-center justify-center`}>
                              <span className="text-white text-[8px] font-bold">{binInfo.brand.slice(0, 4).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold flex items-center gap-1.5">
                                {binInfo.brand}
                                {binInfo.isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{binInfo.type} • {binInfo.level}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge variant="outline" className="text-[10px]">
                              BIN: {cardNumber.replace(/\s/g, '').slice(0, 6)}
                            </Badge>
                            {binInfo.isRealData && (
                              <span className="text-[9px] text-green-500 flex items-center gap-0.5">
                                <CheckCircle className="h-2.5 w-2.5" />
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground truncate" title={binInfo.bank}>
                              {binInfo.isLoading ? "Loading..." : binInfo.bank}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {binInfo.isLoading ? "Loading..." : `${binInfo.country} (${binInfo.countryCode})`}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

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
            </TabsContent>

            {/* Bulk Card Check */}
            <TabsContent value="bulk" className="mt-4 space-y-4">
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-4">
                  {selectedGateway ? (
                    <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/30">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{selectedGateway.name}</span>
                      <Badge className={`ml-auto text-[10px] ${getTypeBadgeClass(selectedGateway.type)}`}>
                        Bulk Mode
                      </Badge>
                    </div>
                  ) : (
                    <div className="p-3 bg-secondary rounded-lg text-center text-sm text-muted-foreground">
                      Select a gateway to start bulk checking
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Cards (one per line)</Label>
                    <Textarea
                      placeholder="card|mm|yy|cvv&#10;4242424242424242|12|25|123&#10;5555555555554444|01|26|456"
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="mt-1 font-mono text-xs h-32 resize-none"
                      disabled={bulkChecking}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Format: card|mm|yy|cvv — {parseCards(bulkInput).length} valid cards detected
                    </p>
                  </div>

                  {bulkChecking && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span>Progress: {bulkCurrentIndex}/{bulkTotal}</span>
                        <span>{Math.round(bulkProgress)}%</span>
                      </div>
                      <Progress value={bulkProgress} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!bulkChecking ? (
                      <>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={clearBulk}
                          disabled={!bulkInput && bulkResults.length === 0}
                        >
                          Clear
                        </Button>
                        <Button
                          className="flex-1 btn-primary"
                          onClick={startBulkCheck}
                          disabled={!selectedGateway || parseCards(bulkInput).length === 0}
                        >
                          <Zap className="h-4 w-4 mr-2" />
                          Check ({parseCards(bulkInput).length * CREDIT_COST} Credits)
                        </Button>
                      </>
                    ) : (
                      <>
                        {bulkPaused ? (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={resumeBulkCheck}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={pauseBulkCheck}
                          >
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={stopBulkCheck}
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Results */}
              {bulkResults.length > 0 && (
                <Card className="bg-card border-border">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Results</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                          {liveCount} Live
                        </Badge>
                        <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">
                          {deadCount} Dead
                        </Badge>
                        {unknownCount > 0 && (
                          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-xs">
                            {unknownCount} Unknown
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-3">
                    <ScrollArea className="h-48 rounded border border-border">
                      <div className="p-2 space-y-1 font-mono text-xs">
                        {bulkResults.map((r, i) => (
                          <div 
                            key={i} 
                            className={`flex items-center justify-between px-2 py-1 rounded ${
                              r.status === "live" 
                                ? "bg-green-500/10" 
                                : r.status === "dead"
                                  ? "bg-red-500/10"
                                  : "bg-yellow-500/10"
                            }`}
                          >
                            <span className="text-muted-foreground">{r.cardMasked}</span>
                            <span className={
                              r.status === "live" 
                                ? "text-green-500 font-semibold" 
                                : r.status === "dead"
                                  ? "text-red-500 font-semibold"
                                  : "text-yellow-500 font-semibold"
                            }>
                              {r.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyResults("live")}
                        disabled={liveCount === 0}
                        className="text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Live
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyResults("dead")}
                        disabled={deadCount === 0}
                        className="text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Dead
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadResults("all")}
                        className="text-xs"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        All
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Gateways;
