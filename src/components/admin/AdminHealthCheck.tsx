import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload,
  Play,
  Square,
  Eraser,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Globe,
  Loader2,
  FileText,
  Zap,
  Database,
  ChevronDown,
  Code,
  Download,
  Filter,
  Shield,
  RefreshCw,
} from "lucide-react";

interface ProxyItem {
  id: string;
  ip: string;
  port: string;
  username: string | null;
  password: string | null;
  status: string;
}

interface SiteResult {
  url: string;
  status: "live" | "dead" | "error";
  price: number;
  priceStr: string;
  apiResponse?: string;
  error?: string;
}

const CONCURRENCY = 40;
const WORKER_STAGGER_MS = 40;
const WARMUP_DELAY_MS = 400;
const BOOT_RETRY_LIMIT = 4;
const BOOT_RETRY_BASE_DELAY_MS = 1200;

const fetchAllGatewayUrls = async (fields: string) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("gateway_urls")
      .select(fields)
      .not("url", "like", "https://razorpay.me/%")
      .gt("price", 0)
      .lte("price", 100)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allData;
};

const AdminHealthCheck = () => {
  const [urls, setUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SiteResult[]>([]);
  const [stats, setStats] = useState({ total: 0, live: 0, dead: 0, errors: 0 });
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [exportFilter, setExportFilter] = useState<"all" | "live" | "dead" | "error">("all");
  const [deletingAll, setDeletingAll] = useState(false);
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proxy config state
  const [systemProxies, setSystemProxies] = useState<ProxyItem[]>([]);
  const [loadingProxies, setLoadingProxies] = useState(false);
  const [proxyMode, setProxyMode] = useState<"random" | "specific" | "custom">("random");
  const [selectedProxyId, setSelectedProxyId] = useState<string>("");
  const [customProxy, setCustomProxy] = useState("");
  const [checkingProxy, setCheckingProxy] = useState(false);

  // Load system proxies
  const loadProxies = async () => {
    setLoadingProxies(true);
    try {
      const { data, error } = await supabase
        .from("proxies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSystemProxies(data || []);
    } catch {
      toast.error("Failed to load proxies");
    } finally {
      setLoadingProxies(false);
    }
  };

  useEffect(() => {
    loadProxies();
  }, []);

  const getProxyInfo = (): { proxy?: string; proxyId?: string } => {
    if (proxyMode === "random") return {}; // let edge function pick randomly
    if (proxyMode === "specific" && selectedProxyId) {
      const p = systemProxies.find((px) => px.id === selectedProxyId);
      if (p) {
        const proxyStr = p.username && p.password
          ? `${p.ip}:${p.port}:${p.username}:${p.password}`
          : `${p.ip}:${p.port}`;
        return { proxy: proxyStr, proxyId: p.id };
      }
    }
    if (proxyMode === "custom" && customProxy.trim()) {
      return { proxy: customProxy.trim() };
    }
    return {};
  };
  
  // Keep backward compat helper
  const getProxyString = (): string | undefined => getProxyInfo().proxy;

  const handleCheckProxy = async () => {
    const proxyStr = getProxyString();
    if (!proxyStr) {
      toast.error("No proxy selected to test");
      return;
    }
    setCheckingProxy(true);
    try {
      const parts = proxyStr.split(":");
      const proxyObj = {
        ip: parts[0],
        port: parts[1],
        username: parts[2] || undefined,
        password: parts[3] || undefined,
      };
      const { data, error } = await supabase.functions.invoke("check-proxy", {
        body: { proxies: [proxyObj] },
      });
      if (error) throw error;
      const result = data?.results?.[0];
      if (result?.status === "live") {
        toast.success(`Proxy is LIVE${result.response_time ? ` (${result.response_time}ms)` : ""}`);
      } else {
        toast.error("Proxy is DEAD");
      }
    } catch {
      toast.error("Proxy check failed");
    } finally {
      setCheckingProxy(false);
    }
  };

  const handleDeleteAllSaved = async () => {
    if (!confirm("Are you sure you want to delete ALL saved URLs? This cannot be undone.")) return;
    setDeletingAll(true);
    try {
      const { error } = await supabase.from("gateway_urls").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      toast.success("All saved URLs deleted successfully");
      setUrls([]);
      setUrlInput("");
    } catch (err) {
      toast.error("Failed to delete saved URLs");
    } finally {
      setDeletingAll(false);
    }
  };

  const parseUrls = (text: string): string[] => {
    const urlRegex = /https?:\/\/[^\s,<>"')\]]+/gi;
    const matches = text.match(urlRegex) || [];
    const normalized = matches.map((u) => u.trim().replace(/\/+$/, ""));
    return [...new Set(normalized)];
  };

  const handleTextInput = (text: string) => {
    setUrlInput(text);
    setUrls(parseUrls(text));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt")) {
      toast.error("Only .txt files are supported");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setUrlInput(text);
      const parsed = parseUrls(text);
      setUrls(parsed);
      toast.success(`Loaded ${parsed.length} URLs from file`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLoadSaved = async () => {
    setLoadingSaved(true);
    try {
      const data = await fetchAllGatewayUrls("url");
      if (!data || data.length === 0) {
        toast.error("No saved sites found in database");
        return;
      }
      const savedUrls = data.map((r) => r.url);
      const text = savedUrls.join("\n");
      setUrlInput(text);
      setUrls(savedUrls);
      toast.success(`Loaded ${savedUrls.length} saved sites from database`);
    } catch (err) {
      toast.error("Failed to load saved sites");
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleExportSaved = async () => {
    try {
      const data = await fetchAllGatewayUrls("url, created_at, price");
      if (!data || data.length === 0) {
        toast.error("No saved sites to export");
        return;
      }
      const resultMap = new Map(results.map((r) => [r.url, r]));
      const lines = data.map((row) => {
        const scanResult = resultMap.get(row.url);
        const savedPrice = row.price ? `$${Number(row.price).toFixed(2)}` : "--";
        if (scanResult) {
          return `${row.url} | ${scanResult.priceStr} | ${scanResult.status.toUpperCase()}${scanResult.apiResponse ? ` | ${scanResult.apiResponse.replace(/\n/g, " ")}` : ""}`;
        }
        return `${row.url} | ${savedPrice} | SAVED`;
      });
      const header = `# Saved Sites Export - ${new Date().toISOString()}\n# Total: ${data.length}\n# Format: URL | Price | Status | API Response\n\n`;
      const content = header + lines.join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saved-sites-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.length} saved sites`);
    } catch (err) {
      toast.error("Failed to export saved sites");
    }
  };

  const handleStop = () => {
    stopRef.current = true;
    setIsStopped(true);
  };

  const checkSingleUrl = async (
    siteUrl: string,
    proxyOverride?: string,
    maxRetries = BOOT_RETRY_LIMIT,
    proxyIdOverride?: string,
  ): Promise<SiteResult> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const body: Record<string, string> = { url: siteUrl };
        if (proxyOverride) body.proxy = proxyOverride;
        if (proxyIdOverride) body.proxyId = proxyIdOverride;

        const { data, error } = await supabase.functions.invoke("health-check-sites", {
          body,
        });

        if (error) {
          const isBootError = error.message?.includes("503") || error.message?.includes("BOOT_ERROR");
          if (isBootError && attempt < maxRetries - 1) {
            const delay = BOOT_RETRY_BASE_DELAY_MS * (attempt + 1) + Math.random() * 600;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: error.message };
        }

        // If proxy was detected as dead, notify and refresh proxy list
        if (data.proxyDead) {
          toast.error(`Dead proxy removed: ${proxyOverride?.split(':').slice(0, 2).join(':') || 'system proxy'}`);
          // Refresh system proxies list
          const { data: freshProxies } = await supabase.from("proxies").select("*").eq("status", "live");
          if (freshProxies) setSystemProxies(freshProxies);
        }

        return {
          url: data.url || siteUrl,
          status: data.status === "live" ? "live" : data.status === "dead" ? "dead" : "error",
          price: Number(data.price) || 0,
          priceStr: data.priceStr || "$0.00",
          apiResponse: data.apiResponse || "",
          error: data.error,
        };
      } catch (e: any) {
        if (attempt < maxRetries - 1) {
          const delay = BOOT_RETRY_BASE_DELAY_MS * (attempt + 1) + Math.random() * 600;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: e?.message || "Request failed" };
      }
    }

    return { url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: "All retries exhausted" };
  };

  const handleStart = useCallback(async () => {
    if (urls.length === 0) {
      toast.error("No valid URLs to check");
      return;
    }

    setIsRunning(true);
    setIsStopped(false);
    stopRef.current = false;
    setResults([]);
    setProgress(0);
    setExpandedIdx(null);

    const uniqueUrls = [...new Set(urls.map((u) => u.replace(/\/+$/, "")))];
    const skipped = urls.length - uniqueUrls.length;
    if (skipped > 0) {
      toast.info(`Skipped ${skipped} duplicate URL${skipped > 1 ? "s" : ""}`);
    }

    const { proxy: proxyOverride, proxyId: proxyIdOverride } = getProxyInfo();
    const total = uniqueUrls.length;
    let completed = 0;
    let liveCount = 0;
    let deadCount = 0;
    let errorCount = 0;
    const remainingSet = new Set(uniqueUrls);

    setStats({ total, live: 0, dead: 0, errors: 0 });

    const pendingResults: SiteResult[] = [];
    let rafScheduled = false;

    const flushResults = () => {
      rafScheduled = false;
      if (pendingResults.length === 0) return;
      const batch = pendingResults.splice(0);
      setResults((prev) => [...prev, ...batch]);
    };

    const processResult = (result: SiteResult) => {
      completed++;
      if (result.status === "live") liveCount++;
      else if (result.status === "dead") deadCount++;
      else errorCount++;

      remainingSet.delete(result.url);
      pendingResults.push(result);

      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushResults);
      }

      setProgress(Math.round((completed / total) * 100));
      setStats({ total, live: liveCount, dead: deadCount, errors: errorCount });

      if (completed % 25 === 0 || completed === total) {
        const remainingUrls = Array.from(remainingSet);
        setUrls(remainingUrls);
        setUrlInput(remainingUrls.join("\n"));
      }
    };

    let nextUrlIndex = 0;

    if (!stopRef.current && uniqueUrls.length > 0) {
      const warmupResult = await checkSingleUrl(uniqueUrls[0], proxyOverride, BOOT_RETRY_LIMIT);
      if (!stopRef.current) {
        processResult(warmupResult);
        nextUrlIndex = 1;
        if (uniqueUrls.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, WARMUP_DELAY_MS));
        }
      }
    }

    const workerCount = Math.min(CONCURRENCY, Math.max(uniqueUrls.length - nextUrlIndex, 0));
    console.log(`[Workers] Starting ${workerCount} workers for ${Math.max(uniqueUrls.length - nextUrlIndex, 0)} remaining URLs`);

    const workers = Array.from({ length: workerCount }, (_, workerIndex) =>
      (async () => {
        if (workerIndex > 0) {
          await new Promise((resolve) => setTimeout(resolve, workerIndex * WORKER_STAGGER_MS));
        }

        while (!stopRef.current) {
          if (nextUrlIndex >= uniqueUrls.length) break;
          const siteUrl = uniqueUrls[nextUrlIndex++];
          const result = await checkSingleUrl(siteUrl, proxyOverride);
          if (!stopRef.current) {
            processResult(result);
          }
        }
      })(),
    );

    await Promise.all(workers);

    flushResults();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const finalRemaining = Array.from(remainingSet);
    setUrls(finalRemaining);
    setUrlInput(finalRemaining.join("\n"));

    setProgress(stopRef.current ? Math.round((completed / total) * 100) : 100);
    setIsRunning(false);

    if (stopRef.current) {
      toast.info(`Health check stopped after ${completed}/${total} sites.`);
      return;
    }

    toast.success(`Health check complete! ${liveCount} live sites saved.`);
  }, [urls]);

  const handleRecheckErrors = useCallback(() => {
    const errorUrls = results.filter((r) => r.status === "error").map((r) => r.url);
    if (errorUrls.length === 0) {
      toast.error("No error sites to recheck");
      return;
    }
    setResults((prev) => prev.filter((r) => r.status !== "error"));
    setStats((prev) => ({ ...prev, errors: 0, total: prev.total }));
    const text = errorUrls.join("\n");
    setUrlInput(text);
    setUrls(errorUrls);
    setTimeout(() => {
      handleStart();
    }, 100);
  }, [results, handleStart]);

  return (
    <div className="space-y-6">
      {/* Proxy Configuration */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Proxy Configuration
          </CardTitle>
          <CardDescription>
            Configure which proxy to use for health checks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={proxyMode} onValueChange={(v) => setProxyMode(v as any)} disabled={isRunning}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random (Auto)</SelectItem>
                <SelectItem value="specific">Select Proxy</SelectItem>
                <SelectItem value="custom">Custom Proxy</SelectItem>
              </SelectContent>
            </Select>

            {proxyMode === "random" && (
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="h-3 w-3" />
                {systemProxies.filter(p => p.status === "live").length} live proxies in pool
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={loadProxies}
              disabled={loadingProxies}
              title="Refresh proxies"
            >
              {loadingProxies ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {proxyMode === "specific" && (
            <div className="flex items-center gap-3">
              <Select value={selectedProxyId} onValueChange={setSelectedProxyId} disabled={isRunning}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a proxy..." />
                </SelectTrigger>
                <SelectContent>
                  {systemProxies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="font-mono text-xs">
                        {p.ip}:{p.port}
                        {p.username ? ` (${p.username})` : ""}
                      </span>
                      <Badge variant={p.status === "live" ? "default" : "destructive"} className="ml-2 text-[10px] px-1 py-0">
                        {p.status}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckProxy}
                disabled={!selectedProxyId || checkingProxy || isRunning}
                className="gap-1"
              >
                {checkingProxy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Test
              </Button>
            </div>
          )}

          {proxyMode === "custom" && (
            <div className="flex items-center gap-3">
              <Input
                placeholder="ip:port:username:password"
                value={customProxy}
                onChange={(e) => setCustomProxy(e.target.value)}
                className="flex-1 font-mono text-xs"
                disabled={isRunning}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckProxy}
                disabled={!customProxy.trim() || checkingProxy || isRunning}
                className="gap-1"
              >
                {checkingProxy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                Test
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload & Config */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Site Health Checker
          </CardTitle>
          <CardDescription>
            Upload a .txt file, paste URLs, or load saved sites. Runs {CONCURRENCY} concurrent checks — live sites are saved to DB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload .txt
            </Button>
            <Button
              variant="outline"
              onClick={handleExportSaved}
              disabled={isRunning}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export Saved
            </Button>
            <Button
              variant="outline"
              onClick={handleLoadSaved}
              disabled={isRunning || loadingSaved}
              className="gap-2"
            >
              {loadingSaved ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Load Saved Sites
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllSaved}
              disabled={isRunning || deletingAll}
              className="gap-2"
            >
              {deletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Delete All Saved
            </Button>
          </div>

          {/* URL Input */}
          <div className="relative">
            <Textarea
              placeholder={"Paste URLs or mixed text here — URLs will be auto-extracted:\nhttps://example.com\nSome text https://shop.example.com more text"}
              value={urlInput}
              onChange={(e) => handleTextInput(e.target.value)}
              className="min-h-[120px] font-mono text-xs pr-10"
              disabled={isRunning}
            />
            {urlInput && !isRunning && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => { setUrlInput(""); setUrls([]); }}
                title="Clear"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <FileText className="h-3 w-3" />
                {urls.length} URLs loaded
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                <Zap className="h-3 w-3" />
                {CONCURRENCY} threads
              </Badge>
            </div>
            <div className="flex gap-2">
              {isRunning ? (
                <Button variant="destructive" onClick={handleStop} className="gap-2">
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={urls.length === 0} className="gap-2">
                  <Play className="h-4 w-4" />
                  Start Health Check
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {(isRunning || results.length > 0) && (
        <Card className="border-border">
          <CardContent className="pt-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning ({stats.live + stats.dead + stats.errors}/{stats.total})...
                  </>
                ) : isStopped ? (
                  "Stopped"
                ) : (
                  "Complete"
                )}
              </span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />

            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">{stats.total}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg text-center">
                <p className="text-xs text-green-400 flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Live
                </p>
                <p className="text-lg font-bold text-green-400">{stats.live}</p>
              </div>
              <div className="p-3 bg-red-500/10 rounded-lg text-center">
                <p className="text-xs text-red-400 flex items-center justify-center gap-1">
                  <XCircle className="h-3 w-3" /> Dead
                </p>
                <p className="text-lg font-bold text-red-400">{stats.dead}</p>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                <p className="text-xs text-yellow-400 flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Errors
                </p>
                <p className="text-lg font-bold text-yellow-400">{stats.errors}</p>
                {!isRunning && stats.errors > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 gap-1 h-6 text-[10px] border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={handleRecheckErrors}
                  >
                    <Zap className="h-3 w-3" />
                    Recheck Error Sites
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Results ({results.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Filter className="h-3 w-3 text-muted-foreground" />
                  <Select value={exportFilter} onValueChange={(v) => setExportFilter(v as any)}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="dead">Dead</SelectItem>
                      <SelectItem value="error">Errors</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-7 text-xs"
                  onClick={() => {
                    const filtered = exportFilter === "all" ? results : results.filter((r) => r.status === exportFilter);
                    if (filtered.length === 0) {
                      toast.error("No results to export");
                      return;
                    }
                    const lines = filtered.map((r) => `${r.url} | ${r.priceStr} | ${r.status.toUpperCase()}${r.apiResponse ? ` | ${r.apiResponse.replace(/\n/g, " ")}` : ""}`);
                    const header = `# Health Check Export - ${new Date().toISOString()}\n# Filter: ${exportFilter} | Total: ${filtered.length}\n# Format: URL | Price | Status | API Response\n\n`;
                    const content = header + lines.join("\n");
                    const blob = new Blob([content], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `health-check-${exportFilter}-${Date.now()}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(`Exported ${filtered.length} results`);
                  }}
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] overflow-y-auto space-y-1">
              {results.map((r, idx) => (
                <Collapsible
                  key={`${r.url}-${idx}`}
                  open={expandedIdx === idx}
                  onOpenChange={(open) => setExpandedIdx(open ? idx : null)}
                >
                  <div
                    className={`rounded text-sm font-mono ${
                      r.status === "live"
                        ? "bg-green-500/5 border border-green-500/20"
                        : r.status === "dead"
                        ? "bg-red-500/5 border border-red-500/20"
                        : "bg-yellow-500/5 border border-yellow-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between p-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {r.status === "live" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                        ) : r.status === "dead" ? (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                        )}
                        <span className="truncate text-xs">{r.url}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-muted-foreground">{r.priceStr}</span>
                        <Badge
                          variant={r.status === "live" ? "default" : "destructive"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {r.status === "live" ? "SAVED" : r.status === "dead" ? "DEAD" : "ERR"}
                        </Badge>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <ChevronDown className={`h-3 w-3 transition-transform ${expandedIdx === idx ? "rotate-180" : ""}`} />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="px-2 pb-2 pt-0">
                        <div className="bg-background/80 rounded p-2 border border-border">
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
                            <Code className="h-3 w-3" /> API Response
                          </p>
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                            {r.apiResponse || r.error || "No response data"}
                          </pre>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminHealthCheck;
