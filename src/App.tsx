import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DeviceBlockProvider, useDeviceBlock } from "@/contexts/DeviceBlockContext";
import { useDeviceLogger } from "@/hooks/useDeviceLogger";
import { lazy, Suspense } from "react";
import DeviceBlocked from "./pages/DeviceBlocked";

const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Profile = lazy(() => import("./pages/dashboard/Profile"));
const Balance = lazy(() => import("./pages/dashboard/Balance"));
const Gateways = lazy(() => import("./pages/dashboard/Gateways"));
const Topup = lazy(() => import("./pages/dashboard/Topup"));
const Support = lazy(() => import("./pages/dashboard/Support"));
const AdminTopups = lazy(() => import("./pages/dashboard/AdminTopups"));
const AdminBlockedDevices = lazy(() => import("./pages/dashboard/AdminBlockedDevices"));
const AdminPanel = lazy(() => import("./pages/dashboard/AdminPanel"));
const TopupUser = lazy(() => import("./pages/dashboard/TopupUser"));
const CreditUsage = lazy(() => import("./pages/dashboard/CreditUsage"));
const BuyCredits = lazy(() => import("./pages/dashboard/BuyCredits"));
const ImportUrls = lazy(() => import("./pages/dashboard/ImportUrls"));
const BannedAccount = lazy(() => import("./pages/BannedAccount"));
const VerifyDeactivation = lazy(() => import("./pages/VerifyDeactivation"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Component that handles device logging and blocking
function AppContent() {
  const { isBlocked } = useDeviceBlock();
  
  // Log device on login
  useDeviceLogger();

  // Show blocked page if device is blocked
  if (isBlocked) {
    return <DeviceBlocked />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
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
          <Route path="admin/panel" element={<AdminPanel />} />
          <Route path="topupuser" element={<TopupUser />} />
          <Route path="import-urls" element={<ImportUrls />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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
