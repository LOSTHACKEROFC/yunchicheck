import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
} from "lucide-react";

interface SiteResult {
  url: string;
  status: "live" | "dead" | "error";
  price: number;
  priceStr: string;
  apiResponse?: string;
  error?: string;
}

const fetchAllGatewayUrls = async (fields: string) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("gateway_urls")
      .select(fields)
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
  const [threads, setThreads] = useState(5);
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
    // Normalize: trim, lowercase, remove trailing slashes for dedup
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

      // Check if we have scan results for these URLs
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

    const total = uniqueUrls.length;
    let completed = 0;
    let liveCount = 0;
    let deadCount = 0;
    let errorCount = 0;
    setStats({ total, live: 0, dead: 0, errors: 0 });

    const remainingSet = new Set(uniqueUrls);

    const invokeWithRetry = async (siteUrl: string, maxRetries = 3): Promise<{ data: any; error: any }> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke("health-check-sites", {
            body: { urls: [siteUrl], threads: 1 },
          });
          if (error && (error.message?.includes("503") || error.message?.includes("BOOT_ERROR"))) {
            const backoff = 2000 * (attempt + 1);
            console.log(`[Retry ${attempt + 1}/${maxRetries}] ${siteUrl} - waiting ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          return { data, error };
        } catch (e: any) {
          if (attempt < maxRetries - 1) {
            const backoff = 2000 * (attempt + 1);
            console.log(`[Retry ${attempt + 1}/${maxRetries}] ${siteUrl} - ${e?.message} - waiting ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          return { data: null, error: e };
        }
      }
      return { data: null, error: new Error("All retries exhausted") };
    };

    const BATCH_SIZE = 50;

    const processResult = (result: SiteResult) => {
      completed++;
      if (result.status === "live") liveCount++;
      else if (result.status === "dead") deadCount++;
      else errorCount++;

      remainingSet.delete(result.url);
      const remainingUrls = Array.from(remainingSet);
      setUrls(remainingUrls);
      setUrlInput(remainingUrls.join("\n"));

      setResults((prev) => [...prev, result]);
      setProgress(Math.round((completed / total) * 100));
      setStats({ total, live: liveCount, dead: deadCount, errors: errorCount });
    };

    for (let batchStart = 0; batchStart < uniqueUrls.length && !stopRef.current; batchStart += BATCH_SIZE) {
      const batch = uniqueUrls.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(uniqueUrls.length / BATCH_SIZE);

      console.log(`[Batch ${batchNum}/${totalBatches}] Sending ${batch.length} sites in one request...`);

      try {
        const { data, error } = await invokeWithRetry(batch[0], 3, batch);

        if (error || !data?.results) {
          // Mark all sites in batch as error
          for (const siteUrl of batch) {
            processResult({ url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: error?.message || "Batch request failed" });
          }
        } else {
          // Process each result from the batch response
          const returnedResults: SiteResult[] = data.results;
          const returnedUrls = new Set(returnedResults.map((r: SiteResult) => r.url));

          for (const result of returnedResults) {
            processResult(result);
          }

          // Mark any URLs not in the response as errors
          for (const siteUrl of batch) {
            if (!returnedUrls.has(siteUrl)) {
              processResult({ url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: "No response from server" });
            }
          }
        }
      } catch (e: any) {
        for (const siteUrl of batch) {
          processResult({ url: siteUrl, status: "error", price: 0, priceStr: "$0.00", error: e?.message || "Request failed" });
        }
      }

      console.log(`[Batch ${batchNum}/${totalBatches}] Complete`);
    }

    setProgress(100);
    setIsRunning(false);
    toast.success(`Health check complete! ${liveCount} live sites saved.`);
  }, [urls, threads]);

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
      {/* Upload & Config */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Site Health Checker
          </CardTitle>
          <CardDescription>
            Upload a .txt file, paste URLs, or load saved sites to check health. Live sites (price {">"} 0) are saved to the database.
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
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-muted-foreground">Threads:</span>
              <Select
                value={threads.toString()}
                onValueChange={(v) => setThreads(parseInt(v))}
                disabled={isRunning}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10, 15, 20, 25, 50].map((t) => (
                    <SelectItem key={t} value={t.toString()}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Badge variant="secondary" className="gap-1">
              <FileText className="h-3 w-3" />
              {urls.length} URLs loaded
            </Badge>
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
                    Scanning...
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
                  key={idx}
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
