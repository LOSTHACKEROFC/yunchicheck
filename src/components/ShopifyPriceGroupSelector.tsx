import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, ChevronLeft, ChevronRight, ShoppingBag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PriceGroup {
  label: string;
  min: number;
  max: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  count: number;
}

const PRICE_GROUPS: Omit<PriceGroup, "count">[] = [
  { label: "$0 – $10", min: 0, max: 10, color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: "💰" },
  { label: "$10 – $20", min: 10, max: 20, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30", icon: "💎" },
  { label: "$20 – $35", min: 20, max: 35, color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", icon: "🔥" },
  { label: "$35 – $100", min: 35, max: 100, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", icon: "⚡" },
];

interface ShopifyPriceGroupSelectorProps {
  onGroupSelect: (group: { min: number; max: number } | null) => void;
  selectedGroup: { min: number; max: number } | null;
}

const ShopifyPriceGroupSelector = ({ onGroupSelect, selectedGroup }: ShopifyPriceGroupSelectorProps) => {
  const [groups, setGroups] = useState<PriceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const fetchCounts = async () => {
    setLoading(true);

    // Fetch counts per price group in parallel using head:true count queries (no row limit)
    const results = await Promise.all(
      PRICE_GROUPS.map((g) => {
        let query = supabase
          .from("gateway_urls")
          .select("id", { count: "exact", head: true })
          .not("url", "like", "https://razorpay.me/%")
          .gte("price", g.min);

        if (g.max < 100) {
          query = query.lt("price", g.max);
        } else {
          query = query.lte("price", 100);
        }

        return query;
      })
    );

    const grouped = PRICE_GROUPS.map((g, i) => ({
      ...g,
      count: results[i].count || 0,
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchCounts();

    const channel = supabase
      .channel("price_group_counts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gateway_urls" },
        () => fetchCounts()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalSites = groups.reduce((a, g) => a + g.count, 0);

  // Carousel: show 2 groups at a time on mobile, all on desktop
  const maxIndex = Math.max(0, groups.length - 2);

  const handlePrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const handleNext = () => setCarouselIndex((i) => Math.min(maxIndex, i + 1));

  const isSelected = (g: PriceGroup) =>
    selectedGroup?.min === g.min && selectedGroup?.max === g.max;

  const handleSelect = (g: PriceGroup) => {
    if (g.count === 0) return;
    if (isSelected(g)) {
      onGroupSelect(null); // deselect = auto (any range)
    } else {
      onGroupSelect({ min: g.min, max: g.max });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
        <span className="text-xs text-muted-foreground">Loading price groups...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Site Price Range</span>
          <Badge variant="outline" className="text-[10px] h-5">
            {totalSites} sites
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {selectedGroup ? `${PRICE_GROUPS.find(g => g.min === selectedGroup.min)?.label}` : "Auto (Any)"}
        </span>
      </div>

      {/* Carousel */}
      <div className="relative flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handlePrev}
          disabled={carouselIndex === 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1 overflow-hidden">
          <div
            className="flex gap-2 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${carouselIndex * 50}%)` }}
          >
            {groups.map((group, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(group)}
                disabled={group.count === 0}
                className={cn(
                  "flex-shrink-0 w-[calc(50%-4px)] rounded-lg border p-3 transition-all duration-200 text-left",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  group.count === 0 && "opacity-40 cursor-not-allowed",
                  isSelected(group)
                    ? `${group.bgColor} ${group.borderColor} ring-1 ring-offset-1 ring-offset-background ${group.borderColor.replace('border-', 'ring-')}`
                    : "bg-muted/20 border-border/50 hover:bg-muted/40"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{group.icon}</span>
                  <span className={cn("text-sm font-bold", isSelected(group) ? group.color : "text-foreground")}>
                    {group.label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {group.count} {group.count === 1 ? "site" : "sites"}
                  </span>
                  {isSelected(group) && (
                    <Badge className="text-[9px] h-4 bg-primary/20 text-primary border-0">
                      Selected
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleNext}
          disabled={carouselIndex >= maxIndex}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: maxIndex + 1 }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCarouselIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === carouselIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        {selectedGroup
          ? "A random site from this price range will be used"
          : "A random site from any price range will be used"}
      </p>
    </div>
  );
};

export default ShopifyPriceGroupSelector;
