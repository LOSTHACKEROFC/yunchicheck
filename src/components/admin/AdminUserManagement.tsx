import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  Search,
  Loader2,
  RefreshCw,
  Users,
  MoreVertical,
  Ban,
  ShieldCheck,
  Plus,
  CreditCard,
  Eye,
  Mail,
  MessageSquare
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import UserDetailModal from "./UserDetailModal";

interface UserProfile {
  id: string;
  user_id: string;
  username: string | null;
  name: string | null;
  credits: number;
  is_banned: boolean;
  ban_reason: string | null;
  telegram_username: string | null;
  telegram_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserStats {
  total_checks: number;
}

const AdminUserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error fetching users:', error);
      toast.error("Failed to fetch users");
    } else {
      setUsers(data || []);
      
      // Fetch check counts for users
      if (data && data.length > 0) {
        const userIds = data.map(u => u.user_id);
        const { data: checksData } = await supabase
          .from('card_checks')
          .select('user_id')
          .in('user_id', userIds);

        if (checksData) {
          const statsMap: Record<string, UserStats> = {};
          checksData.forEach(check => {
            if (!statsMap[check.user_id]) {
              statsMap[check.user_id] = { total_checks: 0 };
            }
            statsMap[check.user_id].total_checks++;
          });
          setUserStats(statsMap);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleBanUser = async () => {
    if (!selectedUser) return;

    setActionLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: true,
        ban_reason: banReason || 'Banned by admin',
        banned_at: new Date().toISOString()
      })
      .eq('user_id', selectedUser.user_id);

    if (error) {
      console.error('Error banning user:', error);
      toast.error("Failed to ban user");
    } else {
      toast.success(`User ${selectedUser.username} has been banned`);
      setShowBanDialog(false);
      setBanReason("");
      fetchUsers();
    }
    setActionLoading(false);
  };

  const handleUnbanUser = async (user: UserProfile) => {
    setActionLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        banned_until: null
      })
      .eq('user_id', user.user_id);

    if (error) {
      console.error('Error unbanning user:', error);
      toast.error("Failed to unban user");
    } else {
      toast.success(`User ${user.username} has been unbanned`);
      fetchUsers();
    }
    setActionLoading(false);
  };

  const handleAddCredits = async () => {
    if (!selectedUser || !creditAmount) return;

    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid credit amount");
      return;
    }

    setActionLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        credits: selectedUser.credits + amount,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', selectedUser.user_id);

    if (error) {
      console.error('Error adding credits:', error);
      toast.error("Failed to add credits");
    } else {
      toast.success(`Added ${amount} credits to ${selectedUser.username}`);
      setShowCreditDialog(false);
      setCreditAmount("");
      setCreditNote("");
      fetchUsers();
    }
    setActionLoading(false);
  };

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.telegram_username?.toLowerCase().includes(query) ||
      user.user_id.toLowerCase().includes(query)
    );
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            User Management
          </span>
          <Button variant="outline" size="sm" onClick={fetchUsers}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username, name, or telegram..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/50">
                  <TableHead>User</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Checks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="hover:bg-secondary/30">
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.username || 'No username'}</p>
                        {user.telegram_username && (
                          <p className="text-xs text-muted-foreground">@{user.telegram_username}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-primary">
                      {user.credits.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {userStats[user.user_id]?.total_checks?.toLocaleString() || '0'}
                    </TableCell>
                    <TableCell>
                      {user.is_banned ? (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          Banned
                        </Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setShowUserDialog(true);
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setShowCreditDialog(true);
                          }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Credits
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.is_banned ? (
                            <DropdownMenuItem 
                              onClick={() => handleUnbanUser(user)}
                              className="text-green-400"
                            >
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              Unban User
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedUser(user);
                                setShowBanDialog(true);
                              }}
                              className="text-red-400"
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Ban User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Showing {filteredUsers.length} of {users.length} users
        </p>
      </CardContent>

      {/* User Details Modal */}
      <UserDetailModal
        open={showUserDialog}
        onOpenChange={setShowUserDialog}
        userId={selectedUser?.user_id || null}
        username={selectedUser?.username || null}
      />

      {/* Ban Dialog */}
      <Dialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              Ban {selectedUser?.username} from the platform
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Ban Reason</label>
              <Input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter reason for ban..."
                className="mt-1 bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBanDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBanUser} 
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ban User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Credits Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add Credits</DialogTitle>
            <DialogDescription>
              Add credits to {selectedUser?.username}'s account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Current Balance</label>
              <p className="text-lg font-bold text-primary">
                {selectedUser?.credits.toLocaleString()} credits
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Amount to Add</label>
              <Input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Enter credit amount..."
                className="mt-1 bg-secondary border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Input
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                placeholder="Reason for adding credits..."
                className="mt-1 bg-secondary border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddCredits} 
              disabled={actionLoading || !creditAmount}
              className="bg-green-600 hover:bg-green-700"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Credits'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminUserManagement;
