import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface RazorpaySite {
  id: string;
  url: string;
  created_at: string;
}

const RAZORPAY_PREFIX = "https://razorpay.me/";

const AdminRazorpaySites = () => {
  const [sites, setSites] = useState<RazorpaySite[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");

  useEffect(() => {
    fetchSites();
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

    // Batch upsert in chunks of 500
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
