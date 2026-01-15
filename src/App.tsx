import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
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
import CreditUsage from "./pages/dashboard/CreditUsage";
import BuyCredits from "./pages/dashboard/BuyCredits";
import BannedAccount from "./pages/BannedAccount";
import VerifyDeactivation from "./pages/VerifyDeactivation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-deactivation" element={<VerifyDeactivation />} />
            <Route path="/banned" element={<BannedAccount />} />
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
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
