import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Database, ChevronDown, Globe, DollarSign, Loader2 } from "lucide-react";

interface SiteGroup {
  label: string;
  min: number;
  max: number;
  color: string;
  sites: { url: string; price: number }[];
}

const PRICE_GROUPS: Omit<SiteGroup, "sites">[] = [
  { label: "$0 – $10", min: 0, max: 10, color: "text-emerald-400" },
  { label: "$10 – $20", min: 10, max: 20, color: "text-blue-400" },
  { label: "$20 – $35", min: 20, max: 35, color: "text-amber-400" },
  { label: "$35 – $100", min: 35, max: 100, color: "text-red-400" },
];

const ShopifySiteGroups = () => {
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<number | null>(null);

  const fetchAllSites = async () => {
    const PAGE_SIZE = 1000;
    let allData: { url: string; price: number | null }[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("gateway_urls")
        .select("url, price")
        .gt("price", 0)
        .lte("price", 100)
        .not("url", "like", "https://razorpay.me/%")
        .order("price", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allData;
  };

  const fetchSites = async () => {
    setLoading(true);
    const data = await fetchAllSites();

    if (!data || data.length === 0) {
      setGroups(PRICE_GROUPS.map((g) => ({ ...g, sites: [] })));
      setLoading(false);
      return;
    }

    const grouped = PRICE_GROUPS.map((g) => ({
      ...g,
      sites: data.filter(
        (s) => {
          const p = Number(s.price ?? 0);
          if (p <= 0) return false;
          if (g.max >= 100) return p > g.min && p <= 100;
          return p > g.min && p <= g.max;
        }
      ).map((s) => ({ url: s.url, price: Number(s.price ?? 0) })),
    }));

    // For the first group ($0-$10), include price > 0 && price <= 10
    grouped[0].sites = data
      .filter((s) => { const p = Number(s.price ?? 0); return p > 0 && p <= 10; })
      .map((s) => ({ url: s.url, price: Number(s.price ?? 0) }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchSites();

    const channel = supabase
      .channel("gateway_urls_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gateway_urls" },
        () => fetchSites()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalSites = groups.reduce((a, g) => a + g.sites.length, 0);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Loading sites...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          Site Repository
          <Badge variant="outline" className="ml-auto text-[10px]">
            {totalSites} sites
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {groups.map((group, idx) => (
          <Collapsible
            key={idx}
            open={openGroup === idx}
            onOpenChange={() => setOpenGroup(openGroup === idx ? null : idx)}
          >
            <CollapsibleTrigger className="flex items-center w-full gap-2 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-xs">
              <DollarSign className={`h-3.5 w-3.5 ${group.color}`} />
              <span className="font-medium text-foreground">{group.label}</span>
              <Badge
                variant="secondary"
                className="ml-auto text-[10px] h-5 min-w-[28px] justify-center"
              >
                {group.sites.length}
              </Badge>
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                  openGroup === idx ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {group.sites.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-2 px-3">
                  No sites in this range
                </p>
              ) : (
                <ScrollArea className="max-h-[150px]">
                  <div className="space-y-1 py-1 px-1">
                    {group.sites.map((site, sIdx) => (
                      <div
                        key={sIdx}
                        className="flex items-center gap-2 px-2 py-1 rounded bg-background/50 text-[11px]"
                      >
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-mono truncate flex-1 text-foreground/80">
                          {site.url.replace(/^https?:\/\//, "")}
                        </span>
                        <span className={`font-semibold ${group.color}`}>
                          ${site.price.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
};

export default ShopifySiteGroups;
