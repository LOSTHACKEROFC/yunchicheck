import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, CreditCard } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Index = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-md flex items-center justify-center">
              <span className="text-primary-foreground font-bold">YC</span>
            </div>
            <span className="font-display text-xl font-bold text-primary">
              Yunchi Checker
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" className="text-foreground hover:text-primary">
                {t.pricing}
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" className="text-foreground hover:text-primary">
                {t.login}
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="btn-primary">
                {t.getStarted}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-display font-bold mb-6">
            {t.welcomeTo}{" "}
            <span className="text-primary">Yunchi Checker</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            {t.heroDescription}
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/auth">
              <Button size="lg" className="btn-primary">
                {t.startNow}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                {t.viewPricing}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">{t.fastProcessing}</h3>
            <p className="text-muted-foreground text-sm">
              {t.fastProcessingDesc}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">{t.securePlatform}</h3>
            <p className="text-muted-foreground text-sm">
              {t.securePlatformDesc}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">{t.multipleGateways}</h3>
            <p className="text-muted-foreground text-sm">
              {t.multipleGatewaysDesc}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          © 2024 Yunchi Checker. {t.allRightsReserved}
        </div>
      </footer>
    </div>
  );
};

export default Index;
