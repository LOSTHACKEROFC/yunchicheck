import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  X, 
  Medal, 
  Crown, 
  Gem, 
  Star,
  ArrowLeft,
  CreditCard
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FloatingCardsBackground from "@/components/FloatingCardsBackground";
import VolumeDiscountCalculator from "@/components/VolumeDiscountCalculator";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Pricing = () => {
  const { t } = useLanguage();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getCtaLink = (packageName: string) => isLoggedIn ? `/dashboard/buy?package=${packageName.toLowerCase()}` : "/auth";

  const plans = [
    {
      name: "Silver",
      credits: "1,500",
      price: "$100",
      pricePerCredit: "$0.067",
      description: "Great starter pack",
      icon: Medal,
      popular: false,
      checksCount: "1,500",
      features: [
        { text: "1,500 Credits", included: true },
        { text: "1,500 Card Checks", included: true },
        { text: t.allGateways || "All Gateways", included: true },
        { text: t.basicSupport || "Basic Support", included: true },
        { text: t.priorityQueue || "Priority Queue", included: false },
      ],
    },
    {
      name: "Gold",
      credits: "9,000",
      price: "$500",
      pricePerCredit: "$0.056",
      description: t.mostPopularChoice || "Most popular choice",
      icon: Crown,
      popular: true,
      checksCount: "9,000",
      savings: "22%",
      features: [
        { text: "9,000 Credits", included: true },
        { text: "9,000 Card Checks", included: true },
        { text: t.allGateways || "All Gateways", included: true },
        { text: t.prioritySupport || "Priority Support", included: true },
        { text: t.priorityQueue || "Priority Queue", included: true },
      ],
    },
    {
      name: "Diamond",
      credits: "45,000",
      price: "$2,000",
      pricePerCredit: "$0.044",
      description: t.forPowerUsers || "For power users",
      icon: Gem,
      popular: false,
      checksCount: "45,000",
      savings: "38%",
      features: [
        { text: "45,000 Credits", included: true },
        { text: "45,000 Card Checks", included: true },
        { text: t.allGateways || "All Gateways", included: true },
        { text: t.vipSupport || "VIP Support", included: true },
        { text: t.priorityQueue || "Priority Queue", included: true },
      ],
    },
    {
      name: "Elite",
      credits: "145,000",
      price: "$5,000",
      pricePerCredit: "$0.034",
      description: "Ultimate high-volume",
      icon: Star,
      popular: false,
      checksCount: "145,000",
      savings: "52%",
      features: [
        { text: "145,000 Credits", included: true },
        { text: "145,000 Card Checks", included: true },
        { text: t.allGateways || "All Gateways", included: true },
        { text: "Dedicated Support", included: true },
        { text: t.priorityQueue || "Priority Queue", included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <FloatingCardsBackground />
      
      {/* Header */}
      <header className="border-b border-border relative z-10">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm sm:text-base">YC</span>
            </div>
            <span className="font-display text-lg sm:text-xl font-bold text-primary">
              Yunchi Checker
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="text-foreground hover:text-primary">
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">{t.back}</span>
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="btn-primary">{t.getStarted}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-8 sm:py-12 md:py-16 relative z-10">
        <div className="text-center mb-8 sm:mb-12">
          <Badge className="bg-primary/20 text-primary border-primary/30 mb-3 sm:mb-4">
            <CreditCard className="h-3 w-3 mr-1" />
            {t.pricingPlans}
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-bold mb-3 sm:mb-4">
            {t.chooseYourPlan.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="text-primary">{t.chooseYourPlan.split(" ").slice(-1)}</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto px-2">
            {t.selectPerfectPlan}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`bg-card border-border relative transition-all hover:border-primary/50 ${
                plan.popular ? "border-primary shadow-glow sm:scale-105" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-2.5 sm:-top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    {t.mostPopular}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-3 sm:pb-4 pt-6">
                <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl mx-auto mb-3 sm:mb-4 flex items-center justify-center ${
                  plan.popular ? "bg-primary/20" : "bg-secondary"
                }`}>
                  <plan.icon className={`h-5 w-5 sm:h-7 sm:w-7 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <CardTitle className="text-lg sm:text-xl">{plan.name}</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="space-y-4 sm:space-y-6">
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-3xl sm:text-4xl font-bold text-primary">{plan.credits}</span>
                    <span className="text-muted-foreground text-sm">Credits</span>
                  </div>
                  <div className="text-xl sm:text-2xl font-semibold">{plan.price}</div>
                  <div className="text-xs text-muted-foreground">{plan.pricePerCredit}/credit</div>
                  {plan.savings && (
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                      Save {plan.savings}
                    </Badge>
                  )}
                </div>

                <ul className="space-y-2 sm:space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 sm:gap-3">
                      {feature.included ? (
                        <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                      )}
                      <span className={`text-xs sm:text-sm ${feature.included ? "text-foreground" : "text-muted-foreground"}`}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link to={getCtaLink(plan.name)}>
                  <Button
                    className={`w-full ${plan.popular ? "btn-primary" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                    size="sm"
                  >
                    {isLoggedIn ? "Buy Now" : t.getStarted}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="mt-12 sm:mt-16">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-2">
              Compare All Plans
            </h2>
            <p className="text-sm text-muted-foreground">
              See all features side-by-side
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.name} className={`text-center py-3 px-4 text-sm font-semibold ${plan.popular ? "text-primary" : "text-foreground"}`}>
                      <div className="flex flex-col items-center gap-1">
                        <plan.icon className={`h-4 w-4 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                        {plan.name}
                        {plan.popular && (
                          <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">Popular</Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Price</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-3 px-4 text-sm font-semibold text-primary">{plan.price}</td>
                  ))}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Credits</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-3 px-4 text-sm text-foreground">{plan.credits}</td>
                  ))}
                </tr>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Price per Credit</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-3 px-4 text-sm text-muted-foreground">{plan.pricePerCredit}</td>
                  ))}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Savings</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-3 px-4 text-sm">
                      {plan.savings ? (
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">{plan.savings}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">All Gateways</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-3 px-4">
                      <Check className="h-4 w-4 text-green-500 mx-auto" />
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Priority Queue</td>
                  {plans.map((plan, idx) => (
                    <td key={plan.name} className="text-center py-3 px-4">
                      {idx > 0 ? (
                        <Check className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <td className="py-3 px-4 text-sm font-medium text-foreground">Support Level</td>
                  {plans.map((plan, idx) => (
                    <td key={plan.name} className="text-center py-3 px-4 text-sm text-foreground">
                      {idx === 0 ? "Basic" : idx === 1 ? "Priority" : idx === 2 ? "VIP" : "Dedicated"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4"></td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-4 px-4">
                      <Link to={getCtaLink(plan.name)}>
                        <Button
                          size="sm"
                          variant={plan.popular ? "default" : "outline"}
                          className={plan.popular ? "btn-primary" : ""}
                        >
                          {isLoggedIn ? "Buy" : "Select"}
                        </Button>
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Volume Discount Calculator */}
        <div className="mt-12 sm:mt-16">
          <VolumeDiscountCalculator />
        </div>

        {/* FAQ / Note */}
        <div className="text-center mt-10 sm:mt-16">
          <p className="text-muted-foreground text-xs sm:text-sm">
            {t.securePayment}
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm mt-2">
            {t.needCustomPlan}{" "}
            <Link to="/dashboard/support" className="text-primary hover:underline">
              {t.contactSupport}
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 sm:py-8 mt-auto relative z-10">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-xs sm:text-sm">
          © 2024 Yunchi Checker. {t.allRightsReserved}
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
