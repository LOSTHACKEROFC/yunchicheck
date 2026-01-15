import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calculator, TrendingDown, Package, Check, Medal, Crown, Gem, Star } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface PackageType {
  name: string;
  credits: number;
  price: number;
  pricePerCredit: number;
  icon: LucideIcon;
}

const packages: PackageType[] = [
  { name: "Silver", credits: 1500, price: 100, pricePerCredit: 0.067, icon: Medal },
  { name: "Gold", credits: 9000, price: 500, pricePerCredit: 0.056, icon: Crown },
  { name: "Diamond", credits: 45000, price: 2000, pricePerCredit: 0.044, icon: Gem },
  { name: "Elite", credits: 145000, price: 5000, pricePerCredit: 0.034, icon: Star },
];

const VolumeDiscountCalculator = () => {
  const [desiredCredits, setDesiredCredits] = useState<number>(5000);

  const recommendation = useMemo(() => {
    if (!desiredCredits || desiredCredits <= 0) return null;

    // Calculate cost if buying at base rate ($0.10/credit)
    const basePrice = desiredCredits * 0.10;

    // Find optimal package combination
    const sortedPackages = [...packages].sort((a, b) => b.credits - a.credits);
    
    let remainingCredits = desiredCredits;
    let totalCost = 0;
    const selectedPackages: { name: string; count: number; credits: number; price: number; icon: LucideIcon }[] = [];

    for (const pkg of sortedPackages) {
      if (remainingCredits >= pkg.credits) {
        const count = Math.floor(remainingCredits / pkg.credits);
        selectedPackages.push({
          name: pkg.name,
          count,
          credits: pkg.credits * count,
          price: pkg.price * count,
          icon: pkg.icon,
        });
        totalCost += pkg.price * count;
        remainingCredits -= pkg.credits * count;
      }
    }

    // Handle remaining credits with smallest package if needed
    if (remainingCredits > 0) {
      const smallestPkg = packages[0];
      const neededPacks = Math.ceil(remainingCredits / smallestPkg.credits);
      const existing = selectedPackages.find(p => p.name === smallestPkg.name);
      if (existing) {
        existing.count += neededPacks;
        existing.credits += smallestPkg.credits * neededPacks;
        existing.price += smallestPkg.price * neededPacks;
      } else {
        selectedPackages.push({
          name: smallestPkg.name,
          count: neededPacks,
          credits: smallestPkg.credits * neededPacks,
          price: smallestPkg.price * neededPacks,
          icon: smallestPkg.icon,
        });
      }
      totalCost += smallestPkg.price * neededPacks;
    }

    const savings = basePrice - totalCost;
    const savingsPercent = ((savings / basePrice) * 100).toFixed(1);
    const effectiveRate = (totalCost / desiredCredits).toFixed(3);

    return {
      selectedPackages: selectedPackages.filter(p => p.count > 0),
      totalCost,
      totalCredits: selectedPackages.reduce((sum, p) => sum + p.credits, 0),
      savings,
      savingsPercent,
      effectiveRate,
      basePrice,
    };
  }, [desiredCredits]);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary/20 rounded-lg">
          <Calculator className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Volume Discount Calculator</h3>
          <p className="text-sm text-muted-foreground">See how much you can save with larger packages</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="credits" className="text-foreground">
            How many credits do you need?
          </Label>
          <Input
            id="credits"
            type="number"
            min={1}
            max={1000000}
            value={desiredCredits}
            onChange={(e) => setDesiredCredits(parseInt(e.target.value) || 0)}
            className="bg-background/50 border-border text-foreground"
            placeholder="Enter credit amount..."
          />
        </div>

        {recommendation && recommendation.savings > 0 && (
          <div className="space-y-4">
            {/* Savings highlight */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">
                  You save ${recommendation.savings.toFixed(2)} ({recommendation.savingsPercent}%)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Base price: ${recommendation.basePrice.toFixed(2)} → Optimized: ${recommendation.totalCost.toFixed(2)}
              </p>
            </div>

            {/* Package breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                Recommended Packages
              </h4>
              <div className="space-y-2">
                {recommendation.selectedPackages.map((pkg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-background/30 rounded-lg px-4 py-2 border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <pkg.icon className="h-4 w-4 text-primary" />
                      <span className="text-sm text-foreground">
                        {pkg.count}x {pkg.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({pkg.credits.toLocaleString()} credits)
                      </span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      ${pkg.price.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div>
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-lg font-semibold text-foreground">
                  {recommendation.totalCredits.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Effective Rate</p>
                <p className="text-lg font-semibold text-primary">
                  ${recommendation.effectiveRate}/credit
                </p>
              </div>
            </div>
          </div>
        )}

        {recommendation && recommendation.savings <= 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <p>Enter a larger amount to see volume discounts!</p>
            <p className="text-xs mt-1">Savings start at 1,500+ credits</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default VolumeDiscountCalculator;
