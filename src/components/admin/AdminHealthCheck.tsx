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
  const stopRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseUrls = (text: string): string[] => {
    return text
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0 && (u.startsWith("http://") || u.startsWith("https://")));
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
      const { data, error } = await supabase
        .from("gateway_urls")
        .select("url")
        .order("created_at", { ascending: false });

      if (error) throw error;
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
    setStats({ total: urls.length, live: 0, dead: 0, errors: 0 });

    const batchSize = threads;
    let allResults: SiteResult[] = [];
    let liveCount = 0;
    let deadCount = 0;
    let errorCount = 0;

    for (let i = 0; i < urls.length; i += batchSize) {
      if (stopRef.current) break;

      const batch = urls.slice(i, i + batchSize);

      try {
        const { data, error } = await supabase.functions.invoke("health-check-sites", {
          body: { urls: batch, threads: batchSize },
        });

        if (error) {
          const batchErrors: SiteResult[] = batch.map((u) => ({
            url: u,
            status: "error" as const,
            price: 0,
            priceStr: "$0.00",
            apiResponse: "",
            error: "Request failed",
          }));
          allResults = [...allResults, ...batchErrors];
          errorCount += batch.length;
        } else if (data?.results) {
          allResults = [...allResults, ...data.results];
          liveCount += data.live || 0;
          deadCount += data.dead || 0;
          errorCount += data.errors || 0;
        }
      } catch (err) {
        const batchErrors: SiteResult[] = batch.map((u) => ({
          url: u,
          status: "error" as const,
          price: 0,
          priceStr: "$0.00",
          apiResponse: "",
          error: "Network error",
        }));
        allResults = [...allResults, ...batchErrors];
        errorCount += batch.length;
      }

      setResults([...allResults]);
      setProgress(Math.round(((i + batch.length) / urls.length) * 100));
      setStats({ total: urls.length, live: liveCount, dead: deadCount, errors: errorCount });
    }

    setProgress(100);
    setIsRunning(false);
    toast.success(`Health check complete! ${liveCount} live sites saved.`);
  }, [urls, threads]);

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
              onClick={handleLoadSaved}
              disabled={isRunning || loadingSaved}
              className="gap-2"
            >
              {loadingSaved ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Load Saved Sites
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
                  {[1, 2, 3, 5, 10, 15, 20].map((t) => (
                    <SelectItem key={t} value={t.toString()}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* URL Input */}
          <Textarea
            placeholder={"Paste URLs here (one per line):\nhttps://example.com\nhttps://shop.example.com"}
            value={urlInput}
            onChange={(e) => handleTextInput(e.target.value)}
            className="min-h-[120px] font-mono text-xs"
            disabled={isRunning}
          />

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
