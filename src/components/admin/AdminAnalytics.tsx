import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Loader2,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Users,
  CreditCard,
  CheckCircle,
  XCircle,
  Zap,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

interface AnalyticsData {
  totalChecks: number;
  liveCards: number;
  deadCards: number;
  chargedCards: number;
  successRate: number;
  todayChecks: number;
  weeklyChecks: number;
  uniqueUsersToday: number;
  dailyStats: { date: string; checks: number; live: number; dead: number }[];
  gatewayStats: { name: string; count: number; color: string }[];
}

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const AdminAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const weekStart = subDays(startOfDay(now), 7).toISOString();

      // Fetch all card checks
      const { data: allChecks, error: checksError } = await supabase
        .from('card_checks')
        .select('id, status, result, gateway, created_at, user_id');

      if (checksError) throw checksError;

      const checks = allChecks || [];

      // Calculate stats
      const totalChecks = checks.length;
      const liveCards = checks.filter(c => c.result?.toLowerCase().includes('live') || c.result?.toLowerCase().includes('approved')).length;
      const deadCards = checks.filter(c => c.result?.toLowerCase().includes('dead') || c.result?.toLowerCase().includes('declined')).length;
      const chargedCards = checks.filter(c => c.result?.toLowerCase().includes('charged')).length;
      const successRate = totalChecks > 0 ? (liveCards / totalChecks) * 100 : 0;

      const todayChecks = checks.filter(c => c.created_at >= todayStart).length;
      const weeklyChecks = checks.filter(c => c.created_at >= weekStart).length;
      const uniqueUsersToday = new Set(checks.filter(c => c.created_at >= todayStart).map(c => c.user_id)).size;

      // Daily stats for last 7 days
      const dailyStats: { date: string; checks: number; live: number; dead: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = startOfDay(subDays(now, i)).toISOString();
        const dayEnd = startOfDay(subDays(now, i - 1)).toISOString();
        const dayChecks = checks.filter(c => c.created_at >= dayStart && c.created_at < dayEnd);
        dailyStats.push({
          date: format(subDays(now, i), 'MMM d'),
          checks: dayChecks.length,
          live: dayChecks.filter(c => c.result?.toLowerCase().includes('live') || c.result?.toLowerCase().includes('approved')).length,
          dead: dayChecks.filter(c => c.result?.toLowerCase().includes('dead') || c.result?.toLowerCase().includes('declined')).length
        });
      }

      // Gateway stats
      const gatewayMap = new Map<string, number>();
      checks.forEach(c => {
        const gateway = c.gateway || 'Unknown';
        gatewayMap.set(gateway, (gatewayMap.get(gateway) || 0) + 1);
      });
      const gatewayStats = Array.from(gatewayMap.entries())
        .map(([name, count], idx) => ({ name, count, color: CHART_COLORS[idx % CHART_COLORS.length] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      setData({
        totalChecks,
        liveCards,
        deadCards,
        chargedCards,
        successRate,
        todayChecks,
        weeklyChecks,
        uniqueUsersToday,
        dailyStats,
        gatewayStats
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error("Failed to fetch analytics");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Failed to load analytics</p>
        <Button onClick={fetchAnalytics} className="mt-4">Retry</Button>
      </div>
    );
  }

  const pieData = [
    { name: 'Live', value: data.liveCards, color: '#10b981' },
    { name: 'Dead', value: data.deadCards, color: '#ef4444' },
    { name: 'Charged', value: data.chargedCards, color: '#f59e0b' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Platform Analytics
        </h3>
        <Button variant="outline" size="sm" onClick={fetchAnalytics}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-card border-blue-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-blue-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Checks</p>
                <p className="text-2xl font-bold text-blue-400">{data.totalChecks.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-card border-green-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Live Cards</p>
                <p className="text-2xl font-bold text-green-400">{data.liveCards.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-card border-red-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">Dead Cards</p>
                <p className="text-2xl font-bold text-red-400">{data.deadCards.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-card border-yellow-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-yellow-400" />
              <div>
                <p className="text-xs text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-yellow-400">{data.successRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Checks</p>
                <p className="text-3xl font-bold text-primary">{data.todayChecks.toLocaleString()}</p>
              </div>
              <Calendar className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-3xl font-bold text-primary">{data.weeklyChecks.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users Today</p>
                <p className="text-3xl font-bold text-primary">{data.uniqueUsersToday}</p>
              </div>
              <Users className="h-10 w-10 text-primary/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Activity Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">Daily Activity (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="live" name="Live" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="dead" name="Dead" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Card Results Pie Chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm">Card Results Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Gateway Usage */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Gateway Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {data.gatewayStats.map((gateway, idx) => (
              <div 
                key={gateway.name}
                className="p-3 rounded-lg bg-secondary/50 border border-border"
              >
                <p className="text-xs text-muted-foreground truncate">{gateway.name}</p>
                <p className="text-xl font-bold" style={{ color: gateway.color }}>
                  {gateway.count.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalytics;
