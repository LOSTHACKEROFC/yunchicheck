import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  X, 
  Zap, 
  Crown, 
  Rocket, 
  ArrowLeft,
  CreditCard
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Pricing = () => {
  const { t } = useLanguage();

  const plans = [
    {
      name: t.starter,
      price: "$9.99",
      period: t.perMonth,
      description: t.perfectForBeginners,
      icon: Zap,
      popular: false,
      features: [
        { text: `100 ${t.checksPerDay}`, included: true },
        { text: t.twoGateways, included: true },
        { text: t.basicSupport, included: true },
        { text: t.apiAccess, included: false },
        { text: t.priorityQueue, included: false },
        { text: t.bulkChecking, included: false },
      ],
    },
    {
      name: t.professional,
      price: "$29.99",
      period: t.perMonth,
      description: t.mostPopularChoice,
      icon: Crown,
      popular: true,
      features: [
        { text: `500 ${t.checksPerDay}`, included: true },
        { text: t.allGateways, included: true },
        { text: t.prioritySupport, included: true },
        { text: t.apiAccess, included: true },
        { text: t.priorityQueue, included: true },
        { text: t.bulkChecking, included: false },
      ],
    },
    {
      name: t.enterprise,
      price: "$99.99",
      period: t.perMonth,
      description: t.forPowerUsers,
      icon: Rocket,
      popular: false,
      features: [
        { text: t.unlimitedChecks, included: true },
        { text: t.allGateways, included: true },
        { text: t.vipSupport, included: true },
        { text: t.fullApiAccess, included: true },
        { text: t.priorityQueue, included: true },
        { text: t.bulkChecking, included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold">YC</span>
            </div>
            <span className="font-display text-xl font-bold text-primary">
              Yunchi Checker
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" className="text-foreground hover:text-primary">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t.back}
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="btn-primary">{t.getStarted}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <Badge className="bg-primary/20 text-primary border-primary/30 mb-4">
            <CreditCard className="h-3 w-3 mr-1" />
            {t.pricingPlans}
          </Badge>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
            {t.chooseYourPlan.split(" ").slice(0, -1).join(" ")}{" "}
            <span className="text-primary">{t.chooseYourPlan.split(" ").slice(-1)}</span>
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {t.selectPerfectPlan}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`bg-card border-border relative transition-all hover:border-primary/50 ${
                plan.popular ? "border-primary shadow-glow scale-105" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    {t.mostPopular}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <div className={`w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center ${
                  plan.popular ? "bg-primary/20" : "bg-secondary"
                }`}>
                  <plan.icon className={`h-7 w-7 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="text-center">
                  <span className="text-4xl font-bold text-primary">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-green-500 shrink-0" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <span className={feature.included ? "text-foreground" : "text-muted-foreground"}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link to="/auth">
                  <Button
                    className={`w-full ${plan.popular ? "btn-primary" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {t.getStarted}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ / Note */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground text-sm">
            {t.securePayment}
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            {t.needCustomPlan}{" "}
            <Link to="/dashboard/support" className="text-primary hover:underline">
              {t.contactSupport}
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          © 2024 Yunchi Checker. {t.allRightsReserved}
        </div>
      </footer>
    </div>
  );
};

export default Pricing;
