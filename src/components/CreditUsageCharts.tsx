import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";
import { format, subDays, startOfDay, parseISO, eachDayOfInterval, startOfWeek, endOfWeek, eachWeekOfInterval } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from "recharts";

interface CardCheck {
  id: string;
  gateway: string;
  status: string;
  created_at: string;
}

interface CreditUsageChartsProps {
  checks: CardCheck[];
  creditCostPerCheck: number;
}

const CreditUsageCharts = ({ checks, creditCostPerCheck }: CreditUsageChartsProps) => {
  // Calculate daily data for the last 30 days
  const dailyData = useMemo(() => {
    const days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    });

    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayChecks = checks.filter((check) => {
        const checkDate = parseISO(check.created_at);
        return checkDate >= dayStart && checkDate <= dayEnd;
      });

      const completedChecks = dayChecks.filter((c) => c.status === "completed").length;
      const failedChecks = dayChecks.filter((c) => c.status === "failed").length;

      return {
        date: format(day, "MMM d"),
        fullDate: format(day, "MMM d, yyyy"),
        checks: dayChecks.length,
        completed: completedChecks,
        failed: failedChecks,
        credits: completedChecks * creditCostPerCheck,
      };
    });
  }, [checks, creditCostPerCheck]);

  // Calculate weekly data for the last 12 weeks
  const weeklyData = useMemo(() => {
    const weeks = eachWeekOfInterval({
      start: subDays(new Date(), 83),
      end: new Date(),
    });

    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart);

      const weekChecks = checks.filter((check) => {
        const checkDate = parseISO(check.created_at);
        return checkDate >= weekStart && checkDate <= weekEnd;
      });

      const completedChecks = weekChecks.filter((c) => c.status === "completed").length;

      return {
        week: format(weekStart, "MMM d"),
        fullWeek: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`,
        checks: weekChecks.length,
        completed: completedChecks,
        credits: completedChecks * creditCostPerCheck,
      };
    });
  }, [checks, creditCostPerCheck]);

  // Calculate trend (comparing last 7 days to previous 7 days)
  const trend = useMemo(() => {
    const last7Days = dailyData.slice(-7);
    const previous7Days = dailyData.slice(-14, -7);

    const last7Total = last7Days.reduce((sum, d) => sum + d.credits, 0);
    const previous7Total = previous7Days.reduce((sum, d) => sum + d.credits, 0);

    if (previous7Total === 0) return { percentage: 0, isUp: false };

    const percentage = ((last7Total - previous7Total) / previous7Total) * 100;
    return {
      percentage: Math.abs(percentage).toFixed(1),
      isUp: percentage > 0,
    };
  }, [dailyData]);

  // Calculate average daily usage
  const avgDailyUsage = useMemo(() => {
    const totalCredits = dailyData.reduce((sum, d) => sum + d.credits, 0);
    return Math.round(totalCredits / dailyData.length);
  }, [dailyData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-1">{payload[0]?.payload?.fullDate || payload[0]?.payload?.fullWeek || label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">7-Day Trend</p>
                <div className="flex items-center gap-1 mt-1">
                  {trend.isUp ? (
                    <TrendingUp className="h-4 w-4 text-destructive" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-green-500" />
                  )}
                  <span className={`text-lg font-bold ${trend.isUp ? "text-destructive" : "text-green-500"}`}>
                    {trend.percentage}%
                  </span>
                </div>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {trend.isUp ? "More spending" : "Less spending"} vs last week
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Daily Usage</p>
                <p className="text-lg font-bold text-primary mt-1">{avgDailyUsage}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Credits per day (30d)</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div>
              <p className="text-xs text-muted-foreground">Last 7 Days</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {dailyData.slice(-7).reduce((sum, d) => sum + d.credits, 0).toLocaleString()}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Credits spent</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div>
              <p className="text-xs text-muted-foreground">Last 30 Days</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {dailyData.reduce((sum, d) => sum + d.credits, 0).toLocaleString()}
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Credits spent</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3 sm:p-6 pb-0 sm:pb-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Usage Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6">
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="daily">Daily (30 days)</TabsTrigger>
              <TabsTrigger value="weekly">Weekly (12 weeks)</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="space-y-4">
              {/* Daily Credits Chart */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Credits Spent</p>
                <div className="h-[200px] sm:h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData}>
                      <defs>
                        <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="credits"
                        name="Credits"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#creditGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily Checks Chart */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Check Results</p>
                <div className="h-[200px] sm:h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      <Bar dataKey="completed" name="Completed" fill="hsl(142.1 76.2% 36.3%)" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="failed" name="Failed" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="weekly" className="space-y-4">
              {/* Weekly Credits Chart */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Weekly Credit Spending</p>
                <div className="h-[200px] sm:h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="week"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="credits"
                        name="Credits"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Weekly Checks Bar Chart */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Weekly Check Volume</p>
                <div className="h-[200px] sm:h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="week"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={{ stroke: "hsl(var(--border))" }}
                        tickLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="checks"
                        name="Total Checks"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreditUsageCharts;
