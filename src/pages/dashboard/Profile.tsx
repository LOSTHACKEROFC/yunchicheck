import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Mail, Calendar, Shield, Key, MessageCircle, Pencil, X, Unlink } from "lucide-react";
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
import SessionManagement from "@/components/SessionManagement";

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
  const [credits, setCredits] = useState(0);
  const [createdAt, setCreatedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [telegramProfile, setTelegramProfile] = useState<TelegramProfile | null>(null);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  
  // Store original values for cancel functionality
  const [originalValues, setOriginalValues] = useState({
    username: "",
    name: "",
  });

  const hasUnsavedChanges = () => {
    return (
      username !== originalValues.username ||
      name !== originalValues.name
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
    let chatIdRef = "";
    
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setEmail(user.email || "");
        setCreatedAt(new Date(user.created_at).toLocaleDateString());
        const { data } = await supabase
          .from("profiles")
          .select("username, name, telegram_chat_id, telegram_username, credits")
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
        setCredits(data?.credits || 0);
        
        chatIdRef = data?.telegram_chat_id || "";
        
        // Fetch Telegram profile if chat ID exists
        if (data?.telegram_chat_id) {
          fetchTelegramProfile(data.telegram_chat_id);
        }
      }
    };
    fetchProfile();

    // Auto-refresh Telegram status every 30 seconds
    const intervalId = setInterval(() => {
      if (chatIdRef) {
        fetchTelegramProfile(chatIdRef);
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const handleEdit = () => {
    setOriginalValues({
      username,
      name,
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
        })
        .eq("user_id", user.id);
      
      if (error) {
        toast.error("Failed to update profile");
      } else {
        toast.success("Profile updated successfully");
        setOriginalValues({
          username,
          name,
        });
        setIsEditing(false);
      }
    }
    setLoading(false);
  };

  const handleUnlinkTelegram = async () => {
    setUnlinking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("User not found");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ 
          telegram_chat_id: null,
          telegram_username: null
        })
        .eq("user_id", user.id);

      if (error) {
        toast.error("Failed to unlink Telegram");
        console.error("Unlink error:", error);
      } else {
        toast.success("Telegram account unlinked successfully");
        setTelegramChatId("");
        setTelegramUsername("");
        setTelegramProfile(null);
        setShowUnlinkDialog(false);
      }
    } catch (error) {
      console.error("Error unlinking Telegram:", error);
      toast.error("An error occurred while unlinking");
    } finally {
      setUnlinking(false);
    }
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
                  {telegramChatId && (
                    <span className="flex items-center gap-1 ml-auto">
                      <span 
                        className={`h-2 w-2 rounded-full ${
                          loadingTelegram 
                            ? "bg-yellow-500 animate-pulse" 
                            : telegramProfile 
                              ? "bg-green-500" 
                              : "bg-red-500"
                        }`} 
                      />
                      <span className={`text-xs ${
                        loadingTelegram 
                          ? "text-yellow-500" 
                          : telegramProfile 
                            ? "text-green-500" 
                            : "text-red-500"
                      }`}>
                        {loadingTelegram ? "Checking..." : telegramProfile ? "Connected" : "Disconnected"}
                      </span>
                    </span>
                  )}
                </Label>
                <Input
                  id="telegramUsername"
                  value={telegramProfile?.username ? `@${telegramProfile.username}` : (telegramUsername ? `@${telegramUsername}` : "")}
                  className="bg-secondary border-border opacity-50"
                  placeholder="Detected from Telegram"
                  disabled
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="telegramChatId" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Telegram Chat ID
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="telegramChatId"
                    value={telegramChatId}
                    className="bg-secondary border-border flex-1 opacity-50"
                    placeholder="Linked during registration"
                    disabled
                  />
                  {telegramChatId && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowUnlinkDialog(true)}
                      className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      title="Unlink Telegram"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Telegram details are automatically detected and cannot be edited manually.
                </p>
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
                Current Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-primary">{credits.toLocaleString()} credits</p>
            </CardContent>
        </Card>
        </div>

        {/* Session Management */}
        <div className="lg:col-span-3">
          <SessionManagement />
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

      {/* Unlink Telegram Confirmation Dialog */}
      <AlertDialog open={showUnlinkDialog} onOpenChange={setShowUnlinkDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Unlink Telegram Account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will disconnect your Telegram account from your profile. You will no longer receive notifications via Telegram. You can link a new Telegram account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnlinkTelegram}
              disabled={unlinking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinking ? "Unlinking..." : "Unlink Telegram"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
