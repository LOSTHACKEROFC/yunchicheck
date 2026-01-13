import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, CheckCircle, XCircle } from "lucide-react";

const gateways = [
  { name: "Stripe", status: "active", type: "CC" },
  { name: "Braintree", status: "active", type: "CC" },
  { name: "Square", status: "maintenance", type: "CC" },
  { name: "Adyen", status: "active", type: "CC" },
];

const Gateways = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Gateways</h1>
        <p className="text-muted-foreground mt-1">Available payment gateways</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {gateways.map((gateway) => (
          <Card key={gateway.name} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-medium">{gateway.name}</CardTitle>
              <CreditCard className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  {gateway.type}
                </Badge>
                <div className="flex items-center gap-1">
                  {gateway.status === "active" ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-500">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-yellow-500">Maintenance</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Gateways;
