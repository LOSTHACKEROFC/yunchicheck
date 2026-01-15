import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Coins, 
  TrendingDown, 
  CreditCard,
  History,
  RefreshCw,
  Filter,
  Calendar,
  Zap,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CreditUsageCharts from "@/components/CreditUsageCharts";
import SpendingAlertSettings from "@/components/SpendingAlertSettings";

interface CardCheck {
  id: string;
  gateway: string;
  status: string;
  created_at: string;
}

interface GatewayStats {
  gateway: string;
  count: number;
  credits: number;
}

const CREDIT_COST_PER_CHECK = 1;

// Gateway display name mapping
const GATEWAY_DISPLAY_NAMES: Record<string, string> = {
  "YUNCHI AUTH": "Yunchi Auth",
  "YUNCHI PRE AUTH": "Yunchi Pre Auth",
  "YUNCHI AUTH 2": "Yunchi Auth 2",
  "CLOVER CHARGE": "Yunchi Clover",
  "SQUARE CHARGE": "Yunchi Square",
  "SHOPIFY CHARGE": "Yunchi Shopify",
};

const getGatewayDisplayName = (gateway: string): string => {
  return GATEWAY_DISPLAY_NAMES[gateway] || gateway;
};

const CreditUsage = () => {
  const [checks, setChecks] = useState<CardCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [credits, setCredits] = useState<number>(0);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    setUserId(user.id);

    // Fetch credits
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();
    
    setCredits(profile?.credits || 0);

    // Build query for card checks
    let query = supabase
      .from("card_checks")
      .select("id, gateway, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    // Apply time filter
    if (timeFilter !== "all") {
      const days = parseInt(timeFilter);
      const startDate = startOfDay(subDays(new Date(), days));
      query = query.gte("created_at", startDate.toISOString());
    }

    const { data: checksData } = await query;

    let filteredChecks = checksData || [];

    // Apply gateway filter
    if (gatewayFilter !== "all") {
      filteredChecks = filteredChecks.filter(c => c.gateway === gatewayFilter);
    }

    setChecks(filteredChecks);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [timeFilter, gatewayFilter]);

  // Real-time subscription for card checks
  useEffect(() => {
    if (!userId) return;

    const checkChannel = supabase
      .channel('usage-check-updates')
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

  // Get unique gateways for filter
  const uniqueGateways = [...new Set(checks.map(c => c.gateway))];

  // Calculate statistics
  const totalChecks = checks.length;
  const completedChecks = checks.filter(c => c.status === "completed").length;
  const pendingChecks = checks.filter(c => c.status === "pending").length;
  const failedChecks = checks.filter(c => c.status === "failed").length;
  const totalCreditsUsed = completedChecks * CREDIT_COST_PER_CHECK;

  // Gateway breakdown
  const gatewayStats: GatewayStats[] = uniqueGateways.map(gateway => {
    const gatewayChecks = checks.filter(c => c.gateway === gateway && c.status === "completed");
    return {
      gateway,
      count: gatewayChecks.length,
      credits: gatewayChecks.length * CREDIT_COST_PER_CHECK
    };
  }).sort((a, b) => b.count - a.count);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

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
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Credit Usage</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Track how your credits are spent on checks</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Available Credits
            </CardTitle>
            <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-primary">{credits.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Ready to use</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Credits Spent
            </CardTitle>
            <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-destructive">{totalCreditsUsed.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{timeFilter === "all" ? "All time" : `Last ${timeFilter} days`}</p>
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
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
              <span className="text-green-500">{completedChecks}</span> / 
              <span className="text-yellow-500 mx-1">{pendingChecks}</span> / 
              <span className="text-destructive">{failedChecks}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Cost Per Check
            </CardTitle>
            <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-lg sm:text-2xl font-bold text-yellow-500">{CREDIT_COST_PER_CHECK}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Credits per check</p>
          </CardContent>
        </Card>
      </div>

      {/* Spending Alert Settings */}
      <SpendingAlertSettings />

      {/* Usage Charts */}
      <CreditUsageCharts checks={checks} creditCostPerCheck={CREDIT_COST_PER_CHECK} />

      {/* Gateway Breakdown */}
      {gatewayStats.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Usage by Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gatewayStats.map((stat) => (
                <div
                  key={stat.gateway}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{getGatewayDisplayName(stat.gateway)}</p>
                      <p className="text-xs text-muted-foreground">{stat.count} checks</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{stat.credits}</p>
                    <p className="text-xs text-muted-foreground">credits</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Gateway" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All gateways</SelectItem>
              {uniqueGateways.map(gateway => (
                <SelectItem key={gateway} value={gateway}>{getGatewayDisplayName(gateway)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Check History */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Check History
            <Badge variant="outline" className="ml-1 sm:ml-2 text-[10px] sm:text-xs">
              Live
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
          <div className="space-y-2 sm:space-y-3">
            {checks.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <CreditCard className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 opacity-50" />
                <p className="text-sm sm:text-base">No checks found</p>
                <p className="text-xs sm:text-sm mt-1">Your credit usage history will appear here</p>
              </div>
            ) : (
              checks.slice(0, 50).map((check) => (
                <div
                  key={check.id}
                  className="flex items-center justify-between p-2 sm:p-4 rounded-lg bg-secondary/50 border border-border transition-all hover:bg-secondary/70"
                >
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/20">
                      {getStatusIcon(check.status)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-xs sm:text-sm truncate">
                        {getGatewayDisplayName(check.gateway)}
                      </p>
                      <p className="text-[10px] sm:text-sm text-muted-foreground">{formatDate(check.created_at)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-bold text-xs sm:text-base text-foreground flex items-center gap-1 justify-end">
                      -{CREDIT_COST_PER_CHECK}
                      <Coins className="h-3 w-3 sm:hidden" />
                      <span className="hidden sm:inline">credits</span>
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] sm:text-xs ${getStatusBadgeClass(check.status)}`}
                    >
                      {check.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
            {checks.length > 50 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                Showing first 50 of {checks.length} checks
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditUsage;
