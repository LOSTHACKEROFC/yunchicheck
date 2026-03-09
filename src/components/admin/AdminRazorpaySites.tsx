import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Play,
  Square,
  Zap,
  XCircle,
  ChevronDown,
  Code,
  Upload,
  Database,
} from "lucide-react";

interface RazorpaySite {
  id: string;
  url: string;
  created_at: string;
}

interface CheckResult {
  url: string;
  status: "live" | "dead" | "error";
  message: string;
  rawResponse: string;
}

const RAZORPAY_PREFIX = "https://razorpay.me/";
const BATCH_SIZE = 20;

const AdminRazorpaySites = () => {
  const [sites, setSites] = useState<RazorpaySite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // Health check state
  const [checkInput, setCheckInput] = useState("");
  const [checkUrls, setCheckUrls] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checkStats, setCheckStats] = useState({ total: 0, live: 0, dead: 0, errors: 0 });
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSites();

    // Realtime subscription for gateway_urls changes
    const channel = supabase
      .channel('razorpay-sites-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gateway_urls',
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;

          setSites((prev) => {
            if (eventType === 'INSERT') {
              const row = newRow as RazorpaySite;
              if (!row.url?.startsWith(RAZORPAY_PREFIX)) return prev;
              if (prev.some((s) => s.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (eventType === 'DELETE') {
              const row = oldRow as RazorpaySite;
              return prev.filter((s) => s.id !== row.id);
            }
            if (eventType === 'UPDATE') {
              const row = newRow as RazorpaySite;
              if (!row.url?.startsWith(RAZORPAY_PREFIX)) {
                return prev.filter((s) => s.id !== row.id);
              }
              return prev.map((s) => (s.id === row.id ? row : s));
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSites = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gateway_urls")
      .select("id, url, created_at")
      .like("url", "https://razorpay.me/%")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch Razorpay sites");
      console.error(error);
    } else {
      setSites(data || []);
    }
    setLoading(false);
  };

  const validateUrl = (url: string): string | null => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith(RAZORPAY_PREFIX)) return null;
    if (trimmed.length <= RAZORPAY_PREFIX.length) return null;
    return trimmed;
  };

  const addSingleSite = async () => {
    const validated = validateUrl(newUrl);
    if (!validated) {
      toast.error(`URL must start with ${RAZORPAY_PREFIX} and include a username`);
      return;
    }

    if (sites.some((s) => s.url === validated)) {
      toast.error("This site already exists");
      return;
    }

    setAdding(true);
    const { error } = await supabase
      .from("gateway_urls")
      .upsert({ url: validated, price: 0 }, { onConflict: "url" });

    if (error) {
      toast.error("Failed to add site");
      console.error(error);
    } else {
      toast.success("Site added successfully");
      setNewUrl("");
      await fetchSites();
    }
    setAdding(false);
  };

  const addBulkSites = async () => {
    const lines = bulkUrls.split("\n").map((l) => l.trim()).filter(Boolean);
    const validUrls: string[] = [];
    const invalidUrls: string[] = [];

    for (const line of lines) {
      const validated = validateUrl(line);
      if (validated) {
        validUrls.push(validated);
      } else {
        invalidUrls.push(line);
      }
    }

    if (validUrls.length === 0) {
      toast.error("No valid Razorpay URLs found");
      return;
    }

    setAdding(true);
    const rows = validUrls.map((url) => ({ url, price: 0 }));

    let addedCount = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("gateway_urls")
        .upsert(chunk, { onConflict: "url" });

      if (error) {
        console.error("Bulk insert error:", error);
        toast.error(`Error inserting batch ${Math.floor(i / 500) + 1}`);
      } else {
        addedCount += chunk.length;
      }
    }

    toast.success(`Added ${addedCount} sites${invalidUrls.length > 0 ? `, skipped ${invalidUrls.length} invalid` : ""}`);
    setBulkUrls("");
    await fetchSites();
    setAdding(false);
  };

  const deleteSite = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("gateway_urls").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete site");
      console.error(error);
    } else {
      setSites((prev) => prev.filter((s) => s.id !== id));
      toast.success("Site removed");
    }
    setDeleting(null);
  };

  const clearAllSites = async () => {
    if (!confirm(`Are you sure you want to remove all ${sites.length} Razorpay sites?`)) return;

    setLoading(true);
    const ids = sites.map((s) => s.id);

    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await supabase.from("gateway_urls").delete().in("id", chunk);
    }

    toast.success("All Razorpay sites cleared");
    await fetchSites();
  };

  // ── Health Check Logic ──

  const parseCheckUrls = (text: string): string[] => {
    const urlRegex = /https?:\/\/razorpay\.me\/[^\s,<>"')\]]+/gi;
    const matches = text.match(urlRegex) || [];
    const normalized = matches.map((u) => u.trim().replace(/\/+$/, ""));
    return [...new Set(normalized)];
  };

  const handleCheckInput = (text: string) => {
    setCheckInput(text);
    setCheckUrls(parseCheckUrls(text));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCheckInput(text);
      const parsed = parseCheckUrls(text);
      setCheckUrls(parsed);
      toast.success(`Loaded ${parsed.length} Razorpay URLs from file`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLoadSavedForCheck = () => {
    if (sites.length === 0) {
      toast.error("No saved Razorpay sites to load");
      return;
    }
    const text = sites.map((s) => s.url).join("\n");
    setCheckInput(text);
    setCheckUrls(sites.map((s) => s.url));
    toast.success(`Loaded ${sites.length} saved Razorpay sites`);
  };

  const invokeWithRetry = async (batchUrls: string[], maxRetries = 3): Promise<{ data: any; error: any }> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("razorpay-health-check", {
          body: { urls: batchUrls },
        });
        if (error && (error.message?.includes("503") || error.message?.includes("BOOT_ERROR"))) {
          const backoff = 2000 * (attempt + 1);
          console.log(`[Retry ${attempt + 1}/${maxRetries}] waiting ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        return { data, error };
      } catch (e: any) {
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        return { data: null, error: e };
      }
    }
    return { data: null, error: new Error("All retries exhausted") };
  };

  const handleStartCheck = useCallback(async () => {
    if (checkUrls.length === 0) {
      toast.error("No valid Razorpay URLs to check");
      return;
    }

    setIsChecking(true);
    setIsStopped(false);
    stopRef.current = false;
    setCheckResults([]);
    setCheckProgress(0);
    setExpandedIdx(null);

    const uniqueUrls = [...new Set(checkUrls)];
    const total = uniqueUrls.length;
    let completed = 0;
    let liveCount = 0;
    let deadCount = 0;
    let errorCount = 0;
    setCheckStats({ total, live: 0, dead: 0, errors: 0 });

    const remainingSet = new Set(uniqueUrls);

    const processResult = (result: CheckResult) => {
      completed++;
      if (result.status === "live") liveCount++;
      else if (result.status === "dead") deadCount++;
      else errorCount++;

      remainingSet.delete(result.url);
      const remaining = Array.from(remainingSet);
      setCheckUrls(remaining);
      setCheckInput(remaining.join("\n"));

      setCheckResults((prev) => [...prev, result]);
      setCheckProgress(Math.round((completed / total) * 100));
      setCheckStats({ total, live: liveCount, dead: deadCount, errors: errorCount });
    };

    for (let batchStart = 0; batchStart < uniqueUrls.length && !stopRef.current; batchStart += BATCH_SIZE) {
      const batch = uniqueUrls.slice(batchStart, batchStart + BATCH_SIZE);

      try {
        const { data, error } = await invokeWithRetry(batch);

        if (error || !data?.results) {
          for (const url of batch) {
            processResult({ url, status: "error", message: error?.message || "Batch failed", rawResponse: "" });
          }
        } else {
          const returnedResults: CheckResult[] = data.results;
          const returnedUrls = new Set(returnedResults.map((r) => r.url));

          for (const result of returnedResults) {
            processResult(result);
          }
          for (const url of batch) {
            if (!returnedUrls.has(url)) {
              processResult({ url, status: "error", message: "No response", rawResponse: "" });
            }
          }
        }
      } catch (e: any) {
        for (const url of batch) {
          processResult({ url, status: "error", message: e?.message || "Request failed", rawResponse: "" });
        }
      }
    }

    setCheckProgress(100);
    setIsChecking(false);
    await fetchSites();
    toast.success(`Check complete! ${liveCount} live, ${deadCount} dead, ${errorCount} errors`);
  }, [checkUrls]);

  const handleStopCheck = () => {
    stopRef.current = true;
    setIsStopped(true);
  };

  const handleRecheckErrors = useCallback(() => {
    const errorUrls = checkResults.filter((r) => r.status === "error").map((r) => r.url);
    if (errorUrls.length === 0) {
      toast.error("No error sites to recheck");
      return;
    }
    setCheckResults((prev) => prev.filter((r) => r.status !== "error"));
    setCheckStats((prev) => ({ ...prev, errors: 0 }));
    setCheckInput(errorUrls.join("\n"));
    setCheckUrls(errorUrls);
    setTimeout(() => handleStartCheck(), 100);
  }, [checkResults, handleStartCheck]);

  const filteredSites = sites.filter((s) =>
    s.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500/10 to-card border-indigo-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-indigo-400" />
              <div>
                <p className="text-xs text-muted-foreground">Total Sites</p>
                <p className="text-2xl font-bold text-indigo-400">{sites.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-card border-green-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <div>
                <p className="text-xs text-muted-foreground">Format</p>
                <p className="text-sm font-mono text-green-400">razorpay.me/*</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-card border-amber-500/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">Auto-Cleanup</p>
                <p className="text-sm text-amber-400">Dead sites removed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Health Checker */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Live Check Razorpay Sites
          </CardTitle>
          <CardDescription>
            Test sites against the RazorPay API with a demo card. Live sites are saved, dead sites are removed automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Actions */}
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
              disabled={isChecking}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload .txt
            </Button>
            <Button
              variant="outline"
              onClick={handleLoadSavedForCheck}
              disabled={isChecking || sites.length === 0}
              className="gap-2"
            >
              <Database className="h-4 w-4" />
              Load Saved ({sites.length})
            </Button>
          </div>

          {/* URL Input */}
          <Textarea
            placeholder={`Paste Razorpay URLs to check:\nhttps://razorpay.me/@user1\nhttps://razorpay.me/@user2`}
            value={checkInput}
            onChange={(e) => handleCheckInput(e.target.value)}
            className="min-h-[100px] font-mono text-xs"
            disabled={isChecking}
          />

          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="gap-1">
              <Globe className="h-3 w-3" />
              {checkUrls.length} URLs loaded
            </Badge>
            <div className="flex gap-2">
              {checkResults.some((r) => r.status === "error") && !isChecking && (
                <Button variant="outline" onClick={handleRecheckErrors} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Recheck Errors
                </Button>
              )}
              {isChecking ? (
                <Button variant="destructive" onClick={handleStopCheck} className="gap-2">
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button onClick={handleStartCheck} disabled={checkUrls.length === 0} className="gap-2">
                  <Play className="h-4 w-4" />
                  Start Live Check
                </Button>
              )}
            </div>
          </div>

          {/* Progress */}
          {(isChecking || checkResults.length > 0) && (
            <div className="space-y-4 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  {isChecking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : isStopped ? "Stopped" : "Complete"}
                </span>
                <span className="text-muted-foreground">{checkProgress}%</span>
              </div>
              <Progress value={checkProgress} />

              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold">{checkStats.total}</p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-lg text-center">
                  <p className="text-xs text-green-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Live
                  </p>
                  <p className="text-lg font-bold text-green-400">{checkStats.live}</p>
                </div>
                <div className="p-3 bg-red-500/10 rounded-lg text-center">
                  <p className="text-xs text-red-400 flex items-center justify-center gap-1">
                    <XCircle className="h-3 w-3" /> Dead
                  </p>
                  <p className="text-lg font-bold text-red-400">{checkStats.dead}</p>
                </div>
                <div className="p-3 bg-yellow-500/10 rounded-lg text-center">
                  <p className="text-xs text-yellow-400 flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Errors
                  </p>
                  <p className="text-lg font-bold text-yellow-400">{checkStats.errors}</p>
                </div>
              </div>

              {/* Results List */}
              {checkResults.length > 0 && (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {checkResults.map((result, idx) => (
                    <Collapsible key={idx} open={expandedIdx === idx} onOpenChange={() => setExpandedIdx(expandedIdx === idx ? null : idx)}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {result.status === "live" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                            ) : result.status === "dead" ? (
                              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                            )}
                            <span className="text-xs font-mono truncate">{result.url}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                result.status === "live"
                                  ? "border-green-500/50 text-green-400"
                                  : result.status === "dead"
                                  ? "border-red-500/50 text-red-400"
                                  : "border-yellow-500/50 text-yellow-400"
                              }`}
                            >
                              {result.status.toUpperCase()}
                            </Badge>
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 bg-muted/30 rounded-b-lg space-y-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Message: </span>
                            <span className="font-mono">{result.message}</span>
                          </div>
                          {result.rawResponse && (
                            <div>
                              <span className="text-muted-foreground flex items-center gap-1 mb-1">
                                <Code className="h-3 w-3" /> Raw Response:
                              </span>
                              <pre className="bg-background p-2 rounded text-xs overflow-x-auto max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all">
                                {result.rawResponse}
                              </pre>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Sites */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Razorpay Sites
          </CardTitle>
          <CardDescription>
            Only <code className="bg-muted px-1 rounded text-xs">https://razorpay.me/</code> URLs are accepted
          </CardDescription>
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant={mode === "single" ? "default" : "outline"}
              onClick={() => setMode("single")}
            >
              Single
            </Button>
            <Button
              size="sm"
              variant={mode === "bulk" ? "default" : "outline"}
              onClick={() => setMode("bulk")}
            >
              Bulk Import
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mode === "single" ? (
            <div className="flex gap-2">
              <Input
                placeholder="https://razorpay.me/@username"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSingleSite()}
              />
              <Button onClick={addSingleSite} disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                placeholder={`Paste URLs, one per line:\nhttps://razorpay.me/@user1\nhttps://razorpay.me/@user2`}
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                rows={6}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {bulkUrls.split("\n").filter((l) => l.trim()).length} lines
                </span>
                <Button onClick={addBulkSites} disabled={adding || !bulkUrls.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Import All
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Site List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Saved Sites ({sites.length})
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={fetchSites} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {sites.length > 0 && (
                <Button size="sm" variant="destructive" onClick={clearAllSites}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No sites match your search" : "No Razorpay sites added yet"}
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredSites.map((site) => (
                <div
                  key={site.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border hover:border-primary/30 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant="outline" className="shrink-0 text-xs border-indigo-500/50 text-indigo-400">
                      RP
                    </Badge>
                    <span className="text-sm font-mono truncate">{site.url}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => deleteSite(site.id)}
                      disabled={deleting === site.id}
                    >
                      {deleting === site.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRazorpaySites;
