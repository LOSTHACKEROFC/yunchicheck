import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Bell, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SpendingAlertSettings {
  daily_threshold: number;
  weekly_threshold: number;
  enabled: boolean;
}

const SpendingAlertSettings = () => {
  const [settings, setSettings] = useState<SpendingAlertSettings>({
    daily_threshold: 0,
    weekly_threshold: 0,
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSettings, setHasSettings] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("spending_alert_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (data) {
      setSettings({
        daily_threshold: data.daily_threshold || 0,
        weekly_threshold: data.weekly_threshold || 0,
        enabled: data.enabled ?? true,
      });
      setHasSettings(true);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    if (hasSettings) {
      const { error } = await supabase
        .from("spending_alert_settings")
        .update({
          daily_threshold: settings.daily_threshold,
          weekly_threshold: settings.weekly_threshold,
          enabled: settings.enabled,
        })
        .eq("user_id", user.id);

      if (error) {
        toast.error("Failed to save settings");
        console.error(error);
      } else {
        toast.success("Spending alert settings saved!");
      }
    } else {
      const { error } = await supabase
        .from("spending_alert_settings")
        .insert({
          user_id: user.id,
          daily_threshold: settings.daily_threshold,
          weekly_threshold: settings.weekly_threshold,
          enabled: settings.enabled,
        });

      if (error) {
        toast.error("Failed to save settings");
        console.error(error);
      } else {
        toast.success("Spending alert settings saved!");
        setHasSettings(true);
      }
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="p-3 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
          Spending Alerts
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Get notified when your credit spending exceeds your set thresholds. Alerts are sent once per period.
        </p>

        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">Enable Spending Alerts</p>
              <p className="text-xs text-muted-foreground">Receive notifications when thresholds are exceeded</p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, enabled }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="daily-threshold" className="text-sm font-medium">
              Daily Threshold (Credits)
            </Label>
            <Input
              id="daily-threshold"
              type="number"
              min="0"
              step="10"
              placeholder="e.g., 100"
              value={settings.daily_threshold || ""}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                daily_threshold: parseInt(e.target.value) || 0 
              }))}
              disabled={!settings.enabled}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Alert when daily spending exceeds this amount (0 = disabled)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weekly-threshold" className="text-sm font-medium">
              Weekly Threshold (Credits)
            </Label>
            <Input
              id="weekly-threshold"
              type="number"
              min="0"
              step="50"
              placeholder="e.g., 500"
              value={settings.weekly_threshold || ""}
              onChange={(e) => setSettings(prev => ({ 
                ...prev, 
                weekly_threshold: parseInt(e.target.value) || 0 
              }))}
              disabled={!settings.enabled}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Alert when weekly spending exceeds this amount (0 = disabled)
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={saveSettings} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SpendingAlertSettings;
