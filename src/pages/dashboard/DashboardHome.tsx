import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, CreditCard, Activity, ArrowUpCircle, History, HeadphonesIcon, ChevronRight, Users, Zap } from "lucide-react";

const quickLinks = [
  { title: "Topup Balance", description: "Add funds to your account", icon: ArrowUpCircle, url: "/dashboard/topup", color: "text-green-500" },
  { title: "View History", description: "Check your transaction history", icon: History, url: "/dashboard/balance", color: "text-primary" },
  { title: "Get Support", description: "Contact our support team", icon: HeadphonesIcon, url: "/dashboard/support", color: "text-yellow-500" },
];

const DashboardHome = () => {
  const [profile, setProfile] = useState<{ username: string | null; balance: number } | null>(null);
  const [stats, setStats] = useState<{ total_users: number; total_checks: number }>({ total_users: 0, total_checks: 0 });

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("username, balance")
          .eq("user_id", user.id)
          .maybeSingle();
        setProfile(data);
      }
    };
    fetchProfile();
  }, []);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Welcome, <span className="text-primary">{profile?.username || "User"}</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          Dashboard overview
        </p>
      </div>

      {/* Real-time Global Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Total Users (Live)
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.total_users.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered users</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Total Cards Checked (Live)
            </CardTitle>
            <Zap className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{stats.total_checks.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">All time checks</p>
          </CardContent>
        </Card>
      </div>

      {/* User Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Balance
            </CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${profile?.balance?.toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Checks Today
            </CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">0</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              System Status
            </CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Online</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {quickLinks.map((link, index) => (
            <Link
              key={link.title}
              to={link.url}
              className={`flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors ${
                index !== quickLinks.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center`}>
                  <link.icon className={`h-5 w-5 ${link.color}`} />
                </div>
                <div>
                  <p className="font-medium text-foreground">{link.title}</p>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardHome;
