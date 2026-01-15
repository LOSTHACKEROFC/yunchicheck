import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Coins, CreditCard, Activity, ArrowUpCircle, History, HeadphonesIcon, ChevronRight, Users, Zap, TrendingUp, Server } from "lucide-react";

const quickLinks = [
  { title: "Buy Credits", description: "Purchase credit packages", icon: ArrowUpCircle, url: "/dashboard/topup", color: "text-green-500" },
  { title: "View History", description: "Check your transaction history", icon: History, url: "/dashboard/balance", color: "text-primary" },
  { title: "Get Support", description: "Contact our support team", icon: HeadphonesIcon, url: "/dashboard/support", color: "text-yellow-500" },
];

interface TodayStats {
  total: number;
  live: number;
  dead: number;
  unknown: number;
}

interface GatewayStats {
  gateway: string;
  total: number;
  live: number;
  dead: number;
  successRate: number;
}

const DashboardHome = () => {
  const [profile, setProfile] = useState<{ username: string | null; credits: number } | null>(null);
  const [stats, setStats] = useState<{ total_users: number; total_checks: number }>({ total_users: 0, total_checks: 0 });
  const [todayStats, setTodayStats] = useState<TodayStats>({ total: 0, live: 0, dead: 0, unknown: 0 });
  const [gatewayStats, setGatewayStats] = useState<GatewayStats[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data } = await supabase
          .from("profiles")
          .select("username, credits")
          .eq("user_id", user.id)
          .maybeSingle();
        setProfile(data);
      }
    };
    fetchProfile();
  }, []);

  // Fetch today's checks with results and subscribe to real-time updates
  useEffect(() => {
    if (!userId) return;

    const fetchTodayStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data } = await supabase
        .from("card_checks")
        .select("result, gateway")
        .eq("user_id", userId)
        .gte("created_at", today.toISOString());
      
      if (data) {
        const live = data.filter(c => c.result?.toLowerCase().includes('live') || c.result?.toLowerCase().includes('approved')).length;
        const dead = data.filter(c => c.result?.toLowerCase().includes('dead') || c.result?.toLowerCase().includes('declined')).length;
        const unknown = data.length - live - dead;
        setTodayStats({ total: data.length, live, dead, unknown });

        // Calculate gateway-specific stats
        const gatewayMap = new Map<string, { total: number; live: number; dead: number }>();
        data.forEach(check => {
          const gateway = check.gateway || 'Unknown';
          const existing = gatewayMap.get(gateway) || { total: 0, live: 0, dead: 0 };
          const isLive = check.result?.toLowerCase().includes('live') || check.result?.toLowerCase().includes('approved');
          const isDead = check.result?.toLowerCase().includes('dead') || check.result?.toLowerCase().includes('declined');
          gatewayMap.set(gateway, {
            total: existing.total + 1,
            live: existing.live + (isLive ? 1 : 0),
            dead: existing.dead + (isDead ? 1 : 0)
          });
        });

        const gatewayStatsArray: GatewayStats[] = Array.from(gatewayMap.entries()).map(([gateway, stats]) => ({
          gateway,
          total: stats.total,
          live: stats.live,
          dead: stats.dead,
          successRate: stats.total > 0 ? (stats.live / stats.total) * 100 : 0
        })).sort((a, b) => b.total - a.total);

        setGatewayStats(gatewayStatsArray);
      }
    };
    
    fetchTodayStats();

    // Subscribe to real-time updates for card_checks
    const channel = supabase
      .channel('today-checks-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'card_checks',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Re-fetch to get accurate gateway stats
          fetchTodayStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'card_checks',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Re-fetch on updates to get accurate counts
          fetchTodayStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Fetch initial stats and subscribe to real-time updates
  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase
        .from("site_stats")
        .select("total_users, total_checks")
        .eq("id", "global")
        .maybeSingle();
      if (data) {
        setStats(data);
      }
    };
    fetchStats();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('stats-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_stats'
        },
        (payload) => {
          console.log('Stats updated:', payload);
          setStats({
            total_users: payload.new.total_users,
            total_checks: payload.new.total_checks
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
          Welcome, <span className="text-primary">{profile?.username || "User"}</span>
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Dashboard overview
        </p>
      </div>

      {/* Real-time Global Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="hidden xs:inline">Total Users</span>
              <span className="xs:hidden">Users</span>
              <span className="hidden sm:inline">(Live)</span>
            </CardTitle>
            <Users className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-primary">{stats.total_users.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Registered users</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="hidden xs:inline">Total Cards Checked</span>
              <span className="xs:hidden">Checks</span>
              <span className="hidden sm:inline">(Live)</span>
            </CardTitle>
            <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-2xl sm:text-3xl font-bold text-green-500">{stats.total_checks.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">All time checks</p>
          </CardContent>
        </Card>
      </div>

      {/* User Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              Your Credits
            </CardTitle>
            <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-primary flex items-center gap-1">
              {profile?.credits?.toLocaleString() || "0"}
              <span className="text-xs font-normal text-muted-foreground">credits</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="hidden xs:inline">Checks Today</span>
              <span className="xs:hidden">Today</span>
            </CardTitle>
            <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-blue-500">{todayStats.total.toLocaleString()}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Cards checked</p>
          </CardContent>
        </Card>

        {/* Live/Dead Ratio Card */}
        <Card className="bg-gradient-to-br from-emerald-500/20 to-red-500/10 border-emerald-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden xs:inline">Live/Dead</span>
              <span className="xs:hidden">L/D</span>
            </CardTitle>
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-bold text-emerald-500">{todayStats.live}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-xl sm:text-2xl font-bold text-red-500">{todayStats.dead}</span>
            </div>
            {todayStats.total > 0 && (
              <div className="mt-2 space-y-1">
                <Progress 
                  value={(todayStats.live / todayStats.total) * 100} 
                  className="h-1.5 bg-red-500/30"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {((todayStats.live / todayStats.total) * 100).toFixed(1)}% success rate
                </p>
              </div>
            )}
            {todayStats.total === 0 && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">No checks yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              <span className="hidden xs:inline">System Status</span>
              <span className="xs:hidden">Status</span>
            </CardTitle>
            <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl sm:text-2xl font-bold text-green-500">Online</div>
          </CardContent>
        </Card>
      </div>

      {/* Gateway Performance */}
      {gatewayStats.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Server className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span>Gateway Performance</span>
              <span className="text-xs font-normal text-muted-foreground">(Today)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-3">
              {gatewayStats.map((gw) => (
                <div key={gw.gateway} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground truncate max-w-[120px] sm:max-w-none">{gw.gateway}</span>
                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm shrink-0">
                      <span className="text-muted-foreground">{gw.total} checks</span>
                      <span className="text-emerald-500 font-medium">{gw.live} live</span>
                      <span className="text-red-500 font-medium">{gw.dead} dead</span>
                      <span className={`font-bold ${gw.successRate >= 50 ? 'text-emerald-500' : gw.successRate >= 25 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {gw.successRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${gw.successRate}%` }}
                    />
                    <div 
                      className="absolute top-0 h-full bg-red-500 transition-all duration-300"
                      style={{ 
                        left: `${gw.successRate}%`,
                        width: `${gw.total > 0 ? (gw.dead / gw.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quickLinks.map((link, index) => (
            <Link
              key={link.title}
              to={link.url}
              className={`flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/50 transition-colors ${
                index !== quickLinks.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-secondary flex items-center justify-center`}>
                  <link.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${link.color}`} />
                </div>
                <div>
                  <p className="font-medium text-sm sm:text-base text-foreground">{link.title}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden xs:block">{link.description}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardHome;
