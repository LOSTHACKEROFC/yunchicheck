import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DeviceBlockProvider, useDeviceBlock } from "@/contexts/DeviceBlockContext";
import { useDeviceLogger } from "@/hooks/useDeviceLogger";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Pricing from "./pages/Pricing";
import Dashboard from "./pages/Dashboard";
import DashboardHome from "./pages/dashboard/DashboardHome";
import Profile from "./pages/dashboard/Profile";
import Balance from "./pages/dashboard/Balance";
import Gateways from "./pages/dashboard/Gateways";
import Topup from "./pages/dashboard/Topup";
import Support from "./pages/dashboard/Support";
import AdminTopups from "./pages/dashboard/AdminTopups";
import AdminBlockedDevices from "./pages/dashboard/AdminBlockedDevices";
import TopupUser from "./pages/dashboard/TopupUser";
import CreditUsage from "./pages/dashboard/CreditUsage";
import BuyCredits from "./pages/dashboard/BuyCredits";
import ImportUrls from "./pages/dashboard/ImportUrls";
import BannedAccount from "./pages/BannedAccount";
import DeviceBlocked from "./pages/DeviceBlocked";
import VerifyDeactivation from "./pages/VerifyDeactivation";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Component that handles device logging and blocking
function AppContent() {
  const { isBlocked, isChecking } = useDeviceBlock();
  
  // Log device on login
  useDeviceLogger();

  // Show loading while checking device block status
  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show blocked page if device is blocked
  if (isBlocked) {
    return <DeviceBlocked />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-deactivation" element={<VerifyDeactivation />} />
      <Route path="/banned" element={<BannedAccount />} />
      <Route path="/blocked" element={<DeviceBlocked />} />
      <Route path="/dashboard" element={<Dashboard />}>
        <Route index element={<DashboardHome />} />
        <Route path="profile" element={<Profile />} />
        <Route path="balance" element={<Balance />} />
        <Route path="gateways" element={<Gateways />} />
        <Route path="topup" element={<Topup />} />
        <Route path="buy" element={<BuyCredits />} />
        <Route path="usage" element={<CreditUsage />} />
        <Route path="support" element={<Support />} />
        <Route path="admin/topups" element={<AdminTopups />} />
        <Route path="admin/blocked" element={<AdminBlockedDevices />} />
        <Route path="topupuser" element={<TopupUser />} />
        <Route path="import-urls" element={<ImportUrls />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <DeviceBlockProvider>
            <AppContent />
          </DeviceBlockProvider>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
