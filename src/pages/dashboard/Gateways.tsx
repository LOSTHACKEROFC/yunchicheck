import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Shuffle,
  PenLine,
  Database,
  RefreshCw,
  type LucideIcon
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBulkCheck } from "@/contexts/BulkCheckContext";
import UserProxyManager from "@/components/UserProxyManager";
import ShopifyPriceGroupSelector from "@/components/ShopifyPriceGroupSelector";

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
  status: "live" | "dead" | "unknown" | "killed";
  apiStatus: string;
  apiMessage: string;
  apiTotal?: string;
  rawResponse: string;
  usedGateway?: string;
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
    name: "Chaos-auth-check",
    code: "Chaos",
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
    name: "adyenn-auth-check",
    code: "Adyen",
    type: "auth",
    status: "online", 
    cardTypes: "Visa/MC/Amex/Discover",
    speed: "⚡⚡ Ultra",
    successRate: "99%",
    description: "$0 Auth Check • Adyen API Only • CVC optional",
    icon: Zap,
    iconColor: "text-indigo-500"
  },
  { 
    id: "braintree_auth",
    name: "appbased-check",
    code: "App Based",
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
    description: "$10.00 Charge • CVC required",
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
// Killer Auth: KILLED = 5 credits, ERROR/UNKNOWN = FREE
const CREDIT_COST_LIVE = 2;
const CREDIT_COST_DEAD = 1;
const CREDIT_COST_ERROR = 0;
const CREDIT_COST_KILLER = 5;

interface CheckResult {
  status: "live" | "dead" | "unknown" | "killed";
  message: string;
  gateway: string;
  card?: string;
  displayCard?: string; // Card as entered by user (without auto-added CVC)
  apiResponse?: string; // Real API response message for PAYGATE
  usedApi?: string;
  rawResponse?: string; // Full raw API response for debugging
  timeTaken?: number; // Time taken in seconds (for Killer Auth)
}

interface BulkResult extends CheckResult {
  _id: string;
  cardMasked: string;
  fullCard: string;
  displayCard: string; // Card as entered by user (without auto-added CVC)
  brand: string;
  brandColor: string;
  apiResponse?: string; // Real API response message for PAYGATE
  usedApi?: string;
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
  const { setIsBulkChecking } = useBulkCheck();
  const [selectedGateway, setSelectedGateway] = useState<Gateway | null>(null);
  const [gatewayTab, setGatewayTab] = useState<string>(() => localStorage.getItem("gatewayTab") || "auth");
  const [cardNumber, setCardNumber] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [payuAmount, setPayuAmount] = useState<number>(1); // PayU custom amount (default ₹1)
  const [razorpaySite, setRazorpaySite] = useState<string>(""); // RazorPay site URL
  const [razorpaySites, setRazorpaySites] = useState<string[]>([]); // Available sites from gateway_urls
  const [loadingSites, setLoadingSites] = useState(false);
  const [razorpaySiteMode, setRazorpaySiteMode] = useState<"database" | "manual">("database"); // Site source mode for bulk
  const [shopifyProxyCount, setShopifyProxyCount] = useState(0);
  const [shopifyPriceGroup, setShopifyPriceGroup] = useState<{ min: number; max: number } | null>(null);
  const [shopifySiteCount, setShopifySiteCount] = useState<number>(0);
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
  const [workerCount, setWorkerCount] = useState(5); // UI display (3-10 range), backend runs double (6-20)
  const [bulkResultFilter, setBulkResultFilter] = useState<"all" | "live" | "dead" | "unknown">("all"); // Filter for bulk results
  const bulkAbortRef = useRef(false);
  const bulkPauseRef = useRef(false);
  const bulkProxyWarnedRef = useRef(false);

  // Performance: batch UI updates to avoid re-rendering on every card
  const pendingResultsRef = useRef<BulkResult[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkStatsRef = useRef({ completed: 0, total: 0, startTime: 0 });
  const shopifyWarmupAtRef = useRef(0);
  const shopifyWarmupPromiseRef = useRef<Promise<void> | null>(null);
  const shopifyInvokeActiveRef = useRef(0);
  const shopifyInvokeQueueRef = useRef<Array<() => void>>([]);
  const shopifyQueueDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shopifyParallelLimitRef = useRef(20);
  const shopifyBootCooldownUntilRef = useRef(0);
  const shopifyNextInvokeAtRef = useRef(0);
  const shopifyBootWarnedRef = useRef(false);
  const SHOPIFY_WARMUP_TTL_MS = 2 * 60 * 1000;
  const SHOPIFY_TARGET_PARALLEL_INVOCATIONS = 15;
  const SHOPIFY_COLD_START_PARALLEL_INVOCATIONS = 5;
  const SHOPIFY_BOOT_COOLDOWN_MS = 60_000;
  const SHOPIFY_INVOKE_START_GAP_MS = 150;


  // Gateway history state
  const [gatewayHistory, setGatewayHistory] = useState<GatewayCheck[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [liveIndicator, setLiveIndicator] = useState(false);

  // Dynamic gateways state - merged from default config + database status
  const [gateways, setGateways] = useState<Gateway[]>(defaultGateways);
  const [loadingGateways, setLoadingGateways] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Sort gateways by status: online first, maintenance second, offline last
  const sortedGateways = useMemo(() => {
    const statusPriority: Record<string, number> = {
      online: 0,
      maintenance: 1,
      unavailable: 1,
      offline: 2,
    };
    const typePriority: Record<string, number> = {
      auth: 0,
      charge: 1,
    };
    return [...gateways].sort((a, b) => {
      // First sort by gateway type (auth gateways first)
      const typeA = typePriority[a.type] ?? 1;
      const typeB = typePriority[b.type] ?? 1;
      if (typeA !== typeB) return typeA - typeB;
      
      // Then sort by status within each type
      const priorityA = statusPriority[a.status] ?? 2;
      const priorityB = statusPriority[b.status] ?? 2;
      return priorityA - priorityB;
    });
  }, [gateways]);

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

  // Icon mapping from string to component
  const iconMap: Record<string, LucideIcon> = {
    Sparkles,
    Zap,
    Wallet,
    Store,
    CircleDollarSign,
    ShoppingBag,
    CreditCard,
    Shield: ShieldCheck,
  };

  // Fetch gateways from database and subscribe to real-time updates
  const fetchGatewayStatus = async () => {
    setLoadingGateways(true);
    try {
      // First try to fetch from new gateways table
      const { data: gatewaysData, error: gatewaysError } = await supabase
        .from('gateways')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (!gatewaysError && gatewaysData && gatewaysData.length > 0) {
        // Convert database records to Gateway objects
        const dbGateways: Gateway[] = gatewaysData.map((g: any) => ({
          id: g.id,
          name: g.name,
          code: g.code || undefined,
          type: g.type as "auth" | "preauth" | "charge",
          status: (g.status === 'unavailable' ? 'maintenance' : g.status) as Gateway['status'],
          cardTypes: g.card_types,
          speed: g.speed,
          successRate: g.success_rate,
          description: g.description,
          icon: iconMap[g.icon_name] || CreditCard,
          iconColor: g.icon_color,
        }));
        setGateways(dbGateways);
      } else {
        // Fallback to gateway_status table for backward compatibility
        const { data: statusData, error } = await supabase
          .from('gateway_status')
          .select('id, status');

        if (!error && statusData && statusData.length > 0) {
          setGateways(defaultGateways.map(gateway => {
            const dbStatus = statusData.find(s => s.id === gateway.id);
            if (dbStatus) {
              const displayStatus = dbStatus.status === 'unavailable' ? 'maintenance' : dbStatus.status;
              return { ...gateway, status: displayStatus as Gateway['status'] };
            }
            return gateway;
          }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch gateways:', err);
    } finally {
      setLoadingGateways(false);
    }
  };

  // Subscribe to real-time gateway updates
  useEffect(() => {
    // Subscribe to gateways table changes
    const gatewaysChannel = supabase
      .channel('gateways-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gateways',
        },
        (payload) => {
          // Refetch gateways on any change
          fetchGatewayStatus();
        }
      )
      .subscribe();

    // Also subscribe to gateway_status for backward compatibility
    const statusChannel = supabase
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
              const displayStatus = updated.status === 'unavailable' ? 'maintenance' : updated.status;
              return { ...gateway, status: displayStatus as Gateway['status'] };
            }
            return gateway;
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gatewaysChannel);
      supabase.removeChannel(statusChannel);
    };
  }, []);

  // Real-time Shopify site count (excluding Razorpay URLs)
  useEffect(() => {
    const fetchSiteCount = async () => {
      const { count, error } = await supabase
        .from("gateway_urls")
        .select("*", { count: "exact", head: true })
        .not("url", "like", "https://razorpay.me/%")
        .gt("price", 0)
        .lte("price", 100);
      if (!error && count !== null) setShopifySiteCount(count);
    };
    fetchSiteCount();

    const channel = supabase
      .channel("shopify-site-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "gateway_urls" }, () => fetchSiteCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch gateway history when gateway is selected and subscribe to real-time updates
  useEffect(() => {
    if (selectedGateway && userId) {
      fetchGatewayHistory(selectedGateway.id);
      
      // Fetch sites for RazorPay gateway
      if (selectedGateway.id === "razorpay_charge") {
        fetchRazorpaySites();
      }

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

      // Real-time subscription for razorpay sites (gateway_urls)
      let sitesChannel: ReturnType<typeof supabase.channel> | null = null;
      if (selectedGateway.id === "razorpay_charge") {
        sitesChannel = supabase
          .channel('razorpay-sites-gateway')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'gateway_urls' },
            (payload) => {
              const RAZORPAY_PREFIX = 'https://razorpay.me/';
              if (payload.eventType === 'INSERT') {
                const newUrl = (payload.new as { url: string }).url;
                if (newUrl.startsWith(RAZORPAY_PREFIX)) {
                  setRazorpaySites(prev => prev.includes(newUrl) ? prev : [...prev, newUrl]);
                }
              } else if (payload.eventType === 'DELETE') {
                const oldUrl = (payload.old as { url: string }).url;
                if (oldUrl) {
                  setRazorpaySites(prev => prev.filter(u => u !== oldUrl));
                }
              } else if (payload.eventType === 'UPDATE') {
                const newUrl = (payload.new as { url: string }).url;
                const oldUrl = (payload.old as { url?: string }).url;
                if (oldUrl && !newUrl.startsWith(RAZORPAY_PREFIX)) {
                  setRazorpaySites(prev => prev.filter(u => u !== oldUrl));
                } else if (newUrl.startsWith(RAZORPAY_PREFIX)) {
                  setRazorpaySites(prev => prev.includes(newUrl) ? prev : [...prev, newUrl]);
                }
              }
            }
          )
          .subscribe();
      }

      return () => {
        supabase.removeChannel(channel);
        if (sitesChannel) supabase.removeChannel(sitesChannel);
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
    
    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdmin(!!roleData);
    
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

  // Helper to check if a card brand is blocked for Chaos-auth-check
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
    
    // For Chaos-auth-check, auto-clear blocked card brands (Amex, Discover, JCB)
    if (selectedGateway?.id === "stripe_auth") {
      const { blocked, brand } = isBlockedCardBrand(formatted);
      if (blocked) {
        toast.error(`${brand} cards are not supported on Chaos-auth-check`);
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
    
    // For Chaos-auth-check, validate card brand
    if (selectedGateway?.id === "stripe_auth") {
      const { blocked, brand } = isBlockedCardBrand(cardNumber);
      if (blocked) {
        toast.error(`${brand} cards are not supported on Chaos-auth-check`);
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

  // Real API check for Chaos-auth-check gateway via edge function with retry - returns status AND API response
  const checkCardViaApi = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[CHAO-AUTH] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('stripe-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[CHAO-AUTH] Edge function error:', error);
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
        
        console.log('[CHAO-AUTH] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        
        // Use computedStatus from edge function if available
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check success field from API response
        if (data?.success === true) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (data?.success === false) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check status field
        const statusUpper = (data?.status as string)?.toUpperCase() || '';
        if (statusUpper === 'SUCCESS' || statusUpper === 'APPROVED' || statusUpper === 'LIVE') {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (statusUpper === 'ERROR' || statusUpper === 'DECLINED' || statusUpper === 'DEAD' || statusUpper === 'FAILED') {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check message for status indicators
        const message = (data?.message as string)?.toLowerCase() || (apiMessage as string)?.toLowerCase() || '';
        
        // LIVE indicators
        if (message.includes("payment method added successfully") || message.includes("card added successfully") || message.includes("succeeded")) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        // DEAD indicators
        if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined") ||
            message.includes("invalid") || message.includes("expired") || message.includes("do not honor") ||
            message.includes("incorrect") || message.includes("failed")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        // Retryable errors
        if (message.includes("no such paymentmethod")) {
          console.log(`[CHAO-AUTH] PaymentMethod error - retrying (attempt ${attempt + 1}/${maxRetries + 1})`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 + attempt * 500));
            continue;
          }
        }
        if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[CHAO-AUTH] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
        }
        
        // Any other response is unknown
        return { status: "unknown", apiStatus, apiMessage, rawResponse };
      } catch (error) {
        console.error('[CHAO-AUTH] API check error:', error);
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
  // Stripe Charge $8 API - direct call, immediate response
  const checkCardViaStripeCharge = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[STRIPE-CHARGE] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('stripe-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[STRIPE-CHARGE] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[STRIPE-CHARGE] Response:', data);
      
      // Extract response directly
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const apiTotal = data?.apiTotal || '$10.00';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal, 
        rawResponse 
      };
    } catch (error) {
      console.error('[STRIPE-CHARGE] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // PayPal Woo check via edge function with retry
  const checkCardViaPaypalWoo = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[PAYPAL-WOO] Attempt ${attempt}/${maxRetries}`);
        const { data, error } = await supabase.functions.invoke('paypal-woo-check', {
          body: { cc }
        });
        
        if (error) throw error;
        
        if (data?.computedStatus === 'unknown' && attempt < maxRetries) {
          console.log(`[PAYPAL-WOO] UNKNOWN on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        return {
          status: data?.computedStatus || 'unknown',
          apiStatus: data?.apiStatus || 'UNKNOWN',
          apiMessage: data?.apiMessage || 'No response',
          rawResponse: data?.rawResponse || JSON.stringify(data)
        };
      } catch (error) {
        console.error(`[PAYPAL-WOO] Attempt ${attempt} error:`, error);
        if (attempt === maxRetries) {
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error instanceof Error ? error.message : "Unknown error",
            rawResponse: String(error)
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return { status: "unknown", apiStatus: "ERROR", apiMessage: "Max retries exceeded", rawResponse: "" };
  };

  // Adyen Auth check via edge function with retry
  const checkCardViaAdyen = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ADYEN] Attempt ${attempt}/${maxRetries}`);
        const { data, error } = await supabase.functions.invoke('adyen-auth-check', {
          body: { cc }
        });
        
        if (error) throw error;
        
        if (data?.computedStatus === 'unknown' && attempt < maxRetries) {
          console.log(`[ADYEN] UNKNOWN on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        return {
          status: data?.computedStatus || 'unknown',
          apiStatus: data?.apiStatus || 'UNKNOWN',
          apiMessage: data?.apiMessage || 'No response',
          rawResponse: data?.rawResponse || JSON.stringify(data)
        };
      } catch (error) {
        console.error(`[ADYEN] Attempt ${attempt} error:`, error);
        if (attempt === maxRetries) {
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error instanceof Error ? error.message : "Unknown error",
            rawResponse: String(error)
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return { status: "unknown", apiStatus: "ERROR", apiMessage: "Max retries exceeded", rawResponse: "" };
  };

  // AuthNet Auth check via edge function with retry
  const checkCardViaAuthNet = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AUTHNET] Attempt ${attempt}/${maxRetries}`);
        const { data, error } = await supabase.functions.invoke('authnet-auth-check', {
          body: { cc }
        });
        
        if (error) throw error;
        
        if (data?.computedStatus === 'unknown' && attempt < maxRetries) {
          console.log(`[AUTHNET] UNKNOWN on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        return {
          status: data?.computedStatus || 'unknown',
          apiStatus: data?.apiStatus || 'UNKNOWN',
          apiMessage: data?.apiMessage || 'No response',
          rawResponse: data?.rawResponse || JSON.stringify(data)
        };
      } catch (error) {
        console.error(`[AUTHNET] Attempt ${attempt} error:`, error);
        if (attempt === maxRetries) {
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error instanceof Error ? error.message : "Unknown error",
            rawResponse: String(error)
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return { status: "unknown", apiStatus: "ERROR", apiMessage: "Max retries exceeded", rawResponse: "" };
  };


  // PayPal GraphQL check via edge function with retry
  const checkCardViaPaypalGraphql = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[PAYPAL-GQL] Attempt ${attempt}/${maxRetries}`);
        const { data, error } = await supabase.functions.invoke('paypal-graphql-check', {
          body: { cc }
        });
        
        if (error) throw error;
        
        if (data?.computedStatus === 'unknown' && attempt < maxRetries) {
          console.log(`[PAYPAL-GQL] UNKNOWN on attempt ${attempt}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        return {
          status: data?.computedStatus || 'unknown',
          apiStatus: data?.apiStatus || 'UNKNOWN',
          apiMessage: data?.apiMessage || 'No response',
          rawResponse: data?.rawResponse || JSON.stringify(data)
        };
      } catch (error) {
        console.error(`[PAYPAL-GQL] Attempt ${attempt} error:`, error);
        if (attempt === maxRetries) {
          return {
            status: "unknown",
            apiStatus: "ERROR",
            apiMessage: error instanceof Error ? error.message : "Unknown error",
            rawResponse: String(error)
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return { status: "unknown", apiStatus: "ERROR", apiMessage: "Max retries exceeded", rawResponse: "" };
  };

  // PwGate API check via edge function - returns status AND API response
  const checkCardViaPwgate = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[PWGATE] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('pwgate-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[PWGATE] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[PWGATE] Response:', data);
      
      // Extract response directly - display only plain text message
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const apiTotal = data?.apiTotal || '$10.00';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal, 
        rawResponse 
      };
    } catch (error) {
      console.error('[PWGATE] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // StripeLow Charge API check via edge function
  const checkCardViaStripeLow = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[STRIPELOW] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('stripelow-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[STRIPELOW] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[STRIPELOW] Response:', data);
      
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const apiTotal = data?.apiTotal || data?.chargeAmount || '$0.30';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal, 
        rawResponse 
      };
    } catch (error) {
      console.error('[STRIPELOW] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // VBV Auth check (YUNCHI VBV AUTH) via edge function - returns PASSED/REJECTED
  const checkCardViaVbv = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[VBV-AUTH] Checking card:`, cc);
      
      const { data, error } = await supabase.functions.invoke('braintree-vbv-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[VBV-AUTH] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[VBV-AUTH] Response:', data);
      
      // Extract VBV-specific response data
      const computedStatus = data?.computedStatus;
      const threeDStatus = data?.threeDStatus || 'unknown';
      const apiMessage = data?.apiMessage || `3DS: ${threeDStatus}`;
      const rawResponse = JSON.stringify(data);
      
      // Map passed/rejected to live/dead for credit deduction logic
      // But preserve the original status for display
      if (computedStatus === "passed") {
        return { 
          status: "live", // For credit logic
          apiStatus: "PASSED",
          apiMessage: apiMessage,
          rawResponse
        };
      } else if (computedStatus === "rejected") {
        return { 
          status: "dead", // For credit logic
          apiStatus: "REJECTED",
          apiMessage: apiMessage,
          rawResponse
        };
      }
      
      return { 
        status: "unknown",
        apiStatus: "UNKNOWN",
        apiMessage: apiMessage,
        rawResponse
      };
    } catch (error) {
      console.error('[VBV-AUTH] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // Killer Auth check via edge function - returns KILLED/UNKNOWN only
  const checkCardViaKiller = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse & { status: "killed" | "unknown" }> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[KILLER-AUTH] Checking card:`, cc);
      
      const { data, error } = await supabase.functions.invoke('killer-auth-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[KILLER-AUTH] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[KILLER-AUTH] Response:', data);
      
      const computedStatus = data?.computedStatus as "killed" | "unknown";
      const apiMessage = data?.apiMessage || 'No response';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      
      return { 
        status: computedStatus || "unknown",
        apiStatus: computedStatus === "killed" ? "KILLED" : "UNKNOWN",
        apiMessage: apiMessage,
        rawResponse
      };
    } catch (error) {
      console.error('[KILLER-AUTH] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // B3 API check (appbased-check) via edge function with retry - returns status AND API response
  const checkCardViaB3 = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[APPBASED-AUTH] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('braintree-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[APPBASED-AUTH] Edge function error:', error);
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
        
        console.log('[APPBASED-AUTH] API response:', data);
        
        // Extract real API response data
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        
        // Use computedStatus from edge function if available
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check success field from API response
        if (data?.success === true) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (data?.success === false) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check status field
        const statusUpper = (data?.status as string)?.toUpperCase() || '';
        if (statusUpper === 'SUCCESS' || statusUpper === 'APPROVED' || statusUpper === 'LIVE') {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (statusUpper === 'ERROR' || statusUpper === 'DECLINED' || statusUpper === 'DEAD' || statusUpper === 'FAILED') {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        // Fallback: Check message for status indicators
        const message = (data?.message as string)?.toLowerCase() || (apiMessage as string)?.toLowerCase() || '';
        
        if (message.includes("approved") || message.includes("success") || message.includes("authorized")) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined") ||
            message.includes("invalid") || message.includes("expired") || message.includes("failed")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[APPBASED-AUTH] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
        }
        
        return { status: "unknown", apiStatus, apiMessage, rawResponse };
      } catch (error) {
        console.error('[APPBASED-AUTH] API check error:', error);
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

  // Adyen Auth check (adyenn-auth-check) - independent Adyen API only
  const checkCardViaAdyenAuth = async (cardNumber: string, month: string, year: string, cvv: string, maxRetries = 5): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[ADYENN-AUTH-CHK] Checking card (attempt ${attempt + 1}/${maxRetries + 1}):`, cc);
        
        const { data, error } = await supabase.functions.invoke('combined-auth-check', {
          body: { cc }
        });
        
        if (error) {
          console.error('[ADYENN-AUTH-CHK] Edge function error:', error);
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
        
        console.log('[ADYENN-AUTH-CHK] API response:', data);
        
        const apiStatus = data?.apiStatus || data?.status || 'UNKNOWN';
        const apiMessage = data?.apiMessage || data?.message || 'No message';
        const rawResponse = JSON.stringify(data);
        
        const computedStatus = data?.computedStatus;
        if (computedStatus === "live" || computedStatus === "dead") {
          return { status: computedStatus, apiStatus, apiMessage, rawResponse };
        }
        
        if (data?.success === true) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (data?.success === false) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        const statusUpper = (data?.status as string)?.toUpperCase() || '';
        if (statusUpper === 'SUCCESS' || statusUpper === 'APPROVED' || statusUpper === 'LIVE') {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (statusUpper === 'ERROR' || statusUpper === 'DECLINED' || statusUpper === 'DEAD' || statusUpper === 'FAILED') {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        
        const message = (data?.message as string)?.toLowerCase() || (apiMessage as string)?.toLowerCase() || '';
        
        if (message.includes("approved") || message.includes("success") || message.includes("authorized") ||
            message.includes("payment method added successfully") || message.includes("card added successfully")) {
          return { status: "live", apiStatus, apiMessage, rawResponse };
        }
        if (message.includes("declined") || message.includes("insufficient funds") || message.includes("card was declined") ||
            message.includes("invalid") || message.includes("expired") || message.includes("failed")) {
          return { status: "dead", apiStatus, apiMessage, rawResponse };
        }
        if (message.includes("rate limit") || message.includes("timeout") || message.includes("try again")) {
          console.log(`[ADYENN-AUTH-CHK] Retryable error detected: ${message}`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 800 + attempt * 300));
            continue;
          }
        }
        
        return { status: "unknown", apiStatus, apiMessage, rawResponse };
      } catch (error) {
        console.error('[ADYENN-AUTH-CHK] API check error:', error);
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

  // PayPal Charge API check via edge function - $1 charge
  const checkCardViaPaypal = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[PAYPAL] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('paypal-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[PAYPAL] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[PAYPAL] Response:', data);
      
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const apiTotal = data?.apiTotal || '$1.00';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal, 
        rawResponse 
      };
    } catch (error) {
      console.error('[PAYPAL] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // RizzUp Charge API check via edge function - $5 charge
  const checkCardViaRizzup = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[RIZZUP] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('rizzup-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[RIZZUP] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[RIZZUP] Response:', data);
      
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const apiTotal = data?.apiTotal || '$5.00';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal, 
        rawResponse 
      };
    } catch (error) {
      console.error('[RIZZUP] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // Shopify Charge API check via edge function - uses user proxies + auto-rotating sites
  const acquireShopifyInvocationSlot = async () => {
    while (Date.now() < shopifyBootCooldownUntilRef.current) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (shopifyInvokeActiveRef.current < shopifyParallelLimitRef.current) {
      shopifyInvokeActiveRef.current += 1;
      const now = Date.now();
      const waitMs = Math.max(0, shopifyNextInvokeAtRef.current - now);
      shopifyNextInvokeAtRef.current = Math.max(now, shopifyNextInvokeAtRef.current) + SHOPIFY_INVOKE_START_GAP_MS;
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
      return;
    }

    await new Promise<void>((resolve) => {
      shopifyInvokeQueueRef.current.push(() => {
        shopifyInvokeActiveRef.current += 1;
        resolve();
      });
    });

    while (Date.now() < shopifyBootCooldownUntilRef.current) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  };

  const drainShopifyInvocationQueue = () => {
    if (shopifyInvokeActiveRef.current >= shopifyParallelLimitRef.current) return;
    const cooldownRemaining = shopifyBootCooldownUntilRef.current - Date.now();
    if (cooldownRemaining > 0) {
      if (!shopifyQueueDrainTimerRef.current) {
        shopifyQueueDrainTimerRef.current = setTimeout(() => {
          shopifyQueueDrainTimerRef.current = null;
          drainShopifyInvocationQueue();
        }, cooldownRemaining + 50);
      }
      return;
    }
    while (shopifyInvokeActiveRef.current < shopifyParallelLimitRef.current) {
      const now = Date.now();
      const startGapRemaining = shopifyNextInvokeAtRef.current - now;
      if (startGapRemaining > 0) {
        if (!shopifyQueueDrainTimerRef.current) {
          shopifyQueueDrainTimerRef.current = setTimeout(() => {
            shopifyQueueDrainTimerRef.current = null;
            drainShopifyInvocationQueue();
          }, startGapRemaining + 10);
        }
        return;
      }
      const next = shopifyInvokeQueueRef.current.shift();
      if (!next) break;
      shopifyNextInvokeAtRef.current = Date.now() + SHOPIFY_INVOKE_START_GAP_MS;
      next();
    }
  };

  const releaseShopifyInvocationSlot = () => {
    shopifyInvokeActiveRef.current = Math.max(0, shopifyInvokeActiveRef.current - 1);
    drainShopifyInvocationQueue();
  };

  const handleShopifyBootPressure = () => {
    shopifyWarmupAtRef.current = 0;
    shopifyParallelLimitRef.current = SHOPIFY_COLD_START_PARALLEL_INVOCATIONS;
    shopifyBootCooldownUntilRef.current = Date.now() + SHOPIFY_BOOT_COOLDOWN_MS;
    shopifyNextInvokeAtRef.current = shopifyBootCooldownUntilRef.current;
    if (!shopifyBootWarnedRef.current) {
      shopifyBootWarnedRef.current = true;
      console.warn('[SHOPIFY] BOOT_ERROR pressure detected — cooling down parallel invocations briefly.');
    }
  };

  const warmupShopifyFunction = async () => {
    if (shopifyWarmupPromiseRef.current) {
      await shopifyWarmupPromiseRef.current;
      return;
    }

    const now = Date.now();
    if (now - shopifyWarmupAtRef.current < SHOPIFY_WARMUP_TTL_MS) return;

    shopifyWarmupPromiseRef.current = (async () => {
      try {
        await acquireShopifyInvocationSlot();
        try {
          await supabase.functions.invoke('shopify-charge-check', {
            body: { cc: 'warmup' },
          });
          shopifyWarmupAtRef.current = Date.now();
        } finally {
          releaseShopifyInvocationSlot();
        }
      } catch {
        // Warmup is best-effort only
      } finally {
        shopifyWarmupPromiseRef.current = null;
      }
    })();

    await shopifyWarmupPromiseRef.current;
  };

  const checkCardViaShopify = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    const MAX_RETRIES = 5;

    await warmupShopifyFunction();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await acquireShopifyInvocationSlot();
        let data: any;
        let error: any;

        try {
          const response = await supabase.functions.invoke('shopify-charge-check', {
            body: { cc, priceGroup: shopifyPriceGroup }
          });
          data = response.data;
          error = response.error;
        } finally {
          releaseShopifyInvocationSlot();
        }

        if (!error) {
          shopifyParallelLimitRef.current = SHOPIFY_TARGET_PARALLEL_INVOCATIONS;
          shopifyBootCooldownUntilRef.current = 0;
          console.log('[SHOPIFY] Response:', data);
          const apiStatus = data?.apiStatus || 'UNKNOWN';
          const apiMessage = data?.apiMessage || data?.message || 'No response';
          const apiTotal = data?.apiTotal || 'Auto';
          const rawResponse = data?.rawResponse || JSON.stringify(data);
          const computedStatus = data?.computedStatus;

          return {
            status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
            apiStatus,
            apiMessage,
            apiTotal,
            rawResponse,
            allProxiesDead: data?.allProxiesDead || false,
          } as GatewayApiResponse & { allProxiesDead?: boolean };
        }

        const context = (error as { context?: Response })?.context;
        const statusCode = context instanceof Response ? context.status : undefined;

        let errorBody: any = null;
        if (context instanceof Response) {
          try {
            errorBody = await context.clone().json();
          } catch {
            errorBody = null;
          }
        }

        const sdkMessage = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
        const bodyCode = typeof errorBody?.code === 'string' ? errorBody.code.toLowerCase() : '';
        const bodyMessage = typeof errorBody?.message === 'string' ? errorBody.message.toLowerCase() : '';

        // 400 = card format/validation error — not retryable, mark as dead
        if (statusCode === 400) {
          const errMsg = errorBody?.error || errorBody?.message || error.message || 'Invalid card format';
          return {
            status: "dead",
            apiStatus: "DECLINED",
            apiMessage: errMsg,
            rawResponse: JSON.stringify(errorBody || error),
          };
        }

        const isBootError = statusCode === 503 || bodyCode === 'boot_error' || bodyMessage.includes('failed to start') || bodyMessage.includes('function failed to start');
        const isRetryable = isBootError || statusCode === 502 || statusCode === 504 ||
          sdkMessage.includes('failed to send') || sdkMessage.includes('network') ||
          sdkMessage.includes('edge function returned 503') || sdkMessage.includes('boot_error');

        if (isRetryable && attempt < MAX_RETRIES) {
          if (isBootError) {
            handleShopifyBootPressure();
          }

          const baseDelay = isBootError ? 3500 : 1200;
          const backoffMs = Math.min(18000, baseDelay * (2 ** (attempt - 1)) + Math.floor(Math.random() * 900));
          console.warn(`[SHOPIFY] Retry ${attempt}/${MAX_RETRIES} after ${statusCode ?? 'unknown'} (${isBootError ? 'BOOT_ERROR' : 'transient'}) in ${backoffMs}ms`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        let rawError = '';
        try {
          rawError = JSON.stringify(errorBody || error);
        } catch {
          rawError = String(errorBody?.message || error?.message || 'Unknown error');
        }

        console.error('[SHOPIFY] Error:', error, errorBody);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: errorBody?.message || error.message || "Connection error",
          rawResponse: rawError,
        };
      } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
        const isRetryableException = msg.includes('network') || msg.includes('failed to fetch') || msg.includes('503') || msg.includes('boot_error');

        if (isRetryableException && attempt < MAX_RETRIES) {
          if (msg.includes('503') || msg.includes('boot_error')) {
            handleShopifyBootPressure();
          }

          const backoffMs = Math.min(18000, 1800 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 900));
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }

        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: e?.message || "Request failed",
          rawResponse: String(e)
        };
      }
    }

    return {
      status: "unknown",
      apiStatus: "ERROR",
      apiMessage: "All retries exhausted",
      rawResponse: ""
    };
  };

  const invokeShopifyBatch = async (cards: string[]): Promise<any> => {
    const MAX_RETRIES = 5;
    await warmupShopifyFunction();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await acquireShopifyInvocationSlot();
        try {
          const { data, error } = await supabase.functions.invoke('shopify-batch-check', {
            body: { cards, priceGroup: shopifyPriceGroup }
          });
          if (!error) {
            shopifyParallelLimitRef.current = SHOPIFY_TARGET_PARALLEL_INVOCATIONS;
            shopifyBootCooldownUntilRef.current = 0;
            return data;
          }

          const context = (error as { context?: Response })?.context;
          const statusCode = context instanceof Response ? context.status : undefined;
          const message = String(error.message || '').toLowerCase();
          const isBootError = statusCode === 503 || message.includes('boot_error') || message.includes('failed to start');
          const isRetryable = isBootError || statusCode === 502 || statusCode === 504 || message.includes('network') || message.includes('failed to send');
          if (isRetryable && attempt < MAX_RETRIES) {
            if (isBootError) handleShopifyBootPressure();
            const baseDelay = isBootError ? 3500 : 1200;
            await new Promise(r => setTimeout(r, Math.min(18_000, baseDelay * (2 ** (attempt - 1)) + Math.floor(Math.random() * 900))));
            continue;
          }
          throw error;
        } finally {
          releaseShopifyInvocationSlot();
        }
      } catch (e: any) {
        const message = String(e?.message || '').toLowerCase();
        const isRetryable = message.includes('network') || message.includes('failed to fetch') || message.includes('503') || message.includes('boot_error');
        if (isRetryable && attempt < MAX_RETRIES) {
          if (message.includes('503') || message.includes('boot_error')) handleShopifyBootPressure();
          await new Promise(r => setTimeout(r, Math.min(18_000, 1800 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 900))));
          continue;
        }
        throw e;
      }
    }
  };

  // AuthNet Charge API check via edge function - $1 charge
  const checkCardViaAuthNetCharge = async (cardNumber: string, month: string, year: string, cvv: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[AUTHNET-CHARGE] Sending:`, cc);
      
      const { data, error } = await supabase.functions.invoke('authnet-charge-check', {
        body: { cc }
      });
      
      if (error) {
        console.error('[AUTHNET-CHARGE] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[AUTHNET-CHARGE] Response:', data);
      
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        apiTotal: '$1.00', 
        rawResponse 
      };
    } catch (error) {
      console.error('[AUTHNET-CHARGE] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // RazorPay Charge API check via edge function with site selection
  const checkCardViaRazorpay = async (cardNumber: string, month: string, year: string, cvv: string, site: string): Promise<GatewayApiResponse> => {
    const cc = `${cardNumber}|${month}|${year}|${cvv}`;
    
    try {
      console.log(`[RAZORPAY] Sending:`, cc, `Site: ${site}`);
      
      const { data, error } = await supabase.functions.invoke('razorpay-charge-check', {
        body: { cc, site }
      });
      
      if (error) {
        console.error('[RAZORPAY] Error:', error);
        return {
          status: "unknown",
          apiStatus: "ERROR",
          apiMessage: error.message || "Connection error",
          rawResponse: JSON.stringify(error)
        };
      }
      
      console.log('[RAZORPAY] Response:', data);
      
      const apiStatus = data?.apiStatus || 'UNKNOWN';
      const apiMessage = data?.apiMessage || data?.message || 'No response';
      const rawResponse = data?.rawResponse || JSON.stringify(data);
      const computedStatus = data?.computedStatus;
      const is3ds = data?.is3ds === true;
      
      // 3DS = show as DECLINED with 3DS REQUIRED response (counted as dead for credits)
      if (is3ds) {
        return { 
          status: "dead",
          apiStatus: "3DS REQUIRED",
          apiMessage: "Payment Failed",
          rawResponse 
        };
      }
      
      return { 
        status: computedStatus === "live" ? "live" : computedStatus === "dead" ? "dead" : "unknown",
        apiStatus, 
        apiMessage, 
        rawResponse 
      };
    } catch (error) {
      console.error('[RAZORPAY] Exception:', error);
      return {
        status: "unknown",
        apiStatus: "ERROR",
        apiMessage: error instanceof Error ? error.message : "Unknown error",
        rawResponse: String(error)
      };
    }
  };

  // Fetch available sites for RazorPay from gateway_urls table
  const fetchRazorpaySites = async () => {
    setLoadingSites(true);
    try {
      const { data, error } = await supabase
        .from('gateway_urls')
        .select('url')
        .like('url', 'https://razorpay.me/%')
        .order('created_at', { ascending: true });
      
      if (!error && data && data.length > 0) {
        const urls = data.map(d => d.url);
        setRazorpaySites(urls);
        if (!razorpaySite && urls.length > 0) {
          setRazorpaySite(urls[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    } finally {
      setLoadingSites(false);
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

      // Use real API for auth gateways and PAYGATE, simulation for others
      let gatewayResponse: GatewayApiResponse | null = null;
      
      if (selectedGateway.id === "stripe_auth") {
        gatewayResponse = await checkCardViaApi(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "combined_auth") {
        gatewayResponse = await checkCardViaAdyenAuth(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "braintree_auth") {
        gatewayResponse = await checkCardViaB3(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "paygate_charge") {
        gatewayResponse = await checkCardViaPaygate(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "stripe_charge") {
        gatewayResponse = await checkCardViaStripeCharge(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "payu_charge") {
        gatewayResponse = await checkCardViaPayU(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv, payuAmount);
      } else if (selectedGateway.id === "pwgate_charge") {
        gatewayResponse = await checkCardViaPwgate(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "stripelow_charge") {
        gatewayResponse = await checkCardViaStripeLow(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "b3vbv_auth") {
        gatewayResponse = await checkCardViaVbv(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "killer_auth") {
        const startTime = performance.now();
        gatewayResponse = await checkCardViaKiller(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
        const endTime = performance.now();
        (gatewayResponse as any).timeTaken = ((endTime - startTime) / 1000).toFixed(2);
      } else if (selectedGateway.id === "rizzup_charge") {
        gatewayResponse = await checkCardViaRizzup(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "paypal_charge") {
        gatewayResponse = await checkCardViaPaypal(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "authnet_auth") {
        gatewayResponse = await checkCardViaAuthNet(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "paypal_graphql") {
        gatewayResponse = await checkCardViaPaypalGraphql(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "adyen_auth") {
        gatewayResponse = await checkCardViaAdyen(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "paypal_woo") {
        gatewayResponse = await checkCardViaPaypalWoo(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "authnet_charge") {
        gatewayResponse = await checkCardViaAuthNetCharge(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      } else if (selectedGateway.id === "razorpay_charge") {
        let site = razorpaySite;
        if (razorpaySiteMode === "database") {
          if (razorpaySites.length === 0) {
            toast.error("No sites in database. Switch to manual input.");
            setChecking(false);
            return;
          }
          site = razorpaySites[Math.floor(Math.random() * razorpaySites.length)];
        } else if (!site || !site.match(/^https:\/\/razorpay\.me\/@[a-zA-Z0-9_.-]+$/)) {
          toast.error("Invalid RazorPay URL. Use format: razorpay.me/@username");
          setChecking(false);
          return;
        }
        gatewayResponse = await checkCardViaRazorpay(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv, site);
      } else if (selectedGateway.id === "shopify_charge") {
        if (shopifyProxyCount < 1) {
          toast.error("Add at least 1 proxy to use Shopify Charge");
          setChecking(false);
          return;
        }
        gatewayResponse = await checkCardViaShopify(cardNumber.replace(/\s/g, ''), expMonth, expYear, internalCvv);
      }
      
      const checkStatus = gatewayResponse ? gatewayResponse.status : await simulateCheck();

      // Determine credit cost based on result
      // Killer Auth: KILLED = 5 credits, UNKNOWN/ERROR = FREE
      // Others: LIVE = 2, DEAD = 1, ERROR = 0
      let creditCost: number;
      if (selectedGateway.id === "killer_auth") {
        // Only charge 5 credits for successful kills, errors are free
        creditCost = checkStatus === "killed" ? CREDIT_COST_KILLER : CREDIT_COST_ERROR;
      } else {
        creditCost = checkStatus === "live" 
          ? CREDIT_COST_LIVE 
          : checkStatus === "dead" 
            ? CREDIT_COST_DEAD 
            : CREDIT_COST_ERROR;
      }

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
      const isOrderPlaced = gatewayResponse && (
        (gatewayResponse.apiMessage || '').toUpperCase().includes('ORDER_PLACED') ||
        (gatewayResponse.apiMessage || '').toUpperCase().includes('ORDER PLACED') ||
        (gatewayResponse.rawResponse || '').toUpperCase().includes('ORDER_PLACED')
      );
      const apiResponseDisplay = gatewayResponse 
        ? isOrderPlaced 
          ? '💎 ORDER PLACED'
          : `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`
        : undefined;
      
      const checkResult: CheckResult = {
        status: checkStatus,
        message: checkStatus === "killed"
          ? "Card checked successfully"
          : checkStatus === "live" 
            ? "Card is valid and active" 
            : checkStatus === "dead" 
              ? "Card declined or invalid"
              : "Unable to verify - try another gateway",
        gateway: selectedGateway.name,
        card: fullCardString,
        displayCard: displayCardString,
        apiResponse: apiResponseDisplay,
        usedApi: gatewayResponse?.usedGateway,
        rawResponse: gatewayResponse?.rawResponse,
        timeTaken: (gatewayResponse as any)?.timeTaken ? parseFloat((gatewayResponse as any).timeTaken) : undefined
      };

      setResult(checkResult);

      // Notifications are handled server-side by edge functions to avoid duplicates

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
        
        // All card brands are now accepted - API handles unsupported brands
        
        if (
          cardData.card.length >= 13 && 
          cardData.card.length <= 16 && 
          monthNum >= 1 && 
          monthNum <= 12 && 
          cardData.year.length === 2 &&
          cvvValid &&
          !isExpired // Filter out expired cards
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

    // RazorPay requires a site selection
    if (selectedGateway.id === "razorpay_charge") {
      if (razorpaySiteMode === "manual" && (!razorpaySite || !razorpaySite.match(/^https:\/\/razorpay\.me\/@[a-zA-Z0-9_.-]+$/))) {
        toast.error("Invalid RazorPay URL. Use format: razorpay.me/@username");
        return;
      }
      if (razorpaySiteMode === "database" && razorpaySites.length === 0) {
        toast.error("No sites in database. Switch to manual input.");
        return;
      }
    }

    // Shopify requires proxies
    if (selectedGateway.id === "shopify_charge" && shopifyProxyCount < 1) {
      toast.error("Add at least 1 proxy to use Shopify Charge");
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

    // Each card costs 1 credit upfront; only process as many as user can afford
    if (userCredits < 1) {
      toast.error("Insufficient credits. You need at least 1 credit to check cards.");
      return;
    }

    // Limit cards to what the user can afford (1 credit per card minimum)
    const affordableCards = validCards.slice(0, userCredits);
    if (affordableCards.length < validCards.length) {
      toast.warning(`You can only afford ${affordableCards.length} of ${validCards.length} cards with your current balance (${userCredits} credits).`);
    }

    if (!userId) {
      toast.error("Please login to continue");
      return;
    }

    // Store original lines for removal tracking
    const originalLines = bulkInput.trim().split('\n').filter(line => line.trim());

    setBulkChecking(true);
    setIsBulkChecking(true);
    setBulkPaused(false);
    setBulkResults([]);
    setBulkProgress(0);
    setBulkTotal(affordableCards.length);
    setBulkCurrentIndex(0);
    setBulkStartTime(Date.now());
    setBulkEstimatedTime("Calculating...");
    bulkAbortRef.current = false;
    bulkProxyWarnedRef.current = false;
    shopifyBootWarnedRef.current = false;
    shopifyBootCooldownUntilRef.current = 0;
    shopifyNextInvokeAtRef.current = 0;
    shopifyParallelLimitRef.current = selectedGateway.id === "shopify_charge" ? SHOPIFY_COLD_START_PARALLEL_INVOCATIONS : SHOPIFY_TARGET_PARALLEL_INVOCATIONS;
    bulkPauseRef.current = false;
    pendingResultsRef.current = [];
    bulkStatsRef.current = { completed: 0, total: affordableCards.length, startTime: Date.now() };
    
    // Enable background mode to prevent browser throttling when minimized
    startBackgroundMode();

    // Track remaining credits to stop when exhausted
    let remainingCredits = userCredits;
    let totalCreditsDeducted = 0;

    const startTime = Date.now();
    let processedCount = 0;
    const allResults: BulkResult[] = [];

    // Immediate flush: push results to UI as soon as they arrive
    const flushPendingResults = () => {
      if (pendingResultsRef.current.length === 0) return;
      const batch = pendingResultsRef.current.splice(0);
      const stats = bulkStatsRef.current;
      
      setBulkResults(prev => [...prev, ...batch]);
      setBulkCurrentIndex(stats.completed);
      setBulkProgress((stats.completed / stats.total) * 100);
      
      // Calculate ETA
      const elapsed = Date.now() - stats.startTime;
      const avgTimePerCard = elapsed / stats.completed;
      const remainingCards = stats.total - stats.completed;
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
      
      // Update remaining lines in textarea on every flush so the input shrinks live
      const remainingLinesNow = originalLines.slice(stats.completed);
      setBulkInput(remainingLinesNow.join('\n'));
    };

    // Flush immediately so every completed card appears in the UI right away.
    // rAF is still used as a safety net for any pending items between calls.
    let rafId: number | null = null;
    const scheduleFlush = () => {
      // Immediate synchronous flush — the card just completed, show it now
      flushPendingResults();
      // Also schedule a follow-up rAF flush in case more results arrived during render
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        flushPendingResults();
      });
    };

    // Safety-net interval (50ms) in case rAF is throttled (background tab)
    const flushInterval = setInterval(flushPendingResults, 50);

    // Worker function to process a single card
    const processCard = async (cardIndex: number): Promise<BulkResult | null> => {
      if (bulkAbortRef.current) return null;

      while (bulkPauseRef.current && !bulkAbortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (bulkAbortRef.current) return null;

      // Check if we still have credits (stop if exhausted)
      if (remainingCredits < 1) {
        bulkAbortRef.current = true;
        toast.warning("Credits exhausted — remaining cards skipped.");
        return null;
      }

      // Deduct 1 credit upfront before checking — retry up to 3 times on network errors
      let upfrontDeduct: any = null;
      let upfrontSuccess = false;
      for (let deductAttempt = 0; deductAttempt < 3; deductAttempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('deduct-credits', {
            body: { amount: 1 }
          });
          if (!error && data?.success) {
            upfrontDeduct = data;
            upfrontSuccess = true;
            break;
          }
          // If server says insufficient credits, don't retry
          if (data?.error?.includes?.('insufficient') || data?.newCredits === 0) {
            break;
          }
          // Network/transient error — wait and retry
          if (deductAttempt < 2) {
            await new Promise(r => setTimeout(r, 500 + deductAttempt * 300));
          }
        } catch (e) {
          console.error('[BULK] Credit deduction attempt failed:', e);
          if (deductAttempt < 2) {
            await new Promise(r => setTimeout(r, 500 + deductAttempt * 300));
          }
        }
      }
      
      if (!upfrontSuccess || !upfrontDeduct) {
        // Only abort if we're truly out of credits, otherwise skip this card
        if (remainingCredits <= 1) {
          bulkAbortRef.current = true;
          toast.warning("Credits exhausted — remaining cards skipped.");
          return null;
        }
        // Transient error — skip this card but continue processing others
        console.warn('[BULK] Skipping card due to credit deduction error, continuing...');
        return null;
      }
      
      remainingCredits = upfrontDeduct.newCredits;
      totalCreditsDeducted += 1;
      setUserCredits(upfrontDeduct.newCredits);

      const cardData = affordableCards[cardIndex];

      try {
        // Use real API for auth gateways and PAYGATE, simulation for others
        let gatewayResponse: GatewayApiResponse | null = null;
        
        if (selectedGateway.id === "stripe_auth") {
          gatewayResponse = await checkCardViaApi(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "combined_auth") {
          gatewayResponse = await checkCardViaAdyenAuth(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "braintree_auth") {
          gatewayResponse = await checkCardViaB3(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "paygate_charge") {
          gatewayResponse = await checkCardViaPaygate(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "stripe_charge") {
          gatewayResponse = await checkCardViaStripeCharge(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "payu_charge") {
          gatewayResponse = await checkCardViaPayU(cardData.card, cardData.month, cardData.year, cardData.cvv, payuAmount);
        } else if (selectedGateway.id === "pwgate_charge") {
          gatewayResponse = await checkCardViaPwgate(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "stripelow_charge") {
          gatewayResponse = await checkCardViaStripeLow(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "b3vbv_auth") {
          gatewayResponse = await checkCardViaVbv(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "rizzup_charge") {
          gatewayResponse = await checkCardViaRizzup(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "paypal_charge") {
          gatewayResponse = await checkCardViaPaypal(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "authnet_auth") {
          gatewayResponse = await checkCardViaAuthNet(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "paypal_graphql") {
          gatewayResponse = await checkCardViaPaypalGraphql(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "adyen_auth") {
          gatewayResponse = await checkCardViaAdyen(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "paypal_woo") {
          gatewayResponse = await checkCardViaPaypalWoo(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "authnet_charge") {
          gatewayResponse = await checkCardViaAuthNetCharge(cardData.card, cardData.month, cardData.year, cardData.cvv);
        } else if (selectedGateway.id === "razorpay_charge") {
          // Auto-rotate: pick a random site from database, or use manual site
          const site = razorpaySiteMode === "database" 
            ? razorpaySites[Math.floor(Math.random() * razorpaySites.length)] 
            : razorpaySite;
          gatewayResponse = await checkCardViaRazorpay(cardData.card, cardData.month, cardData.year, cardData.cvv, site);
        } else if (selectedGateway.id === "shopify_charge") {
          gatewayResponse = await checkCardViaShopify(cardData.card, cardData.month, cardData.year, cardData.cvv);
          // Don't abort the bulk run if user proxies die — the edge function
          // automatically falls back to direct calls. Just warn the user once.
          if ((gatewayResponse as any)?.allProxiesDead && !bulkProxyWarnedRef.current) {
            bulkProxyWarnedRef.current = true;
            toast.warning("⚠️ Some proxies are failing — continuing without them.", {
              duration: 6000,
              description: "Add fresh proxies in Proxy Manager for better reliability.",
            });
          }
        }
        
        const checkStatus = gatewayResponse ? gatewayResponse.status : await simulateCheck();

        const fullCardStr = `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`;
        const displayCardStr = cardData.originalCvv 
          ? `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.originalCvv}`
          : `${cardData.card}|${cardData.month}|${cardData.year}`;
        
        // Deduct 1 extra credit for LIVE/CHARGED results (1 already deducted upfront) — with retry
        if (checkStatus === "live" || checkStatus === "killed") {
          for (let extraAttempt = 0; extraAttempt < 3; extraAttempt++) {
            try {
              const { data: extraDeduct, error: extraError } = await supabase.functions.invoke('deduct-credits', {
                body: { amount: 1 }
              });
              if (!extraError && extraDeduct?.success) {
                remainingCredits = extraDeduct.newCredits;
                totalCreditsDeducted += 1;
                setUserCredits(extraDeduct.newCredits);
                break;
              }
              if (extraAttempt < 2) await new Promise(r => setTimeout(r, 500));
            } catch (e) {
              if (extraAttempt < 2) await new Promise(r => setTimeout(r, 500));
            }
          }
        }

        // Log check with full card details
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
        const isOrderPlaced = gatewayResponse && (
          (gatewayResponse.apiMessage || '').toUpperCase().includes('ORDER_PLACED') ||
          (gatewayResponse.apiMessage || '').toUpperCase().includes('ORDER PLACED') ||
          (gatewayResponse.rawResponse || '').toUpperCase().includes('ORDER_PLACED')
        );
        const apiResponseDisplay = gatewayResponse 
          ? isOrderPlaced
            ? '💎 ORDER PLACED'
            : `${gatewayResponse.apiStatus}: ${gatewayResponse.apiMessage}${gatewayResponse.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`
          : undefined;
        
        const bulkResult: BulkResult = {
          _id: crypto.randomUUID(),
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

        // Notifications are handled server-side by edge functions to avoid duplicates

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
          _id: crypto.randomUUID(),
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

    // Keep 50-card Shopify sessions, but pace edge invocations to avoid BOOT_ERROR bursts
    const isShopifyBulk = selectedGateway.id === "shopify_charge";
    let completedCount = 0;

    if (isShopifyBulk) {
      // Wave-based model: launch 25 cards while the invocation queue keeps
      // live function calls near 20 to avoid BOOT_ERROR bursts. Each card renders its result
      // immediately as it arrives.
      const WAVE_SIZE = 25;
      const WAVE_THRESHOLD = 24; // proceed to next wave when this many finish
      const WAVE_COOLDOWN_MS = 3000; // cooldown between waves

      const addShopifyResult = (cardData: typeof affordableCards[number], gatewayResponse: any) => {
        const fullCardStr = `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.cvv}`;
        const displayCardStr = cardData.originalCvv
          ? `${cardData.card}|${cardData.month}|${cardData.year}|${cardData.originalCvv}`
          : `${cardData.card}|${cardData.month}|${cardData.year}`;
        const { brand, brandColor } = detectCardBrandLocal(cardData.card);

        if (gatewayResponse?.allProxiesDead && !bulkProxyWarnedRef.current) {
          bulkProxyWarnedRef.current = true;
          toast.warning("⚠️ Some proxies are failing — continuing without them.", {
            duration: 6000,
            description: "Add fresh proxies in Proxy Manager for better reliability.",
          });
        }

        const checkStatus = gatewayResponse?.computedStatus === "live" || gatewayResponse?.status === "live" ? "live" : gatewayResponse?.computedStatus === "dead" || gatewayResponse?.status === "dead" ? "dead" : "unknown";
        const apiMessage = gatewayResponse?.apiMessage || 'No response';
        const rawResponse = gatewayResponse?.rawResponse || JSON.stringify(gatewayResponse || {});
        const isOrderPlaced = apiMessage.toUpperCase().includes('ORDER_PLACED') || rawResponse.toUpperCase().includes('ORDER_PLACED');
        const bulkResult: BulkResult = {
          _id: crypto.randomUUID(),
          status: checkStatus,
          message: checkStatus === "live" ? "Valid" : checkStatus === "dead" ? "Declined" : "Unknown",
          gateway: selectedGateway.name,
          cardMasked: maskCard(cardData.card),
          fullCard: fullCardStr,
          displayCard: displayCardStr,
          brand,
          brandColor,
          apiResponse: isOrderPlaced ? '💎 ORDER PLACED' : `${gatewayResponse?.apiStatus || 'UNKNOWN'}: ${apiMessage}${gatewayResponse?.apiTotal ? ` (${gatewayResponse.apiTotal})` : ''}`,
          usedApi: gatewayResponse?.usedSite,
          rawResponse,
        };

        allResults.push(bulkResult);
        completedCount++;
        processedCount++;
        pendingResultsRef.current.push(bulkResult);
        bulkStatsRef.current.completed = completedCount;
        setGatewayHistory(prev => [{
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          gateway: selectedGateway.id,
          status: 'completed',
          result: bulkResult.status,
          fullCard: fullCardStr,
          displayCard: displayCardStr,
        }, ...prev].slice(0, 50));
        scheduleFlush();
      };

      // Process cards in paced waves
      let cardIndex = 0;
      while (cardIndex < affordableCards.length && !bulkAbortRef.current) {
        while (bulkPauseRef.current && !bulkAbortRef.current) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (bulkAbortRef.current) break;

        const waveEnd = Math.min(cardIndex + WAVE_SIZE, affordableCards.length);
        const waveCards = affordableCards.slice(cardIndex, waveEnd);
        const waveSize = waveCards.length;
        const threshold = Math.max(1, Math.min(waveSize - 1, WAVE_THRESHOLD)); // 49 of 50, or N-1 for smaller waves
        console.log(`[SHOPIFY-WAVE] Starting parallel wave: cards ${cardIndex + 1}-${waveEnd} (${waveSize} cards)`);

        // Fire all cards in parallel as INDEPENDENT single-card checks so each
        // result renders the moment it resolves (one-by-one streaming UX),
        // instead of waiting for the whole batch response.
        const completed = new Array<boolean>(waveSize).fill(false);
        await Promise.all(waveCards.map(async (c, i) => {
          let result: any;
          try {
            const r = await checkCardViaShopify(c.card, c.month, c.year, c.cvv);
            result = {
              computedStatus: r.status,
              apiStatus: r.apiStatus,
              apiMessage: r.apiMessage,
              apiTotal: r.apiTotal,
              rawResponse: r.rawResponse,
              usedSite: (r as any).usedSite,
              allProxiesDead: (r as any).allProxiesDead,
            };
          } catch (e) {
            console.warn('[SHOPIFY-WAVE] single-card check failed', e);
            result = {
              computedStatus: 'unknown',
              apiStatus: 'ERROR',
              apiMessage: e instanceof Error ? e.message : 'No response from gateway',
              rawResponse: '',
            };
          }
          completed[i] = true;
          // Render this card's result immediately
          addShopifyResult(waveCards[i], result);
        }));

        console.log(`[SHOPIFY-WAVE] Wave complete (${waveSize} cards), moving to next wave`);

        cardIndex = waveEnd;

        // Cooldown between waves (skip after final wave)
        if (cardIndex < affordableCards.length && !bulkAbortRef.current) {
          console.log(`[SHOPIFY-WAVE] Cooling down ${WAVE_COOLDOWN_MS}ms before next wave`);
          const cooldownEnd = Date.now() + WAVE_COOLDOWN_MS;
          while (Date.now() < cooldownEnd && !bulkAbortRef.current) {
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    } else {
      // Other gateways: worker-pool model
      const workerMultiplier = 4;
      const maxWorkers = 40;
      const CONCURRENT_WORKERS = Math.min(workerCount * workerMultiplier, maxWorkers);
      let currentIndex = 0;

      const processNextCard = async (): Promise<void> => {
        while (currentIndex < affordableCards.length && !bulkAbortRef.current) {
          const myIndex = currentIndex++;
          
          while (bulkPauseRef.current && !bulkAbortRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (bulkAbortRef.current) return;
          
          const result = await processCard(myIndex);
          if (result) {
            allResults.push(result);
            completedCount++;
            processedCount++;
            pendingResultsRef.current.push(result);
            bulkStatsRef.current.completed = completedCount;
            scheduleFlush();
          }
        }
      };

      const workers = Array(Math.min(CONCURRENT_WORKERS, affordableCards.length))
        .fill(null)
        .map(() => processNextCard());
      
      await Promise.all(workers);
    }

    // Final flush to ensure all remaining results are shown
    clearInterval(flushInterval);
    flushPendingResults();

    if (bulkAbortRef.current) {
      toast.info("Bulk check stopped");
    }

    // Disable background mode when bulk check completes
    stopBackgroundMode();
    
    setBulkChecking(false);
    setIsBulkChecking(false);
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

  // Recheck only UNKNOWN cards
  const recheckUnknowns = () => {
    const unknownCards = bulkResults.filter(r => r.status === "unknown");
    if (unknownCards.length === 0) {
      toast.info("No unknown results to recheck");
      return;
    }
    // Remove unknown results from current results, keep live/dead
    setBulkResults(prev => prev.filter(r => r.status !== "unknown"));
    // Feed unknown cards back into the input and start
    const unknownCardLines = unknownCards.map(r => r.fullCard).join('\n');
    setBulkInput(unknownCardLines);
    // Use a small delay so state updates propagate before starting
    setTimeout(() => {
      startBulkCheck();
    }, 100);
  };

  // Auto-stop bulk check when user navigates away or component unmounts
  useEffect(() => {
    return () => {
      bulkAbortRef.current = true;
      bulkPauseRef.current = false;
      stopBackgroundMode();
      setIsBulkChecking(false);
    };
  }, [stopBackgroundMode, setIsBulkChecking]);

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

  // Helper function to get the correct status display label based on gateway
  const getStatusDisplayLabel = (status: "live" | "dead" | "unknown" | "killed", gatewayId?: string, gatewayType?: string): string => {
    // Killer Auth - show KILLED
    if (gatewayId === "killer_auth") {
      if (status === "live" || status === "killed") return "KILLED";
      if (status === "dead") return "DECLINED";
      return "UNKNOWN";
    }
    
    // Yunchi VBV Auth - show PASSED/REJECTED
    if (gatewayId === "b3vbv_auth") {
      if (status === "live") return "PASSED";
      if (status === "dead") return "REJECTED";
      return "UNKNOWN";
    }
    
    // Auth gateways (Chao, Adyen, App Based) - show LIVE/DEAD
    if (gatewayType === "auth") {
      if (status === "live") return "LIVE";
      if (status === "dead") return "DEAD";
      return "UNKNOWN";
    }
    
    // RazorPay Charge - show CHARGED / DECLINED
    if (gatewayId === "razorpay_charge") {
      if (status === "live") return "CHARGED";
      if (status === "dead") return "DECLINED";
      return "UNKNOWN";
    }
    
    // Charge gateways - show CHARGED/DECLINED
    if (gatewayType === "charge") {
      if (status === "live") return "CHARGED";
      if (status === "dead") return "DECLINED";
      return "UNKNOWN";
    }
    
    // Default fallback
    if (status === "live") return "LIVE";
    if (status === "dead") return "DEAD";
    if (status === "killed") return "KILLED";
    return "UNKNOWN";
  };

  const liveCount = useMemo(() => bulkResults.filter(r => r.status === "live").length, [bulkResults]);
  const deadCount = useMemo(() => bulkResults.filter(r => r.status === "dead").length, [bulkResults]);
  const unknownCount = useMemo(() => bulkResults.filter(r => r.status === "unknown").length, [bulkResults]);
  const filteredBulkResults = useMemo(() => 
    bulkResults.filter(r => bulkResultFilter === "all" || r.status === bulkResultFilter),
    [bulkResults, bulkResultFilter]
  );

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

        <Tabs value={gatewayTab} onValueChange={(v) => { setGatewayTab(v); localStorage.setItem("gatewayTab", v); }} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="auth" className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Auth Gates
              <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                {sortedGateways.filter(g => g.type === "auth" || g.type === "preauth").length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="charge" className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4" />
              Charge Gates
              <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                {sortedGateways.filter(g => g.type === "charge").length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {["auth", "charge"].map((tabType) => (
            <TabsContent key={tabType} value={tabType}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedGateways
                  .filter(g => tabType === "auth" ? (g.type === "auth" || g.type === "preauth") : g.type === "charge")
                  .map((gateway) => (
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
                          <Badge className={`text-[10px] font-semibold border rounded-full px-2.5 py-0.5 ${
                            gateway.code === "Chaos" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                            gateway.code === "Adyen" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                            gateway.code === "App Based" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            "bg-primary/20 text-primary border-primary/30"
                          }`}>
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
            </TabsContent>
          ))}
        </Tabs>
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
              if (bulkChecking) {
                toast.warning("Please stop the bulk check before going back.");
                return;
              }
              setSelectedGateway(null);
              clearForm();
              clearBulk();
            }}
            className="shrink-0"
            disabled={bulkChecking}
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
              {selectedGateway?.id === 'killer_auth' ? (
                <span className="font-medium">Killed: {CREDIT_COST_KILLER}, Error: Free</span>
              ) : (
                <span className="font-medium">Dead: {CREDIT_COST_DEAD}, Live: {CREDIT_COST_LIVE}, Error: Free</span>
              )}
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
                      <span className="text-[8px] font-mono text-foreground font-bold italic break-all">
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

      {/* Card Check Tabs - Killer Auth only supports single check */}
      <Tabs defaultValue="single" className="w-full">
        <TabsList className={`w-full max-w-md ${selectedGateway?.id === 'killer_auth' ? 'grid-cols-1' : 'grid grid-cols-2'}`}>
          <TabsTrigger value="single" className="text-xs sm:text-sm">
            <CreditCard className="h-3 w-3 mr-1" />
            Single Check
          </TabsTrigger>
          {selectedGateway?.id !== 'killer_auth' && (
            <TabsTrigger value="bulk" className="text-xs sm:text-sm">
              <Layers className="h-3 w-3 mr-1" />
              Bulk Check
            </TabsTrigger>
          )}
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

                {/* RazorPay Site Configuration - Single Check */}
                {selectedGateway?.id === "razorpay_charge" && (
                  <div className="rounded-xl border border-border/60 bg-secondary/30 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/60 border-b border-border/40">
                      <Globe className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Gateway Routing</span>
                    </div>
                    
                    <div className="p-3 space-y-3">
                      {/* Mode selector */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-secondary/80">
                        <button
                          type="button"
                          onClick={() => {
                            setRazorpaySiteMode("database");
                            if (razorpaySites.length > 0) {
                              setRazorpaySite(razorpaySites[Math.floor(Math.random() * razorpaySites.length)]);
                            }
                          }}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                            razorpaySiteMode === "database"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                          }`}
                          disabled={checking}
                        >
                          <Shuffle className="h-3.5 w-3.5" />
                          Auto Rotate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRazorpaySiteMode("manual");
                            setRazorpaySite("");
                          }}
                          className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                            razorpaySiteMode === "manual"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                          }`}
                          disabled={checking}
                        >
                          <PenLine className="h-3.5 w-3.5" />
                          Custom URL
                        </button>
                      </div>

                      {/* Content area */}
                      {razorpaySiteMode === "database" ? (
                        loadingSites ? (
                          <div className="flex items-center justify-center gap-2 py-3">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground">Fetching available endpoints...</span>
                          </div>
                        ) : razorpaySites.length === 0 ? (
                          <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-destructive/10 border border-destructive/20">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            <span className="text-xs text-destructive">No endpoints available. Please use Custom URL.</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-primary/5 border border-primary/15">
                            <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs text-muted-foreground">
                              Requests will be distributed across <span className="font-semibold text-foreground">{razorpaySites.length}</span> endpoints automatically
                            </span>
                          </div>
                        )
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center">
                            <span className="px-3 py-[7px] text-xs font-mono bg-secondary border border-r-0 border-border rounded-l-md text-muted-foreground whitespace-nowrap">
                              razorpay.me/@
                            </span>
                            <Input
                              placeholder="username"
                              value={razorpaySite.replace(/^https?:\/\/razorpay\.me\/@?/i, '')}
                              onChange={(e) => {
                                const username = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '');
                                setRazorpaySite(username ? `https://razorpay.me/@${username}` : '');
                              }}
                              className="font-mono text-xs h-9 bg-background rounded-l-none"
                              disabled={checking}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground pl-1">
                            Enter the merchant username (e.g. <span className="font-mono">starinternational6682</span>)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Shopify Charge Proxy Manager */}
                {selectedGateway?.id === "shopify_charge" && (
                  <>
                    <UserProxyManager onProxyCountChange={setShopifyProxyCount} />
                    <ShopifyPriceGroupSelector 
                      onGroupSelect={setShopifyPriceGroup}
                      selectedGroup={shopifyPriceGroup}
                    />
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
                      <Database className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Sites Available:</span>
                      <Badge variant="secondary" className="text-xs font-mono">{shopifySiteCount}</Badge>
                    </div>
                  </>
                )}
              </div>

              {result && (
                <div className={`p-4 rounded-lg border ${
                  result.status === "live" || result.status === "killed"
                    ? "bg-green-500/10 border-green-500/30" 
                    : result.status === "dead"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-yellow-500/10 border-yellow-500/30"
                }`}>
                  {/* Card with status badge and brand logo */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      result.status === "live" || result.status === "killed"
                        ? "bg-green-500 text-white" 
                        : result.status === "dead"
                          ? "bg-red-500 text-white"
                          : "bg-yellow-500 text-black"
                    }`}>
                      {getStatusDisplayLabel(result.status, selectedGateway?.id, selectedGateway?.type)}
                    </span>
                    <CardBrandLogo brand={binInfo.brand} size="sm" />
                    <span className="font-mono text-sm text-foreground font-semibold flex-1">
                      {cardNumber.replace(/\s/g, '')}|{expMonth}|{expYear}|{cvv}
                    </span>
                    <button
                      onClick={() => {
                        const fullCard = `${cardNumber.replace(/\s/g, '')}|${expMonth}|${expYear}|${cvv}`;
                        navigator.clipboard.writeText(fullCard);
                        toast.success("Copied card");
                      }}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Separator line */}
                  <div className="border-t border-dashed border-muted-foreground/30 my-3" />

                  {/* Gateway, Status, Response, Price from API */}
                  {(() => {
                    let apiGateway = selectedGateway?.name || result.gateway || 'N/A';
                    let apiPrice = '';
                    let apiResponseText = '';
                    let apiStatusText = getStatusDisplayLabel(result.status, selectedGateway?.id, selectedGateway?.type);
                    let apiSite = '';
                    
                    try {
                      const raw = result.rawResponse ? JSON.parse(result.rawResponse) : null;
                      if (raw) {
                        // Handle {"detail": {...}} envelope from new API
                        const inner = raw.detail && typeof raw.detail === 'object' ? raw.detail : raw;
                        
                        // Extract Response
                        if (inner.Response) {
                          apiResponseText = String(inner.Response).replace(/<[^>]*>/g, '');
                        } else if (raw.apiMessage) {
                          apiResponseText = String(raw.apiMessage).replace(/<[^>]*>/g, '');
                        }
                        
                        // Extract Price
                        if (inner.Price !== undefined && Number(inner.Price) > 0) {
                          apiPrice = `$${Number(inner.Price).toFixed(2)}`;
                        } else if (raw.apiPrice) {
                          apiPrice = raw.apiPrice;
                        } else if (raw.apiTotal) {
                          apiPrice = raw.apiTotal;
                        }
                        
                        // Extract Gate
                        if (inner.Gate) {
                          apiGateway = inner.Gate;
                        }
                        
                        // Extract Site
                        if (inner.Site) {
                          apiSite = inner.Site;
                        }

                        // Extract error details from new API format
                        if (inner.details?.error && !apiResponseText) {
                          apiResponseText = inner.details.error;
                        }
                      }
                    } catch {}
                    
                    if (!apiResponseText) apiResponseText = result.message || 'No response';
                    if (!apiPrice) apiPrice = selectedGateway?.type === "auth" ? "$0 AUTH" : "N/A";
                    
                    return (
                      <div className="space-y-1.5 font-mono text-xs">
                        <div className="flex">
                          <span className="w-24 text-muted-foreground font-bold italic">GATEWAY</span>
                          <span className="text-muted-foreground font-bold italic mr-2">:</span>
                          <span className="text-primary font-bold italic">
                            {apiGateway}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-muted-foreground font-bold italic">STATUS</span>
                          <span className="text-muted-foreground font-bold italic mr-2">:</span>
                          <span className={`font-bold italic ${
                            /charged|approved|live|killed|passed/i.test(apiStatusText) ? 'text-green-400' :
                            /declined|dead|failed|rejected/i.test(apiStatusText) ? 'text-red-400' : 'text-yellow-400'
                          }`}>{apiStatusText}</span>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-muted-foreground font-bold italic">RESPONSE</span>
                          <span className="text-muted-foreground font-bold italic mr-2">:</span>
                          <span className="text-foreground font-bold italic break-all">{apiResponseText}</span>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-muted-foreground font-bold italic">PRICE</span>
                          <span className="text-muted-foreground font-bold italic mr-2">:</span>
                          <span className="text-foreground font-bold italic">{apiPrice}</span>
                        </div>
                        {apiSite && (
                          <div className="flex">
                            <span className="w-24 text-muted-foreground font-bold italic">SITE</span>
                            <span className="text-muted-foreground font-bold italic mr-2">:</span>
                            <span className="text-foreground/70 font-bold italic break-all text-[10px]">{apiSite}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Admin RAW API RESPONSE debug */}
              {isAdmin && result?.rawResponse && (
                <details className="rounded-lg border border-border/60 bg-secondary/20 overflow-hidden">
                  <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors select-none">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <span className="uppercase tracking-wide">RAW API RESPONSE</span>
                  </summary>
                  <div className="px-3 pb-3">
                    <pre className="text-[10px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all bg-background/50 rounded-md p-2 max-h-64 overflow-y-auto border border-border/30">
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
                      {selectedGateway?.id === "killer_auth" ? "Killing..." : "Checking..."}
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      {selectedGateway?.id === "killer_auth" ? "Kill" : "Check"}
                    </>
                  )}
                </Button>
              </div>

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
                    {[3, 4, 5, 6, 7, 8, 9, 10].map(n => (
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

              {/* RazorPay Site Configuration for Bulk */}
              {selectedGateway?.id === "razorpay_charge" && (
                <div className="rounded-xl border border-border/60 bg-secondary/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary/60 border-b border-border/40">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Gateway Routing</span>
                  </div>
                  
                  <div className="p-3 space-y-3">
                    {/* Mode selector */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-secondary/80">
                      <button
                        type="button"
                        onClick={() => setRazorpaySiteMode("database")}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                          razorpaySiteMode === "database"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        disabled={bulkChecking}
                      >
                        <Shuffle className="h-3.5 w-3.5" />
                        Auto Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRazorpaySiteMode("manual");
                          setRazorpaySite("");
                        }}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                          razorpaySiteMode === "manual"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                        disabled={bulkChecking}
                      >
                        <PenLine className="h-3.5 w-3.5" />
                        Custom URL
                      </button>
                    </div>

                    {/* Content area */}
                    {razorpaySiteMode === "database" ? (
                      loadingSites ? (
                        <div className="flex items-center justify-center gap-2 py-3">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Fetching available endpoints...</span>
                        </div>
                      ) : razorpaySites.length === 0 ? (
                        <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          <span className="text-xs text-destructive">No endpoints available. Please use Custom URL.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-primary/5 border border-primary/15">
                          <Database className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            Each request will be routed through a random endpoint from <span className="font-semibold text-foreground">{razorpaySites.length}</span> available sites
                          </span>
                        </div>
                      )
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center">
                          <span className="px-3 py-[7px] text-xs font-mono bg-secondary border border-r-0 border-border rounded-l-md text-muted-foreground whitespace-nowrap">
                            razorpay.me/@
                          </span>
                          <Input
                            placeholder="username"
                            value={razorpaySite.replace(/^https?:\/\/razorpay\.me\/@?/i, '')}
                            onChange={(e) => {
                              const username = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '');
                              setRazorpaySite(username ? `https://razorpay.me/@${username}` : '');
                            }}
                            className="font-mono text-xs h-9 bg-background rounded-l-none"
                            disabled={bulkChecking}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground pl-1">
                          Enter the merchant username — all requests route through this endpoint
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Shopify Charge Price Group Selector for Bulk */}
              {selectedGateway?.id === "shopify_charge" && (
                <ShopifyPriceGroupSelector 
                  onGroupSelect={setShopifyPriceGroup}
                  selectedGroup={shopifyPriceGroup}
                />
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
                        key={liveCount}
                        className="text-xl sm:text-2xl font-bold text-green-500 animate-scale-in tabular-nums"
                      >
                        {liveCount}
                      </span>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-border" />
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <ShieldX className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Dead:</span>
                      <span className="text-base sm:text-lg font-semibold text-red-500 tabular-nums">
                        {deadCount}
                      </span>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-border" />
                    {/* Live Success Rate */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Rate:</span>
                      {(() => {
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
                      disabled={parseCards(bulkInput).length === 0 || (selectedGateway?.id === "shopify_charge" && shopifyProxyCount < 1)}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      {selectedGateway?.id === "shopify_charge" && shopifyProxyCount < 1 
                        ? "⚠️ Add Proxy First" 
                        : `Check (${parseCards(bulkInput).length} cards)`}
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
                    {unknownCount > 0 && !bulkChecking && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={recheckUnknowns}
                          className="h-6 px-2 text-[10px] text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10 gap-1"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Recheck {unknownCount} Unknown
                        </Button>
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
                    {filteredBulkResults
                      .map((r) => {
                        // Get BIN info for display
                        const cardNum = r.fullCard?.split('|')[0] || '';
                        const brand = r.brand || detectCardBrandLocal(cardNum).brand;
                        
                        return (
                          <div 
                            key={r._id} 
                            className={`p-3 rounded-lg border animate-fade-in-fast ${
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
                                {getStatusDisplayLabel(r.status, selectedGateway?.id, selectedGateway?.type)}
                              </span>
                              <CardBrandLogo brand={brand} size="sm" />
                              <span className="font-mono text-xs text-foreground font-bold italic flex-1 break-all">
                                {r.fullCard}
                              </span>
                              {r.status === "unknown" && !bulkChecking && (
                                <button
                                  onClick={() => {
                                    // Remove this result and recheck just this card
                                    setBulkResults(prev => prev.filter(p => p._id !== r._id));
                                    setBulkInput(r.fullCard);
                                    setTimeout(() => startBulkCheck(), 100);
                                  }}
                                  className="p-1 hover:bg-yellow-500/20 rounded shrink-0"
                                  title="Recheck this card"
                                >
                                  <RefreshCw className="h-3 w-3 text-yellow-500" />
                                </button>
                              )}
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
                            
                            {/* Gateway, Status, Response, Price from API */}
                            {(() => {
                              let bGateway = selectedGateway?.name || 'N/A';
                              let bPrice = '';
                              let bResponse = '';
                              let bStatus = getStatusDisplayLabel(r.status, selectedGateway?.id, selectedGateway?.type);
                              
                              try {
                                const raw = r.rawResponse ? JSON.parse(r.rawResponse) : null;
                                if (raw) {
                                  if (raw.apiStatus) bStatus = raw.apiStatus;
                                  if (raw.apiPrice) bPrice = raw.apiPrice;
                                  else if (raw.apiTotal) bPrice = raw.apiTotal;
                                  
                                  let inner = null;
                                  try { inner = typeof raw.rawResponse === 'string' ? JSON.parse(raw.rawResponse) : null; } catch {}
                                  if (!inner) try { inner = typeof raw.apiMessage === 'string' ? JSON.parse(raw.apiMessage) : null; } catch {}
                                  
                                  if (inner?.Response) {
                                    bResponse = String(inner.Response).replace(/<[^>]*>/g, '');
                                  } else if (raw.Response) {
                                    bResponse = String(raw.Response).replace(/<[^>]*>/g, '');
                                  } else if (raw.apiMessage) {
                                    bResponse = String(raw.apiMessage).replace(/<[^>]*>/g, '');
                                  }
                                  
                                  if (inner?.Price !== undefined) bPrice = typeof inner.Price === 'number' ? `$${inner.Price.toFixed(2)}` : String(inner.Price);
                                  else if (raw.Price !== undefined) bPrice = typeof raw.Price === 'number' ? `$${raw.Price.toFixed(2)}` : String(raw.Price);
                                }
                              } catch {}
                              
                              if (!bResponse) bResponse = r.message || 'No response';
                              if (!bPrice) bPrice = selectedGateway?.type === "auth" ? "$0 AUTH" : "N/A";
                              
                              return (
                                <div className="space-y-1 font-mono text-[10px]">
                                  <div className="flex">
                                    <span className="w-20 text-muted-foreground font-bold italic">GATEWAY</span>
                                    <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                    <span className="text-primary font-bold italic">
                                      {bGateway}
                                    </span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-muted-foreground font-bold italic">STATUS</span>
                                    <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                    <span className={`font-bold italic ${
                                      /charged|approved|live|killed|passed/i.test(bStatus) ? 'text-green-400' :
                                      /declined|dead|failed|rejected/i.test(bStatus) ? 'text-red-400' : 'text-yellow-400'
                                    }`}>{bStatus}</span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-muted-foreground font-bold italic shrink-0">RESPONSE</span>
                                    <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                    <span className="text-foreground font-bold italic break-all">{bResponse}</span>
                                  </div>
                                  <div className="flex">
                                    <span className="w-20 text-muted-foreground font-bold italic">PRICE</span>
                                    <span className="text-muted-foreground font-bold italic mr-1">:</span>
                                    <span className="text-foreground font-bold italic">{bPrice}</span>
                                  </div>
                                </div>
                              );
                            })()}
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
