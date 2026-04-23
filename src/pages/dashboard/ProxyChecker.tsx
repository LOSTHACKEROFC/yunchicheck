import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ParsedProxy = {
  id: string;
  ip: string;
  port: string;
  username?: string;
  password?: string;
  raw: string;
};

type ProxyResult = ParsedProxy & {
  status: "live" | "dead";
  response_time?: number | null;
  country?: string | null;
  error?: string | null;
};

const sampleTargets = [
  { label: "Example Storefront", value: "https://example.com" },
  { label: "Demo Catalog", value: "https://demo-store.example" },
  { label: "Sample Checkout", value: "https://sample-shop.example" },
];

const defaultProxyText = "127.0.0.1:8080\n192.0.2.10:3128:user:pass";

const parseProxyLine = (line: string, index: number): ParsedProxy | null => {
  const parts = line.trim().split(":");
  if (parts.length !== 2 && parts.length !== 4) return null;

  const [ip, port, username, password] = parts;
  if (!ip || !port || !/^\d{2,5}$/.test(port)) return null;

  return {
    id: `${ip}:${port}:${index}`,
    ip,
    port,
    username,
    password,
    raw: line.trim(),
  };
};

const ProxyChecker = () => {
  const [proxyText, setProxyText] = useState(defaultProxyText);
  const [targetSite, setTargetSite] = useState(sampleTargets[0].value);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<ProxyResult[]>([]);

  const parsedProxies = useMemo(() => {
    return proxyText
      .split(/\r?\n/)
      .map((line, index) => parseProxyLine(line, index))
      .filter(Boolean) as ParsedProxy[];
  }, [proxyText]);

  const liveCount = results.filter((result) => result.status === "live").length;
  const deadCount = results.filter((result) => result.status === "dead").length;

  const runChecks = async () => {
    if (!parsedProxies.length) {
      toast.error("Add proxies in ip:port or ip:port:user:pass format");
      return;
    }

    setChecking(true);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("check-proxy", {
        body: { proxies: parsedProxies },
      });

      if (error || !data?.results) {
        throw new Error(error?.message || "Proxy check failed");
      }

      const checked = data.results.map((result: Partial<ProxyResult>, index: number) => ({
        ...parsedProxies[index],
        ...result,
        status: result.status === "live" ? "live" : "dead",
      })) as ProxyResult[];

      setResults(checked);
      toast.success(`Checked ${checked.length} proxies against ${sampleTargets.find((target) => target.value === targetSite)?.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to check proxies";
      toast.error(message);
      setResults(parsedProxies.map((proxy) => ({ ...proxy, status: "dead", error: message })));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="font-display text-2xl font-bold">Proxy Diagnostics</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Paste proxies, choose a sample target, and run live/dead connectivity checks for diagnostics.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="border-border bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Proxy input
            </CardTitle>
            <CardDescription>One proxy per line: ip:port or ip:port:user:pass.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-site">Sample target site</Label>
              <Select value={targetSite} onValueChange={setTargetSite}>
                <SelectTrigger id="target-site">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sampleTargets.map((target) => (
                    <SelectItem key={target.value} value={target.value}>{target.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proxy-list">Proxy list</Label>
              <Textarea
                id="proxy-list"
                value={proxyText}
                onChange={(event) => setProxyText(event.target.value)}
                className="min-h-56 font-mono text-sm"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runChecks} disabled={checking}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Run checks
              </Button>
              <Button variant="outline" onClick={() => setResults([])} disabled={checking || !results.length}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear results
              </Button>
              <span className="text-sm text-muted-foreground">Parsed: {parsedProxies.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>Run summary</CardTitle>
            <CardDescription>{sampleTargets.find((target) => target.value === targetSite)?.value}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Total checked</span>
              <Badge variant="secondary">{results.length}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Live</span>
              <Badge className="bg-primary text-primary-foreground">{liveCount}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm text-muted-foreground">Dead</span>
              <Badge variant="destructive">{deadCount}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Live/dead checks returned by the proxy diagnostics API.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proxy</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Country</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No results yet.
                  </TableCell>
                </TableRow>
              ) : results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="font-mono text-xs">{result.raw}</TableCell>
                  <TableCell>{sampleTargets.find((target) => target.value === targetSite)?.label}</TableCell>
                  <TableCell>
                    <Badge variant={result.status === "live" ? "secondary" : "destructive"} className="gap-1">
                      {result.status === "live" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {result.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{result.response_time ? `${result.response_time}ms` : "—"}</TableCell>
                  <TableCell>{result.country || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProxyChecker;