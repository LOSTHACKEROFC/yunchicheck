import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Globe,
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  Zap,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UserProxy {
  id: string;
  ip: string;
  port: string;
  username: string | null;
  password: string | null;
}

interface ProxyStatus {
  [id: string]: "checking" | "live" | "dead" | "unknown";
}

interface UserProxyManagerProps {
  onProxyCountChange?: (count: number) => void;
}

const UserProxyManager = ({ onProxyCountChange }: UserProxyManagerProps) => {
  const [proxies, setProxies] = useState<UserProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newProxy, setNewProxy] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [proxyStatuses, setProxyStatuses] = useState<ProxyStatus>({});
  const [checkingAll, setCheckingAll] = useState(false);

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

  const parseProxy = (raw: string): { ip: string; port: string; username?: string; password?: string } | null => {
    const parts = raw.trim().split(":");
    if (parts.length < 2) return null;
    const [ip, port, username, password] = parts;
    if (!ip || !port || !/^\d+$/.test(port)) return null;
    return { ip, port, username, password };
  };

  // Check proxies via edge function
  const checkProxiesViaEdge = async (
    proxyList: { ip: string; port: string; username?: string; password?: string; id?: string }[]
  ): Promise<{ ip: string; port: string; id?: string; status: "live" | "dead" }[]> => {
    try {
      const { data, error } = await supabase.functions.invoke("check-proxy", {
        body: { proxies: proxyList },
      });

      if (error || !data?.results) {
        console.error("Proxy check error:", error);
        return proxyList.map(p => ({ ...p, status: "dead" as const }));
      }

      return data.results;
    } catch {
      return proxyList.map(p => ({ ...p, status: "dead" as const }));
    }
  };

  const addProxy = async () => {
    if (!newProxy.trim()) return;
    if (proxies.length >= 10) {
      toast.error("Maximum 10 proxies allowed");
      return;
    }

    const parsed = parseProxy(newProxy);
    if (!parsed) {
      toast.error("Format: ip:port or ip:port:user:pass");
      return;
    }

    setAdding(true);

    // Check proxy liveness FIRST
    toast.info("Checking proxy liveness...");
    const results = await checkProxiesViaEdge([parsed]);
    const result = results[0];

    if (result?.status !== "live") {
      toast.error(`Proxy ${parsed.ip}:${parsed.port} is DEAD — not added`);
      setAdding(false);
      return;
    }

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
        ip: parsed.ip,
        port: parsed.port,
        username: parsed.username || null,
        password: parsed.password || null,
      } as any);

    if (error) {
      toast.error("Failed to add proxy");
    } else {
      setNewProxy("");
      fetchProxies();
      toast.success(`Proxy ${parsed.ip}:${parsed.port} is LIVE ✓ — added`);
    }
    setAdding(false);
  };

  const addBulkProxies = async () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const remaining = 10 - proxies.length;
    if (remaining <= 0) {
      toast.error("Maximum 10 proxies allowed");
      return;
    }

    const toAdd = lines.slice(0, remaining);
    const parsed = toAdd.map(parseProxy).filter(Boolean) as { ip: string; port: string; username?: string; password?: string }[];
    if (!parsed.length) {
      toast.error("No valid proxies found");
      return;
    }

    setAdding(true);
    toast.info(`Checking ${parsed.length} proxies for liveness...`);

    // Check ALL proxies first
    const results = await checkProxiesViaEdge(parsed);
    const liveProxies = results.filter(r => r.status === "live");
    const deadCount = results.filter(r => r.status === "dead").length;

    if (liveProxies.length === 0) {
      toast.error(`All ${parsed.length} proxies are DEAD — none added`);
      setAdding(false);
      return;
    }

    if (deadCount > 0) {
      toast.warning(`${deadCount} dead proxies skipped`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not authenticated");
      setAdding(false);
      return;
    }

    const rows = liveProxies.map(p => ({
      user_id: user.id,
      ip: p.ip,
      port: p.port,
      username: (parsed.find(pp => pp.ip === p.ip && pp.port === p.port)?.username) || null,
      password: (parsed.find(pp => pp.ip === p.ip && pp.port === p.port)?.password) || null,
    }));

    const { error } = await supabase
      .from("user_proxies" as any)
      .insert(rows as any);

    if (error) {
      toast.error("Failed to add proxies");
    } else {
      setBulkText("");
      fetchProxies();
      toast.success(`${liveProxies.length} live proxies added, ${deadCount} dead skipped`);
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
      setProxyStatuses(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      toast.success("Proxy removed");
    }
  };

  const checkSingleProxy = useCallback(async (proxy: UserProxy) => {
    setProxyStatuses(prev => ({ ...prev, [proxy.id]: "checking" }));
    const results = await checkProxiesViaEdge([{
      id: proxy.id,
      ip: proxy.ip,
      port: proxy.port,
      username: proxy.username || undefined,
      password: proxy.password || undefined,
    }]);
    const result = results[0];
    setProxyStatuses(prev => ({
      ...prev,
      [proxy.id]: result?.status === "live" ? "live" : "dead",
    }));
  }, []);

  const checkAllProxies = async () => {
    if (!proxies.length) return;
    setCheckingAll(true);

    // Set all to checking
    const checkingState: ProxyStatus = {};
    proxies.forEach(p => { checkingState[p.id] = "checking"; });
    setProxyStatuses(checkingState);

    const proxyList = proxies.map(p => ({
      id: p.id,
      ip: p.ip,
      port: p.port,
      username: p.username || undefined,
      password: p.password || undefined,
    }));

    const results = await checkProxiesViaEdge(proxyList);

    const newStatuses: ProxyStatus = {};
    results.forEach(r => {
      if (r.id) {
        newStatuses[r.id] = r.status === "live" ? "live" : "dead";
      }
    });
    setProxyStatuses(prev => ({ ...prev, ...newStatuses }));

    const live = results.filter(r => r.status === "live").length;
    const dead = results.filter(r => r.status === "dead").length;
    setCheckingAll(false);
    toast.success(`Check complete: ${live} live, ${dead} dead`);
  };

  const getStatusIcon = (id: string) => {
    const status = proxyStatuses[id];
    if (status === "checking") return <Loader2 className="w-3.5 h-3.5 animate-spin text-yellow-400" />;
    if (status === "live") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    if (status === "dead") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    if (status === "unknown") return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    return <Globe className="w-3.5 h-3.5 text-muted-foreground/50" />;
  };

  const getStatusBadge = (id: string) => {
    const status = proxyStatuses[id];
    if (status === "checking") return <Badge variant="outline" className="text-[9px] h-4 border-yellow-500/40 text-yellow-400 animate-pulse">Checking</Badge>;
    if (status === "live") return <Badge variant="outline" className="text-[9px] h-4 border-emerald-500/40 text-emerald-400">Live ✓</Badge>;
    if (status === "dead") return <Badge variant="outline" className="text-[9px] h-4 border-red-500/40 text-red-400">Dead ✗</Badge>;
    if (status === "unknown") return <Badge variant="outline" className="text-[9px] h-4 border-muted text-muted-foreground">N/A</Badge>;
    return null;
  };

  const liveCount = Object.values(proxyStatuses).filter(s => s === "live").length;
  const deadCount = Object.values(proxyStatuses).filter(s => s === "dead").length;
  const isValid = proxies.length >= 1;

  return (
    <div className="rounded-xl border border-lime-500/20 bg-gradient-to-b from-lime-500/5 to-transparent overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-lime-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-lime-500/15 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-lime-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground tracking-wide">Your Proxies</h4>
            <p className="text-[10px] text-muted-foreground">
              {proxies.length}/10 slots used
              {liveCount > 0 && <span className="text-emerald-400 ml-1">• {liveCount} live</span>}
              {deadCount > 0 && <span className="text-red-400 ml-1">• {deadCount} dead</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!isValid && (
            <Badge variant="destructive" className="text-[9px] gap-1 h-5">
              <AlertTriangle className="w-3 h-3" />
              Min 1
            </Badge>
          )}
          {isValid && (
            <Badge className="text-[9px] bg-lime-500/15 text-lime-400 border border-lime-500/30 h-5">
              <Wifi className="w-3 h-3 mr-0.5" />
              Ready
            </Badge>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-lime-400/60" />
          </div>
        ) : (
          <>
            {/* Proxy List */}
            {proxies.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Active Proxies
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-lime-400 hover:text-lime-300 hover:bg-lime-500/10"
                    onClick={checkAllProxies}
                    disabled={checkingAll || proxies.length === 0}
                  >
                    {checkingAll ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Check All
                  </Button>
                </div>

                <ScrollArea className="max-h-44">
                  <div className="space-y-1.5">
                    {proxies.map((proxy) => (
                      <div
                        key={proxy.id}
                        className={`group flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all border ${
                          proxyStatuses[proxy.id] === "live"
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : proxyStatuses[proxy.id] === "dead"
                            ? "bg-red-500/5 border-red-500/20"
                            : "bg-background/60 border-border/50 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {getStatusIcon(proxy.id)}
                          <span className="font-mono text-[11px] text-foreground/80 truncate">
                            {proxy.ip}:{proxy.port}
                            {proxy.username && (
                              <span className="text-muted-foreground">@{proxy.username}</span>
                            )}
                          </span>
                          {getStatusBadge(proxy.id)}
                        </div>
                        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-lime-400 hover:text-lime-300 hover:bg-lime-500/10"
                            onClick={() => checkSingleProxy(proxy)}
                            disabled={proxyStatuses[proxy.id] === "checking"}
                          >
                            <Zap className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeProxy(proxy.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Add Proxies */}
            {proxies.length < 10 && (
              <Tabs defaultValue="single" className="w-full">
                <TabsList className="w-full h-7 bg-background/50">
                  <TabsTrigger value="single" className="text-[10px] h-5 gap-1 flex-1">
                    <Plus className="w-3 h-3" /> Single
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="text-[10px] h-5 gap-1 flex-1">
                    <FileText className="w-3 h-3" /> Bulk
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="single" className="mt-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="ip:port:user:pass"
                      value={newProxy}
                      onChange={(e) => setNewProxy(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addProxy()}
                      className="text-xs h-8 font-mono bg-background/50 border-border/60"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-3 bg-lime-600 hover:bg-lime-700 text-black font-semibold"
                      onClick={addProxy}
                      disabled={adding || !newProxy.trim()}
                    >
                      {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    </Button>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">Only live proxies will be saved</p>
                </TabsContent>

                <TabsContent value="bulk" className="mt-2 space-y-2">
                  <Textarea
                    placeholder={"ip:port:user:pass\nip:port:user:pass\nOne proxy per line..."}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="text-xs font-mono min-h-[72px] bg-background/50 border-border/60 resize-none"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    className="w-full h-7 text-[10px] bg-lime-600 hover:bg-lime-700 text-black font-semibold gap-1"
                    onClick={addBulkProxies}
                    disabled={adding || !bulkText.trim()}
                  >
                    {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    Check & Import ({bulkText.split("\n").filter(l => l.trim()).length} lines)
                  </Button>
                  <p className="text-[9px] text-muted-foreground">Dead proxies will be auto-skipped</p>
                </TabsContent>
              </Tabs>
            )}

            {/* Empty State */}
            {proxies.length === 0 && !loading && (
              <div className="text-center py-4 space-y-1">
                <WifiOff className="w-6 h-6 text-muted-foreground/40 mx-auto" />
                <p className="text-[11px] text-muted-foreground">No proxies added yet</p>
                <p className="text-[10px] text-muted-foreground/60">Add at least 1 proxy to use this gateway</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserProxyManager;
