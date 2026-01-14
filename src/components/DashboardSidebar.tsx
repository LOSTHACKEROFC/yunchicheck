import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { 
  Home, 
  User, 
  Wallet, 
  CreditCard, 
  ArrowUpCircle, 
  HeadphonesIcon,
  LogOut 
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

const menuItems = [
  { titleKey: "home" as const, url: "/dashboard", icon: Home },
  { titleKey: "profile" as const, url: "/dashboard/profile", icon: User },
  { titleKey: "topup" as const, url: "/dashboard/topup", icon: ArrowUpCircle },
  { titleKey: "balanceAndHistory" as const, url: "/dashboard/balance", icon: Wallet },
  { titleKey: "gateways" as const, url: "/dashboard/gateways", icon: CreditCard },
  { titleKey: "contactSupport" as const, url: "/dashboard/support", icon: HeadphonesIcon },
];

const DashboardSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useSidebar();
  const { t } = useLanguage();
  const collapsed = state === "collapsed";

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"} collapsible="icon">
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">YC</span>
          </div>
          {!collapsed && (
            <span className="font-display font-bold text-primary">
              Yunchi Checker
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-secondary"
                      activeClassName="bg-primary/20 text-primary border-l-2 border-primary"
                    >
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{t[item.titleKey]}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md transition-colors hover:bg-destructive/20 text-destructive"
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>{t.logout}</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;
