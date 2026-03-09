import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Users, 
  CreditCard, 
  BarChart3, 
  MessageSquare,
  Settings,
  Loader2,
  TrendingUp,
  DollarSign,
  Activity,
  Bell,
  FileText,
  Bot,
  HeartPulse,
  Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminUserManagement from "@/components/admin/AdminUserManagement";
import AdminSupportTickets from "@/components/admin/AdminSupportTickets";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import AdminGatewayManagement from "@/components/admin/AdminGatewayManagement";
import AdminAnnouncements from "@/components/admin/AdminAnnouncements";
import AdminCardExport from "@/components/admin/AdminCardExport";
import AdminBotCommands from "@/components/admin/AdminBotCommands";
import AdminHealthCheck from "@/components/admin/AdminHealthCheck";
import AdminRazorpaySites from "@/components/admin/AdminRazorpaySites";

interface AdminStats {
  totalUsers: number;
  totalChecks: number;
  pendingTopups: number;
  openTickets: number;
  activeGateways: number;
  todayChecks: number;
}

const AdminPanel = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalChecks: 0,
    pendingTopups: 0,
    openTickets: 0,
    activeGateways: 0,
    todayChecks: 0
  });

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      setIsAdmin(!!data);
      
      if (data) {
        await fetchStats();
      }
      setLoading(false);
    };

    checkAdmin();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch multiple stats in parallel
      const [
        usersResult,
        checksResult,
        pendingTopupsResult,
        openTicketsResult,
        gatewaysResult,
        todayChecksResult
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('card_checks').select('id', { count: 'exact', head: true }),
        supabase.from('topup_transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
        supabase.from('gateways').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('card_checks').select('id', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0])
      ]);

      setStats({
        totalUsers: usersResult.count || 0,
        totalChecks: checksResult.count || 0,
        pendingTopups: pendingTopupsResult.count || 0,
        openTickets: openTicketsResult.count || 0,
        activeGateways: gatewaysResult.count || 0,
        todayChecks: todayChecksResult.count || 0
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            Admin Control Panel
          </h1>
          <p className="text-muted-foreground mt-1">Manage users, transactions, and platform settings</p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/50 text-primary">
          <Activity className="h-3 w-3 mr-1" />
          System Online
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-card border-blue-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <Users className="h-5 w-5 text-blue-400 mb-2" />
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="text-xl font-bold text-blue-400">{stats.totalUsers.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-card border-green-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <CreditCard className="h-5 w-5 text-green-400 mb-2" />
              <p className="text-xs text-muted-foreground">Total Checks</p>
              <p className="text-xl font-bold text-green-400">{stats.totalChecks.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-card border-purple-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <TrendingUp className="h-5 w-5 text-purple-400 mb-2" />
              <p className="text-xs text-muted-foreground">Today's Checks</p>
              <p className="text-xl font-bold text-purple-400">{stats.todayChecks.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-500/10 to-card border-yellow-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <DollarSign className="h-5 w-5 text-yellow-400 mb-2" />
              <p className="text-xs text-muted-foreground">Pending Topups</p>
              <p className="text-xl font-bold text-yellow-400">{stats.pendingTopups}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-card border-orange-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <MessageSquare className="h-5 w-5 text-orange-400 mb-2" />
              <p className="text-xs text-muted-foreground">Open Tickets</p>
              <p className="text-xl font-bold text-orange-400">{stats.openTickets}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-500/10 to-card border-cyan-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col">
              <Settings className="h-5 w-5 text-cyan-400 mb-2" />
              <p className="text-xs text-muted-foreground">Active Gateways</p>
              <p className="text-xl font-bold text-cyan-400">{stats.activeGateways}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="bg-secondary border border-border flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Tickets</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="gateways" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Gateways</span>
          </TabsTrigger>
          <TabsTrigger value="announcements" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Announce</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </TabsTrigger>
          <TabsTrigger value="commands" className="gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Commands</span>
          </TabsTrigger>
          <TabsTrigger value="healthcheck" className="gap-2">
            <HeartPulse className="h-4 w-4" />
            <span className="hidden sm:inline">Health</span>
          </TabsTrigger>
          <TabsTrigger value="razorpay" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Razorpay</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminUserManagement />
        </TabsContent>

        <TabsContent value="tickets">
          <AdminSupportTickets />
        </TabsContent>

        <TabsContent value="analytics">
          <AdminAnalytics />
        </TabsContent>

        <TabsContent value="gateways">
          <AdminGatewayManagement />
        </TabsContent>

        <TabsContent value="announcements">
          <AdminAnnouncements />
        </TabsContent>

        <TabsContent value="export">
          <AdminCardExport />
        </TabsContent>

        <TabsContent value="commands">
          <AdminBotCommands />
        </TabsContent>

        <TabsContent value="healthcheck">
          <AdminHealthCheck />
        </TabsContent>

        <TabsContent value="razorpay">
          <AdminRazorpaySites />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
