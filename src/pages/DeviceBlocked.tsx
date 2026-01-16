import { ShieldX, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FloatingCardsBackground from "@/components/FloatingCardsBackground";

const DeviceBlocked = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <FloatingCardsBackground />
      
      <div className="w-full max-w-lg space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center">
            <ShieldX className="h-10 w-10 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Access Blocked</h1>
            <p className="text-muted-foreground mt-1">
              This device or network has been blocked
            </p>
          </div>
        </div>

        {/* Block Info Card */}
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-500 text-base">
              <AlertTriangle className="h-5 w-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This device or IP address has been permanently blocked due to a previous account violation.
            </p>
            
            <div className="bg-background/50 rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground">
                If you believe this is an error, please contact support at{" "}
                <a 
                  href="mailto:support@yunchicheck.com" 
                  className="text-primary hover:underline"
                >
                  support@yunchicheck.com
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Block ID: {crypto.randomUUID().slice(0, 8).toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DeviceBlocked;
