import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Terminal } from "lucide-react";

const SHOPIFY_API_URL = "https://web-production-9db0.up.railway.app/shopify";

// Sample data matching what /sh, /msh, /mtxt actually send
const DEFAULTS = {
  sh: {
    cc: "4242424242424242|12|2027|123",
    site: "https://shop.example.com",
  },
  msh: {
    cc: "4111111111111111|10|2026|321",
    site: "https://shop.example.com",
  },
  mtxt: {
    cc: "5555555555554444|01|2028|456",
    site: "https://shop.example.com",
  },
};

type TestKey = "sh" | "msh" | "mtxt";

interface TestResult {
  status: number | null;
  statusText: string;
  durationMs: number;
  url: string;
  body: string;
  ok: boolean;
}

const ApiTester = () => {
  const [inputs, setInputs] = useState(DEFAULTS);
  const [loading, setLoading] = useState<Record<TestKey, boolean>>({
    sh: false,
    msh: false,
    mtxt: false,
  });
  const [results, setResults] = useState<Record<TestKey, TestResult | null>>({
    sh: null,
    msh: null,
    mtxt: null,
  });

  const runTest = async (key: TestKey) => {
    setLoading((p) => ({ ...p, [key]: true }));
    const { cc, site } = inputs[key];
    const url = `${SHOPIFY_API_URL}?cc=${encodeURIComponent(cc)}&site=${encodeURIComponent(site)}`;
    const start = performance.now();

    try {
      const res = await fetch(url, { method: "GET" });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // not JSON, leave as-is
      }
      setResults((p) => ({
        ...p,
        [key]: {
          status: res.status,
          statusText: res.statusText,
          durationMs: Math.round(performance.now() - start),
          url,
          body: pretty,
          ok: res.ok,
        },
      }));
    } catch (err) {
      setResults((p) => ({
        ...p,
        [key]: {
          status: null,
          statusText: "Network Error",
          durationMs: Math.round(performance.now() - start),
          url,
          body: err instanceof Error ? err.message : String(err),
          ok: false,
        },
      }));
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const tests: { key: TestKey; title: string; description: string }[] = [
    { key: "sh", title: "Test /sh", description: "Single Shopify charge — same endpoint as bot /sh command" },
    { key: "msh", title: "Test /msh", description: "Mass Shopify checker — same endpoint as bot /msh command" },
    { key: "mtxt", title: "Test /mtxt", description: "Mass text bulk checker — same endpoint as bot /mtxt command" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Terminal className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shopify API Tester</h1>
          <p className="text-sm text-muted-foreground">
            Run live sample requests against <code className="text-primary">{SHOPIFY_API_URL}</code>
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {tests.map(({ key, title, description }) => {
          const result = results[key];
          const isLoading = loading[key];
          return (
            <Card key={key} className="border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-foreground">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </div>
                  <Button onClick={() => runTest(key)} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Run Test
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${key}-cc`}>Card (cc)</Label>
                    <Input
                      id={`${key}-cc`}
                      value={inputs[key].cc}
                      onChange={(e) =>
                        setInputs((p) => ({ ...p, [key]: { ...p[key], cc: e.target.value } }))
                      }
                      placeholder="number|mm|yyyy|cvv"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${key}-site`}>Site URL</Label>
                    <Input
                      id={`${key}-site`}
                      value={inputs[key].site}
                      onChange={(e) =>
                        setInputs((p) => ({ ...p, [key]: { ...p[key], site: e.target.value } }))
                      }
                      placeholder="https://shop.example.com"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                {result && (
                  <div className="space-y-3 pt-2 border-t border-border/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={result.ok ? "default" : "destructive"}>
                        {result.status ?? "ERR"} {result.statusText}
                      </Badge>
                      <Badge variant="secondary">{result.durationMs}ms</Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Request URL</Label>
                      <pre className="bg-muted/40 rounded p-2 text-xs overflow-x-auto break-all whitespace-pre-wrap">
                        {result.url}
                      </pre>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Response</Label>
                      <pre className="bg-muted/40 rounded p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">
                        {result.body || "(empty body)"}
                      </pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ApiTester;
