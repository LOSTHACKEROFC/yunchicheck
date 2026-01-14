import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Mail, Calendar, Shield, Key, MessageCircle, Pencil, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TelegramProfile {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

const Profile = () => {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [email, setEmail] = useState("");
  const [balance, setBalance] = useState(0);
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [telegramProfile, setTelegramProfile] = useState<TelegramProfile | null>(null);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  
  // Store original values for cancel functionality
  const [originalValues, setOriginalValues] = useState({
    username: "",
    name: "",
    telegramChatId: "",
    telegramUsername: "",
  });

  const hasUnsavedChanges = () => {
    return (
      username !== originalValues.username ||
      name !== originalValues.name ||
      telegramChatId !== originalValues.telegramChatId ||
      telegramUsername !== originalValues.telegramUsername
    );
  };

  const fetchTelegramProfile = async (chatId: string) => {
    if (!chatId) {
      setTelegramProfile(null);
      return;
    }
    
    setLoadingTelegram(true);
    try {
      const response = await supabase.functions.invoke("get-telegram-profile", {
        body: { chat_id: chatId },
      });
      
      if (response.error) {
        console.error("Error fetching Telegram profile:", response.error);
        setTelegramProfile(null);
      } else {
        setTelegramProfile(response.data);
      }
    } catch (error) {
      console.error("Error fetching Telegram profile:", error);
      setTelegramProfile(null);
    } finally {
      setLoadingTelegram(false);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || "");
        setCreatedAt(new Date(user.created_at).toLocaleDateString());
        const { data } = await supabase
          .from("profiles")
          .select("username, name, telegram_chat_id, telegram_username, balance")
          .eq("user_id", user.id)
          .maybeSingle();
        
        const profileData = {
          username: data?.username || "",
          name: data?.name || "",
          telegramChatId: data?.telegram_chat_id || "",
          telegramUsername: data?.telegram_username || "",
        };
        
        setUsername(profileData.username);
        setName(profileData.name);
        setTelegramChatId(profileData.telegramChatId);
        setTelegramUsername(profileData.telegramUsername);
        setOriginalValues(profileData);
        setBalance(data?.balance || 0);
        
        // Fetch Telegram profile if chat ID exists
        if (data?.telegram_chat_id) {
          fetchTelegramProfile(data.telegram_chat_id);
        }
      }
    };
    fetchProfile();
  }, []);

  const handleEdit = () => {
    setOriginalValues({
      username,
      name,
      telegramChatId,
      telegramUsername,
    });
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    if (hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      setIsEditing(false);
    }
  };

  const handleConfirmDiscard = () => {
    setUsername(originalValues.username);
    setName(originalValues.name);
    setTelegramChatId(originalValues.telegramChatId);
    setTelegramUsername(originalValues.telegramUsername);
    setIsEditing(false);
    setShowDiscardDialog(false);
  };

  const handleUpdate = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          username,
          name,
          telegram_chat_id: telegramChatId,
          telegram_username: telegramUsername
        })
        .eq("user_id", user.id);
      
      if (error) {
        toast.error("Failed to update profile");
      } else {
        toast.success("Profile updated successfully");
        setOriginalValues({
          username,
          name,
          telegramChatId,
          telegramUsername,
        });
        setIsEditing(false);
        
        // Refresh Telegram profile if chat ID changed
        if (telegramChatId !== originalValues.telegramChatId) {
          fetchTelegramProfile(telegramChatId);
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Account Details
            </CardTitle>
            {!isEditing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelClick}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-primary">
                {telegramProfile?.photo_url ? (
                  <AvatarImage 
                    src={telegramProfile.photo_url} 
                    alt="Telegram Profile" 
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                  {loadingTelegram ? "..." : (username?.charAt(0)?.toUpperCase() || email?.charAt(0)?.toUpperCase() || "U")}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold">
                  {telegramProfile?.first_name 
                    ? `${telegramProfile.first_name}${telegramProfile.last_name ? ` ${telegramProfile.last_name}` : ""}`
                    : (username || "User")}
                </h3>
                <p className="text-muted-foreground text-sm">{email}</p>
                {telegramProfile?.username && (
                  <p className="text-primary text-sm flex items-center gap-1 mt-1">
                    <MessageCircle className="h-3 w-3" />
                    @{telegramProfile.username}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="bg-secondary border-border opacity-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Username
                </Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="Enter username"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="Enter your full name"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telegramUsername" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Telegram Username
                </Label>
                <Input
                  id="telegramUsername"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="@username"
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="telegramChatId" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Telegram Chat ID
                </Label>
                <Input
                  id="telegramChatId"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="Enter your Telegram Chat ID"
                  disabled={!isEditing}
                />
              </div>
            </div>

            {isEditing && (
              <Button
                onClick={handleUpdate}
                className="btn-primary"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Member Since
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{createdAt}</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Account Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-green-500">Active</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Key className="h-4 w-4" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-primary">${balance.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
