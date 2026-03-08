import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Globe, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UserProxy {
  id: string;
  ip: string;
  port: string;
  username: string | null;
  password: string | null;
}

interface UserProxyManagerProps {
  onProxyCountChange?: (count: number) => void;
}

const UserProxyManager = ({ onProxyCountChange }: UserProxyManagerProps) => {
  const [proxies, setProxies] = useState<UserProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newProxy, setNewProxy] = useState("");

  useEffect(() => {
    fetchProxies();
  }, []);

  useEffect(() => {
    onProxyCountChange?.(proxies.length);
  }, [proxies.length, onProxyCountChange]);

  const fetchProxies = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_proxies" as any)
      .select("*")
      .order("created_at", { ascending: true });

    if (!error && data) {
      setProxies(data as any);
    }
    setLoading(false);
  };

  const addProxy = async () => {
    if (!newProxy.trim()) return;
    if (proxies.length >= 10) {
      toast.error("Maximum 10 proxies allowed");
      return;
    }

    // Parse format: ip:port or ip:port:user:pass
    const parts = newProxy.trim().split(":");
    if (parts.length < 2) {
      toast.error("Format: ip:port or ip:port:username:password");
      return;
    }

    const [ip, port, username, password] = parts;
    if (!ip || !port || !/^\d+$/.test(port)) {
      toast.error("Invalid proxy format");
      return;
    }

    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setAdding(false);
      return;
    }

    const { error } = await supabase
      .from("user_proxies" as any)
      .insert({
        user_id: user.id,
        ip,
        port,
        username: username || null,
        password: password || null,
      } as any);

    if (error) {
      toast.error("Failed to add proxy");
    } else {
      setNewProxy("");
      fetchProxies();
      toast.success("Proxy added");
    }
    setAdding(false);
  };

  const removeProxy = async (id: string) => {
    const { error } = await supabase
      .from("user_proxies" as any)
      .delete()
      .eq("id", id);

    if (!error) {
      setProxies(prev => prev.filter(p => p.id !== id));
      toast.success("Proxy removed");
    }
  };

  const isValid = proxies.length >= 1;

  return (
    <div className="p-3 rounded-lg bg-lime-500/10 border border-lime-500/30 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-lime-400" />
          <Label className="text-xs font-semibold text-lime-400">
            Your Proxies ({proxies.length}/10)
          </Label>
        </div>
        {!isValid && (
          <Badge variant="destructive" className="text-[10px] gap-1">
            <AlertTriangle className="w-3 h-3" />
            Min 1 required
          </Badge>
        )}
        {isValid && (
          <Badge className="text-[10px] bg-lime-500/20 text-lime-400 border-lime-500/30">
            Ready
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {proxies.length > 0 && (
            <ScrollArea className="max-h-32">
              <div className="space-y-1.5">
                {proxies.map((proxy, i) => (
                  <div key={proxy.id} className="flex items-center justify-between bg-background/50 rounded px-2 py-1.5 text-xs">
                    <span className="text-muted-foreground font-mono truncate">
                      {i + 1}. {proxy.ip}:{proxy.port}
                      {proxy.username && `:${proxy.username}:***`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive"
                      onClick={() => removeProxy(proxy.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {proxies.length < 10 && (
            <div className="flex gap-2">
              <Input
                placeholder="ip:port:user:pass"
                value={newProxy}
                onChange={(e) => setNewProxy(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addProxy()}
                className="text-xs h-8 font-mono"
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={addProxy}
                disabled={adding || !newProxy.trim()}
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserProxyManager;
