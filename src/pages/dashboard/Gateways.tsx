import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap,
  DollarSign,
  Activity
} from "lucide-react";

const gateways = [
  { 
    name: "Stripe", 
    status: "online", 
    type: "CC/Debit",
    price: "$0.50",
    speed: "Fast",
    successRate: "98%",
    checks: "125K"
  },
  { 
    name: "Braintree", 
    status: "online", 
    type: "CC/PayPal",
    price: "$0.45",
    speed: "Fast",
    successRate: "96%",
    checks: "89K"
  },
  { 
    name: "Square", 
    status: "maintenance", 
    type: "CC",
    price: "$0.40",
    speed: "Medium",
    successRate: "94%",
    checks: "45K"
  },
  { 
    name: "Adyen", 
    status: "online", 
    type: "CC/APM",
    price: "$0.55",
    speed: "Fast",
    successRate: "97%",
    checks: "78K"
  },
  { 
    name: "Checkout.com", 
    status: "online", 
    type: "CC",
    price: "$0.50",
    speed: "Fast",
    successRate: "95%",
    checks: "62K"
  },
  { 
    name: "PayU", 
    status: "offline", 
    type: "CC/Local",
    price: "$0.35",
    speed: "Medium",
    successRate: "92%",
    checks: "34K"
  },
];

const Gateways = () => {
  const onlineCount = gateways.filter(g => g.status === "online").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Gateways</h1>
          <p className="text-muted-foreground mt-1">Available payment gateways for checking</p>
        </div>
        <Badge variant="outline" className="border-green-500/50 text-green-500 text-sm py-1 px-3">
          <Activity className="h-3 w-3 mr-1" />
          {onlineCount}/{gateways.length} Online
        </Badge>
      </div>

      {/* Gateway Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gateways.map((gateway) => (
          <Card 
            key={gateway.name} 
            className={`bg-card border-border transition-all hover:border-primary/50 ${
              gateway.status === "offline" ? "opacity-60" : ""
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  {gateway.name}
                </CardTitle>
                <div className="flex items-center gap-1">
                  {gateway.status === "online" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : gateway.status === "maintenance" ? (
                    <Clock className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={`text-xs capitalize ${
                    gateway.status === "online" 
                      ? "text-green-500" 
                      : gateway.status === "maintenance" 
                        ? "text-yellow-500" 
                        : "text-destructive"
                  }`}>
                    {gateway.status}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs">
                  {gateway.type}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-muted-foreground text-xs">Price</p>
                    <p className="font-bold">{gateway.price}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-muted-foreground text-xs">Speed</p>
                    <p className="font-bold">{gateway.speed}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-muted-foreground text-xs">Success</p>
                    <p className="font-bold text-green-500">{gateway.successRate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-muted-foreground text-xs">Checks</p>
                    <p className="font-bold">{gateway.checks}</p>
                  </div>
                </div>
              </div>

              <Button 
                className={`w-full ${gateway.status === "online" ? "btn-primary" : ""}`}
                variant={gateway.status === "online" ? "default" : "outline"}
                disabled={gateway.status !== "online"}
              >
                {gateway.status === "online" ? "Use Gateway" : "Unavailable"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Gateways;
