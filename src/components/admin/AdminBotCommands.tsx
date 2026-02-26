import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Shield, ShieldCheck, Users, Terminal } from "lucide-react";

interface CommandInfo {
  command: string;
  description: string;
  usage?: string;
}

const publicCommands: CommandInfo[] = [
  { command: "/start", description: "Start bot & get your Chat ID" },
  { command: "/menu", description: "Full navigation menu with buttons" },
  { command: "/help", description: "View help guide & all commands" },
  { command: "/mystatus", description: "Check your account status & credits" },
  { command: "/kill", description: "Kill a card (costs 5 credits)", usage: "/kill 4111111111111111|12|2025|123" },
];

const moderatorCommands: CommandInfo[] = [
  { command: "/admincmd", description: "Open moderator panel" },
  { command: "/ticket", description: "View & reply to support tickets", usage: "/ticket TK-XXXX" },
  { command: "/addfund", description: "Add credits to a user (no deductions)", usage: "/addfund user@email.com 50" },
  { command: "/stats", description: "View platform statistics" },
  { command: "/allusers", description: "Browse all users (paginated)" },
  { command: "/userinfo", description: "View detailed user info (read-only)", usage: "/userinfo username" },
  { command: "/viewbans", description: "View banned users list" },
];

const adminCommands: CommandInfo[] = [
  { command: "/admincmd", description: "Open admin control panel" },
  { command: "/ticket", description: "Manage support tickets", usage: "/ticket TK-XXXX" },
  { command: "/topups", description: "View pending topup requests" },
  { command: "/topup", description: "View user's pending topup", usage: "/topup user@email.com" },
  { command: "/rejectall", description: "Reject all pending topups" },
  { command: "/addfund", description: "Add or deduct credits", usage: "/addfund user@email.com 50" },
  { command: "/banuser", description: "Ban a user", usage: "/banuser username" },
  { command: "/unbanuser", description: "Unban a user", usage: "/unbanuser username" },
  { command: "/cancelban", description: "Cancel pending ban flow" },
  { command: "/deleteuser", description: "Delete a user account", usage: "/deleteuser username" },
  { command: "/deletealluser", description: "Delete all non-admin users" },
  { command: "/viewbans", description: "View all banned users" },
  { command: "/broadcast", description: "Send message to all users", usage: "/broadcast Hello everyone!" },
  { command: "/stats", description: "View platform statistics" },
  { command: "/cardstats", description: "Real-time card check statistics" },
  { command: "/allusers", description: "List all users (paginated)" },
  { command: "/userinfo", description: "Deep user analytics + actions", usage: "/userinfo username" },
  { command: "/allcards", description: "Export all checked cards" },
  { command: "/livecards", description: "Export live cards only" },
  { command: "/deadcards", description: "Export dead cards only" },
  { command: "/chargedcards", description: "Export charged cards" },
  { command: "/bincard", description: "Export cards by BIN", usage: "/bincard 411111" },
  { command: "/viewblocked", description: "View blocked devices/IPs" },
  { command: "/blockdevice", description: "Block a device or IP", usage: "/blockdevice ip 1.2.3.4" },
  { command: "/unblockdevice", description: "Unblock a device/IP", usage: "/unblockdevice [id]" },
  { command: "/userdevices", description: "View user's logged devices", usage: "/userdevices username" },
  { command: "/gate", description: "Set gateway online/offline" },
  { command: "/addgate", description: "Add a new gateway" },
  { command: "/editgate", description: "Edit gateway configuration", usage: "/editgate gateway_id" },
  { command: "/delgate", description: "Delete a gateway", usage: "/delgate gateway_id" },
  { command: "/healthsites", description: "Health check gateway sites" },
  { command: "/promote", description: "Promote user to moderator", usage: "/promote 123456789" },
  { command: "/demote", description: "Demote moderator to user", usage: "/demote 123456789" },
];

const superAdminCommands: CommandInfo[] = [
  { command: "/grantadmin", description: "Grant admin role", usage: "/grantadmin 123456789" },
  { command: "/revokeadmin", description: "Revoke admin role", usage: "/revokeadmin 123456789" },
  { command: "/admins", description: "List all admins & moderators" },
];

const CommandSection = ({
  title,
  icon,
  commands,
  badgeColor,
  badgeText,
}: {
  title: string;
  icon: React.ReactNode;
  commands: CommandInfo[];
  badgeColor: string;
  badgeText: string;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="font-semibold text-foreground">{title}</h3>
      <Badge className={badgeColor}>{badgeText}</Badge>
      <span className="text-xs text-muted-foreground ml-auto">{commands.length} commands</span>
    </div>
    <div className="grid gap-2">
      {commands.map((cmd) => (
        <div
          key={cmd.command + cmd.description}
          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50 hover:border-border transition-colors"
        >
          <code className="text-sm font-mono text-primary whitespace-nowrap">{cmd.command}</code>
          <span className="text-sm text-muted-foreground flex-1">{cmd.description}</span>
          {cmd.usage && (
            <code className="text-xs text-muted-foreground/70 bg-background/50 px-2 py-0.5 rounded font-mono">
              {cmd.usage}
            </code>
          )}
        </div>
      ))}
    </div>
  </div>
);

const AdminBotCommands = () => {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Bot Commands Reference
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete list of all Telegram bot commands by role. Commands appear in the bot's menu based on the user's assigned role.
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-8">
            <CommandSection
              title="Public Commands"
              icon={<Users className="h-4 w-4 text-blue-400" />}
              commands={publicCommands}
              badgeColor="bg-blue-500/20 text-blue-400 border-blue-500/30"
              badgeText="All Users"
            />

            <div className="border-t border-border" />

            <CommandSection
              title="Moderator Commands"
              icon={<ShieldCheck className="h-4 w-4 text-green-400" />}
              commands={moderatorCommands}
              badgeColor="bg-green-500/20 text-green-400 border-green-500/30"
              badgeText="Moderator"
            />

            <div className="border-t border-border" />

            <CommandSection
              title="Admin Commands"
              icon={<Shield className="h-4 w-4 text-yellow-400" />}
              commands={adminCommands}
              badgeColor="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
              badgeText="Admin"
            />

            <div className="border-t border-border" />

            <CommandSection
              title="Super Admin Commands"
              icon={<Terminal className="h-4 w-4 text-red-400" />}
              commands={superAdminCommands}
              badgeColor="bg-red-500/20 text-red-400 border-red-500/30"
              badgeText="Super Admin"
            />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default AdminBotCommands;
