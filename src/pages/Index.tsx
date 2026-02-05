import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap, CreditCard } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FloatingCardsBackground from "@/components/FloatingCardsBackground";
import yunchiLogo from "@/assets/yunchi-logo.png";

const Index = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background relative">
      <FloatingCardsBackground />
      
      {/* Header */}
      <header className="border-b border-border relative z-10">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <img 
                src={yunchiLogo} 
                alt="YunChi Checker" 
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover shadow-lg shadow-primary/30"
              />
              <div className="absolute inset-0 rounded-xl bg-primary/10 animate-pulse pointer-events-none" />
            </div>
            <span className="font-display text-lg sm:text-xl font-bold text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]">
              YunChi Checker
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/pricing">
              <Button variant="ghost" size="sm" className="text-foreground hover:text-primary hidden sm:inline-flex">
                {t.pricing}
              </Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-foreground hover:text-primary hidden sm:inline-flex">
                {t.login}
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="btn-primary text-sm sm:text-base px-3 sm:px-4">
                {t.getStarted}
                <ArrowRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-12 sm:py-16 md:py-20 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-4 sm:mb-6">
            {t.welcomeTo}{" "}
            <span className="text-primary">Yunchi Checker</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 px-2">
            {t.heroDescription}
          </p>
          <div className="flex gap-3 sm:gap-4 justify-center flex-wrap">
            <Link to="/auth">
              <Button size="default" className="btn-primary sm:text-base">
                {t.startNow}
                <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="default" variant="outline" className="border-primary text-primary hover:bg-primary/10 sm:text-base">
                {t.viewPricing}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-12 sm:py-16 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <h3 className="text-base sm:text-lg font-bold mb-2">{t.fastProcessing}</h3>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {t.fastProcessingDesc}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 text-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <h3 className="text-base sm:text-lg font-bold mb-2">{t.securePlatform}</h3>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {t.securePlatformDesc}
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 sm:p-6 text-center sm:col-span-2 md:col-span-1">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <h3 className="text-base sm:text-lg font-bold mb-2">{t.multipleGateways}</h3>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {t.multipleGatewaysDesc}
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 relative z-10">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          © 2024 Yunchi Checker. {t.allRightsReserved}
        </div>
      </footer>
    </div>
  );
};

export default Index;
