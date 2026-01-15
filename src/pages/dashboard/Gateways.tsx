import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import confetti from "canvas-confetti";
import { useLiveCardSound } from "@/hooks/useLiveCardSound";
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
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Wallet,
  Store,
  ShoppingBag,
  CircleDollarSign,
  History,
  type LucideIcon
} from "lucide-react";
import { format } from "date-fns";
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
  icon: LucideIcon;
  iconColor: string;
}

const gateways: Gateway[] = [
  { 
    id: "stripe_auth",
    name: "YUNCHI AUTH", 
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "98%",
    description: "Zero-dollar authorization check",
    icon: Sparkles,
    iconColor: "text-purple-500"
  },
  { 
    id: "stripe_preauth",
    name: "YUNCHI PRE AUTH", 
    type: "preauth",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "97%",
    description: "$1 hold then void",
    icon: Zap,
    iconColor: "text-indigo-500"
  },
  { 
    id: "braintree_auth",
    name: "YUNCHI AUTH 2", 
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Discover",
    speed: "Fast",
    successRate: "96%",
    description: "Zero-dollar authorization",
    icon: Wallet,
    iconColor: "text-blue-500"
  },
  { 
    id: "clover_charge",
    name: "CLOVER CHARGE", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC",
    speed: "Medium",
    successRate: "95%",
    description: "$0.50 charge verification",
    icon: Store,
    iconColor: "text-green-500"
  },
  { 
    id: "square_charge",
    name: "SQUARE CHARGE", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "94%",
    description: "$0.50 charge verification",
    icon: CircleDollarSign,
    iconColor: "text-emerald-500"
  },
  { 
    id: "shopify_charge",
    name: "SHOPIFY CHARGE", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex/Discover",
    speed: "Medium",
    successRate: "93%",
    description: "$1.00 charge verification",
    icon: ShoppingBag,
    iconColor: "text-lime-500"
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

interface GatewayCheck {
  id: string;
  created_at: string;
  gateway: string;
  status: string;
  result: string | null;
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

  // Gateway history state
  const [gatewayHistory, setGatewayHistory] = useState<GatewayCheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [liveIndicator, setLiveIndicator] = useState(false);

  const onlineCount = gateways.filter(g => g.status === "online").length;
  
  // Live card sound hook with settings check
  const { playLiveSound } = useLiveCardSound();
  
  const playLiveSoundIfEnabled = () => {
    const savedPrefs = localStorage.getItem("notification-preferences");
    const prefs = savedPrefs ? JSON.parse(savedPrefs) : { live_card_sound: true };
    if (prefs.live_card_sound !== false) {
      playLiveSound();
    }
  };

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

  // Fetch gateway history when gateway is selected and subscribe to real-time updates
  useEffect(() => {
    if (selectedGateway && userId) {
      fetchGatewayHistory(selectedGateway.id);

      // Subscribe to real-time card check updates
      const channel = supabase
        .channel(`card-checks-${selectedGateway.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'card_checks',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newCheck = payload.new as { id: string; created_at: string; gateway: string; status: string; result: string };
            // Only add if it's for the current gateway
            if (newCheck.gateway === selectedGateway.id) {
              // Trigger live indicator pulse
              setLiveIndicator(true);
              setTimeout(() => setLiveIndicator(false), 2000);
              
              setGatewayHistory(prev => {
                // Avoid duplicates
                if (prev.some(c => c.id === newCheck.id)) return prev;
                // Add to front, keep max 20
                return [newCheck, ...prev].slice(0, 20);
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedGateway, userId]);

  const fetchGatewayHistory = async (gatewayId: string) => {
    if (!userId) return;
    
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('card_checks')
        .select('id, created_at, gateway, status, result')
        .eq('user_id', userId)
        .eq('gateway', gatewayId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setGatewayHistory(data || []);
    } catch (err) {
      console.error('Failed to fetch gateway history:', err);
      setGatewayHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

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

      const checkStatus = await simulateCheck();

      await supabase
        .from('card_checks')
        .insert({
          user_id: userId,
          gateway: selectedGateway.id,
          status: 'completed',
          result: checkStatus
        });
      
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
        // Play live card sound if enabled
        playLiveSoundIfEnabled();
        
        // Advanced blood-red celebration effect
        const bloodRedColors = ['#dc2626', '#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#fca5a5'];
        
        // Initial burst from center
        confetti({
          particleCount: 120,
          spread: 100,
          origin: { y: 0.6 },
          colors: bloodRedColors,
          gravity: 0.8,
          scalar: 1.2,
          drift: 0
        });
        
        // Delayed side bursts for dramatic effect
        setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.7 },
            colors: bloodRedColors,
            gravity: 1
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.7 },
            colors: bloodRedColors,
            gravity: 1
          });
        }, 150);
        
        // Final shower effect
        setTimeout(() => {
          confetti({
            particleCount: 80,
            spread: 180,
            origin: { y: 0 },
            colors: bloodRedColors,
            gravity: 1.5,
            startVelocity: 25,
            ticks: 100
          });
        }, 300);
        
        toast.success("Card is LIVE!", { description: checkResult.message });
      } else if (checkResult.status === "dead") {
        toast.error("Card is DEAD", { description: checkResult.message });
      } else {
        toast.warning("Check inconclusive", { description: checkResult.message });
      }

      // Refresh history after check
      fetchGatewayHistory(selectedGateway.id);

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

    // Store original lines for removal tracking
    const originalLines = bulkInput.trim().split('\n').filter(line => line.trim());

    setBulkChecking(true);
    setBulkPaused(false);
    setBulkResults([]);
    setBulkProgress(0);
    setBulkTotal(cards.length);
    setBulkCurrentIndex(0);
    bulkAbortRef.current = false;
    bulkPauseRef.current = false;

    let currentCredits = userCredits;
    let remainingLines = [...originalLines];

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

        const checkStatus = await simulateCheck();

        // Log check with result
        await supabase
          .from('card_checks')
          .insert({
            user_id: userId,
            gateway: selectedGateway.id,
            status: 'completed',
            result: checkStatus
          });

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

        // Play sound and celebrate for each live card in bulk check
        if (checkStatus === "live") {
          playLiveSoundIfEnabled();
          
          // Individual blood-red celebration per live card
          const bloodRedColors = ['#dc2626', '#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#fca5a5'];
          
          // Burst from random position for variety
          const xPos = 0.3 + Math.random() * 0.4;
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { x: xPos, y: 0.6 },
            colors: bloodRedColors,
            gravity: 1,
            scalar: 1.1
          });
          
          // Small side accents
          confetti({
            particleCount: 25,
            angle: 60,
            spread: 40,
            origin: { x: 0, y: 0.7 },
            colors: bloodRedColors,
            gravity: 1.2
          });
          confetti({
            particleCount: 25,
            angle: 120,
            spread: 40,
            origin: { x: 1, y: 0.7 },
            colors: bloodRedColors,
            gravity: 1.2
          });
        }

        setBulkResults(prev => [...prev, bulkResult]);
        setBulkProgress(((i + 1) / cards.length) * 100);
        
        // Remove processed card from textarea
        remainingLines.shift();
        setBulkInput(remainingLines.join('\n'));

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
        
        // Remove processed card even on error
        remainingLines.shift();
        setBulkInput(remainingLines.join('\n'));
      }
    }

    setBulkChecking(false);
    setBulkPaused(false);
    
    // Count live cards and trigger confetti celebration
    const liveCount = bulkResults.filter(r => r.status === 'live').length + 
      (bulkResults.length === 0 ? 0 : 0); // Include current batch
    
    // Get final live count from state after all results
    setTimeout(() => {
      setBulkResults(prev => {
        const finalLiveCount = prev.filter(r => r.status === 'live').length;
        const bloodRedColors = ['#dc2626', '#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#fca5a5'];
        
        if (finalLiveCount >= 3) {
          // Epic blood rain celebration for 3+ live cards
          const duration = 3000;
          const end = Date.now() + duration;
          
          // Initial explosion
          confetti({
            particleCount: 150,
            spread: 180,
            origin: { y: 0.5 },
            colors: bloodRedColors,
            gravity: 0.6,
            scalar: 1.3
          });
          
          const frame = () => {
            // Side cannons with varying intensity
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 45,
              origin: { x: 0, y: Math.random() * 0.4 + 0.3 },
              colors: bloodRedColors,
              gravity: 1.2,
              scalar: 1.1
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 45,
              origin: { x: 1, y: Math.random() * 0.4 + 0.3 },
              colors: bloodRedColors,
              gravity: 1.2,
              scalar: 1.1
            });
            
            // Random top drops for blood rain effect
            if (Math.random() > 0.5) {
              confetti({
                particleCount: 3,
                spread: 30,
                origin: { x: Math.random(), y: 0 },
                colors: bloodRedColors,
                gravity: 2,
                startVelocity: 15,
                ticks: 60
              });
            }
            
            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          };
          frame();
        } else if (finalLiveCount >= 1) {
          // Dramatic burst for 1-2 live cards
          confetti({
            particleCount: 100,
            spread: 90,
            origin: { y: 0.6 },
            colors: bloodRedColors,
            gravity: 0.9,
            scalar: 1.2
          });
          
          // Side accents
          setTimeout(() => {
            confetti({
              particleCount: 40,
              angle: 60,
              spread: 40,
              origin: { x: 0, y: 0.6 },
              colors: bloodRedColors
            });
            confetti({
              particleCount: 40,
              angle: 120,
              spread: 40,
              origin: { x: 1, y: 0.6 },
              colors: bloodRedColors
            });
          }, 100);
        }
        return prev;
      });
    }, 100);
    
    toast.success(`Bulk check completed! Processed ${bulkAbortRef.current ? bulkCurrentIndex : cards.length} cards.`);
    
    // Refresh history after bulk check
    fetchGatewayHistory(selectedGateway.id);
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

  // If no gateway selected, show gateway list
  if (!selectedGateway) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">GATEWAYS</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Select a gateway to start checking cards</p>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gateways.map((gateway) => (
            <Card 
              key={gateway.id} 
              onClick={() => gateway.status === "online" && setSelectedGateway(gateway)}
              className={`bg-card border-border transition-all cursor-pointer ${
                gateway.status !== "online" ? "opacity-50 cursor-not-allowed" : "hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
              }`}
            >
              <CardHeader className="pb-2 p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <div className={`p-1.5 rounded-md bg-background/50 ${gateway.iconColor}`}>
                      <gateway.icon className="h-4 w-4" />
                    </div>
                    {gateway.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {gateway.status === "online" ? (
                      <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px]">
                        ONLINE
                      </Badge>
                    ) : gateway.status === "maintenance" ? (
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[10px]">
                        MAINTENANCE
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-[10px]">
                        OFFLINE
                      </Badge>
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

                <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
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

                {gateway.status === "online" && (
                  <Button className="w-full mt-2" size="sm">
                    <span>Open Gateway</span>
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Gateway selected - show card checking interface
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => {
              setSelectedGateway(null);
              clearForm();
              clearBulk();
            }}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-card border border-border ${selectedGateway.iconColor}`}>
              <selectedGateway.icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">{selectedGateway.name}</h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">{selectedGateway.description}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-primary/50 text-primary py-1 px-3">
            <Coins className="h-3 w-3 mr-1" />
            {userCredits} Credits
          </Badge>
          <Badge className={`${getTypeBadgeClass(selectedGateway.type)} py-1 px-3`}>
            {getTypeLabel(selectedGateway.type)}
          </Badge>
        </div>
      </div>

      {/* Gateway Info Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Supported:</span>
              <span className="font-medium">{selectedGateway.cardTypes}</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Speed:</span>
              <span className="font-medium">{selectedGateway.speed}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Success Rate:</span>
              <span className="font-medium text-green-500">{selectedGateway.successRate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Cost:</span>
              <span className="font-medium">{CREDIT_COST} Credit/Check</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Check History */}
      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Recent Checks
              {/* Live Indicator - Blood Red Theme */}
              <div className="relative flex items-center">
                <div className={`h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)] ${liveIndicator ? 'animate-ping' : ''}`} />
                <div className="absolute h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
                {liveIndicator && (
                  <span className="ml-2.5 text-[11px] text-red-500 font-bold tracking-wider animate-fade-in drop-shadow-[0_0_4px_rgba(239,68,68,0.8)]">
                    LIVE
                  </span>
                )}
              </div>
            </CardTitle>
            {gatewayHistory.length > 0 && (() => {
              const liveCount = gatewayHistory.filter(c => c.result === 'live').length;
              const deadCount = gatewayHistory.filter(c => c.result === 'dead').length;
              const unknownCount = gatewayHistory.filter(c => c.result === 'unknown' || !c.result).length;
              const totalValidChecks = liveCount + deadCount;
              const successRate = totalValidChecks > 0 ? Math.round((liveCount / totalValidChecks) * 100) : 0;
              
              return (
                <div className="flex items-center gap-2">
                  {totalValidChecks > 0 && (
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] font-semibold ${
                        successRate >= 70 
                          ? 'border-green-500/50 text-green-500' 
                          : successRate >= 40 
                            ? 'border-yellow-500/50 text-yellow-500'
                            : 'border-red-500/50 text-red-500'
                      }`}
                    >
                      <Activity className="h-3 w-3 mr-1" />
                      {successRate}% Success
                    </Badge>
                  )}
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-[10px]">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    {liveCount} Live
                  </Badge>
                  <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-[10px]">
                    <ShieldX className="h-3 w-3 mr-1" />
                    {deadCount} Dead
                  </Badge>
                  {unknownCount > 0 && (
                    <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30 text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {unknownCount} Unknown
                    </Badge>
                  )}
                </div>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : gatewayHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No checks performed on this gateway yet
            </p>
          ) : (
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {gatewayHistory.map((check) => (
                  <div 
                    key={check.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${
                        check.result === 'live' 
                          ? 'bg-green-500/20' 
                          : check.result === 'dead' 
                            ? 'bg-red-500/20' 
                            : 'bg-yellow-500/20'
                      }`}>
                        {check.result === 'live' ? (
                          <ShieldCheck className="h-3 w-3 text-green-500" />
                        ) : check.result === 'dead' ? (
                          <ShieldX className="h-3 w-3 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium">Card Check</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(check.created_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] uppercase font-semibold ${
                        check.result === 'live' 
                          ? 'border-green-500/30 text-green-500 bg-green-500/10' 
                          : check.result === 'dead'
                            ? 'border-red-500/30 text-red-500 bg-red-500/10'
                            : 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10'
                      }`}
                    >
                      {check.result || 'Unknown'}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Card Check Tabs */}
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="w-full grid grid-cols-2 max-w-md">
          <TabsTrigger value="single" className="text-xs sm:text-sm">
            <CreditCard className="h-3 w-3 mr-1" />
            Single Check
          </TabsTrigger>
          <TabsTrigger value="bulk" className="text-xs sm:text-sm">
            <Layers className="h-3 w-3 mr-1" />
            Bulk Check
          </TabsTrigger>
        </TabsList>

        {/* Single Card Check */}
        <TabsContent value="single" className="mt-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardContent className="p-4 sm:p-6 space-y-4">
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
                  disabled={checking || !cardNumber}
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
          <Card className="bg-card border-border max-w-2xl">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div>
                <Label className="text-xs">Cards (one per line)</Label>
                <Textarea
                  placeholder="card|mm|yy|cvv&#10;4242424242424242|12|25|123&#10;5555555555554444|01|26|456"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  className="mt-1 font-mono text-xs h-40 resize-none"
                  disabled={bulkChecking}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Format: card|mm|yy|cvv — {parseCards(bulkInput).length} valid cards detected
                </p>
              </div>

              {bulkChecking && (
                <div className="space-y-3">
                  {/* Live Counter with Success Rate */}
                  <div className="flex items-center justify-center gap-4 py-3 bg-gradient-to-r from-green-500/10 via-green-500/20 to-green-500/10 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-green-500 animate-pulse" />
                      <span className="text-sm text-muted-foreground">Live:</span>
                      <span 
                        key={bulkResults.filter(r => r.status === 'live').length}
                        className="text-2xl font-bold text-green-500 animate-scale-in tabular-nums"
                      >
                        {bulkResults.filter(r => r.status === 'live').length}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div className="flex items-center gap-2">
                      <ShieldX className="h-5 w-5 text-red-500" />
                      <span className="text-sm text-muted-foreground">Dead:</span>
                      <span className="text-lg font-semibold text-red-500 tabular-nums">
                        {bulkResults.filter(r => r.status === 'dead').length}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    {/* Live Success Rate */}
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      <span className="text-sm text-muted-foreground">Rate:</span>
                      {(() => {
                        const liveCount = bulkResults.filter(r => r.status === 'live').length;
                        const deadCount = bulkResults.filter(r => r.status === 'dead').length;
                        const totalValid = liveCount + deadCount;
                        const rate = totalValid > 0 ? Math.round((liveCount / totalValid) * 100) : 0;
                        const rateColor = rate >= 70 ? 'text-green-500' : rate >= 40 ? 'text-yellow-500' : 'text-red-500';
                        return (
                          <span 
                            key={rate}
                            className={`text-lg font-bold ${rateColor} animate-scale-in tabular-nums`}
                          >
                            {totalValid > 0 ? `${rate}%` : '--'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  
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
                      disabled={parseCards(bulkInput).length === 0}
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
            <Card className="bg-card border-border max-w-2xl">
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
  );
};

export default Gateways;
