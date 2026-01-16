import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Medal, 
  Crown, 
  Gem, 
  Star,
  Bitcoin, 
  Banknote, 
  Wallet,
  CheckCircle,
  Check,
  X as XIcon,
  Copy,
  Loader2,
  Upload,
  ImageIcon,
  X,
  Coins,
  ArrowLeft,
  ShoppingCart
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CreditPackage {
  name: string;
  credits: number;
  price: number;
  pricePerCredit: string;
  description: string;
  icon: typeof Medal;
  popular: boolean;
  savings?: string;
  features: string[];
}

const creditPackages: CreditPackage[] = [
  {
    name: "Silver",
    credits: 1500,
    price: 100,
    pricePerCredit: "$0.067",
    description: "Great starter pack",
    icon: Medal,
    popular: false,
    features: ["1,500 Card Checks", "All Gateways", "Basic Support"],
  },
  {
    name: "Gold",
    credits: 9000,
    price: 500,
    pricePerCredit: "$0.056",
    description: "Most popular choice",
    icon: Crown,
    popular: true,
    savings: "22%",
    features: ["9,000 Card Checks", "All Gateways", "Priority Support", "Priority Queue"],
  },
  {
    name: "Diamond",
    credits: 45000,
    price: 2000,
    pricePerCredit: "$0.044",
    description: "For power users",
    icon: Gem,
    popular: false,
    savings: "38%",
    features: ["45,000 Card Checks", "All Gateways", "VIP Support", "Priority Queue"],
  },
  {
    name: "Elite",
    credits: 145000,
    price: 5000,
    pricePerCredit: "$0.034",
    description: "Ultimate high-volume",
    icon: Star,
    popular: false,
    savings: "52%",
    features: ["145,000 Card Checks", "All Gateways", "Dedicated Support", "Priority Queue"],
  },
];

const paymentMethods = [
  { id: "btc", name: "Bitcoin", icon: Bitcoin, fee: "0%", time: "10-30 min", address: "1649YW8LCaghvBDAdXM9vhxDeqvKXTzetG" },
  { id: "eth", name: "Ethereum", icon: Wallet, fee: "0%", time: "5-15 min", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  { id: "ltc", name: "Litecoin", icon: Bitcoin, fee: "0%", time: "5-10 min", address: "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "usdt", name: "USDT TRC20", icon: Banknote, fee: "0%", time: "1-5 min", address: "TAtr65KL1efQtuFwQbV9gdQP8BaDAkEet6" },
];

interface TopupTransaction {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  wallet_address: string | null;
  proof_image_url: string | null;
}

const BuyCredits = () => {
  const [searchParams] = useSearchParams();
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [step, setStep] = useState<"select" | "payment" | "proof">("select");
  const [loading, setLoading] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<TopupTransaction | null>(null);
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-select package from URL parameter and auto-advance to payment
  useEffect(() => {
    const packageParam = searchParams.get('package');
    if (packageParam && !selectedPackage && step === "select") {
      const foundPackage = creditPackages.find(
        pkg => pkg.name.toLowerCase() === packageParam.toLowerCase()
      );
      if (foundPackage) {
        setSelectedPackage(foundPackage);
        setStep("payment");
        toast.success(`${foundPackage.name} package selected`, {
          description: `${foundPackage.credits} credits for $${foundPackage.price}`
        });
      }
    }
  }, [searchParams, selectedPackage, step]);

  // Real-time subscription for transaction updates
  useEffect(() => {
    if (!currentTransaction) return;

    const channel = supabase
      .channel('buy-credits-transaction')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'topup_transactions',
          filter: `id=eq.${currentTransaction.id}`
        },
        (payload) => {
          const updated = payload.new as TopupTransaction;
          if (updated.status === 'completed') {
            toast.success(`${updated.amount} credits have been added to your account!`);
            resetState();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTransaction]);

  const resetState = () => {
    setStep("select");
    setSelectedPackage(null);
    setSelectedMethod("");
    setCurrentTransaction(null);
    clearProofImage();
  };

  const handleProceedToPayment = () => {
    if (!selectedPackage) {
      toast.error("Please select a credit package");
      return;
    }
    setStep("payment");
  };

  const handleCreateTransaction = async () => {
    if (!selectedPackage || !selectedMethod) {
      toast.error("Please select a payment method");
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please login to continue");
      setLoading(false);
      return;
    }

    const selectedPayment = paymentMethods.find(m => m.id === selectedMethod);

    const { data, error } = await supabase
      .from('topup_transactions')
      .insert({
        user_id: user.id,
        amount: selectedPackage.credits,
        payment_method: selectedMethod,
        wallet_address: selectedPayment?.address || null,
        status: 'pending'
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      console.error('Error creating transaction:', error);
      toast.error("Failed to create transaction");
      return;
    }

    setCurrentTransaction(data);
    setStep("proof");
    toast.success("Transaction created! Send payment and upload confirmation.");
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard!");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setProofImage(file);
    setProofPreview(URL.createObjectURL(file));
  };

  const clearProofImage = () => {
    setProofImage(null);
    if (proofPreview) {
      URL.revokeObjectURL(proofPreview);
      setProofPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitProof = async () => {
    if (!proofImage || !currentTransaction) {
      toast.error("Please upload a payment confirmation image");
      return;
    }

    setUploadingProof(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login to continue");
        setUploadingProof(false);
        return;
      }

      const fileExt = proofImage.name.split('.').pop();
      const fileName = `${user.id}/${currentTransaction.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(fileName, proofImage, { upsert: true });

      if (uploadError) {
        console.error('Error uploading proof:', uploadError);
        toast.error("Failed to upload payment proof");
        setUploadingProof(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('topup_transactions')
        .update({ proof_image_url: publicUrl })
        .eq('id', currentTransaction.id);

      if (updateError) {
        console.error('Error updating transaction:', updateError);
        toast.error("Failed to save payment proof");
        setUploadingProof(false);
        return;
      }

      await supabase.functions.invoke('notify-topup-proof', {
        body: {
          transaction_id: currentTransaction.id,
          user_id: user.id,
          amount: currentTransaction.amount,
          payment_method: currentTransaction.payment_method,
          proof_image_url: publicUrl
        }
      });

      toast.success("Payment proof submitted! Waiting for admin confirmation.");
      resetState();
    } catch (error) {
      console.error('Error submitting proof:', error);
      toast.error("Failed to submit payment proof");
    } finally {
      setUploadingProof(false);
    }
  };

  const selectedPayment = paymentMethods.find(m => m.id === selectedMethod);

  // Step 3: Upload Proof
  if (step === "proof" && currentTransaction && selectedPackage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep("payment")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Complete Payment</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Send payment and upload confirmation</p>
          </div>
        </div>

        <Card className="bg-card border-border max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              {selectedPayment && <selectedPayment.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />}
              Pay with {selectedPayment?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="text-center p-4 sm:p-6 bg-secondary rounded-lg">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">Amount to Pay</p>
              <p className="text-3xl sm:text-4xl font-bold text-primary">${selectedPackage.price}</p>
              <p className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-1">
                <Coins className="h-4 w-4" />
                {selectedPackage.credits} Credits ({selectedPackage.name})
              </p>
              {selectedPackage.savings && (
                <Badge className="mt-2 bg-green-500/20 text-green-500 border-green-500/30">
                  Save {selectedPackage.savings}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Wallet Address</label>
              <div className="flex gap-2">
                <input
                  value={currentTransaction.wallet_address || ''}
                  readOnly
                  className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-xs sm:text-sm font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyAddress(currentTransaction.wallet_address || '')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Payment Proof Upload */}
            <div className="space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Payment Confirmation <span className="text-destructive">*</span>
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              {proofPreview ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img
                    src={proofPreview}
                    alt="Payment proof"
                    className="w-full max-h-64 object-contain bg-secondary"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={clearProofImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-6 sm:p-8 border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors flex flex-col items-center gap-3 bg-secondary/50"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs sm:text-sm font-medium text-foreground">Upload payment screenshot</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                  </div>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 sm:p-4 bg-primary/10 border border-primary/30 rounded-lg">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-medium text-primary">Upload Required</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Upload your payment confirmation to verify your deposit
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetState}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 btn-primary"
                onClick={handleSubmitProof}
                disabled={!proofImage || uploadingProof}
              >
                {uploadingProof ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {uploadingProof ? "Submitting..." : "Submit Proof"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Select Payment Method
  if (step === "payment" && selectedPackage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep("select")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Select Payment Method</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Choose how you want to pay</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Order Summary */}
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Order Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg border border-border">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <selectedPackage.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{selectedPackage.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedPackage.credits} Credits</p>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-border">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-bold text-primary">${selectedPackage.price}</span>
              </div>
              {selectedPackage.savings && (
                <Badge className="w-full justify-center bg-green-500/20 text-green-500 border-green-500/30">
                  You save {selectedPackage.savings} with this package!
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Payment Methods
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      selectedMethod === method.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        selectedMethod === method.id ? "bg-primary/20" : "bg-background"
                      }`}>
                        <method.icon className={`h-5 w-5 ${
                          selectedMethod === method.id ? "text-primary" : "text-muted-foreground"
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium">{method.name}</p>
                        <p className="text-xs text-muted-foreground">{method.time} • {method.fee} fee</p>
                      </div>
                      {selectedMethod === method.id && (
                        <CheckCircle className="h-5 w-5 text-primary ml-auto" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <Button
                className="w-full btn-primary"
                size="lg"
                onClick={handleCreateTransaction}
                disabled={!selectedMethod || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Coins className="h-4 w-4 mr-2" />
                )}
                {loading ? "Creating..." : `Pay $${selectedPackage.price}`}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Step 1: Select Package
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Buy Credits</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Choose a credit package that fits your needs</p>
      </div>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {creditPackages.map((pkg) => (
          <Card
            key={pkg.name}
            className={`relative cursor-pointer transition-all hover:border-primary/50 ${
              selectedPackage?.name === pkg.name
                ? "border-primary bg-primary/5 shadow-glow"
                : pkg.popular
                  ? "border-primary/50"
                  : "border-border"
            } ${pkg.popular ? "sm:scale-105" : ""}`}
            onClick={() => setSelectedPackage(pkg)}
          >
            {pkg.popular && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground text-xs">
                  Most Popular
                </Badge>
              </div>
            )}

            <CardHeader className="text-center pb-3 pt-6">
              <div className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${
                selectedPackage?.name === pkg.name || pkg.popular ? "bg-primary/20" : "bg-secondary"
              }`}>
                <pkg.icon className={`h-6 w-6 ${
                  selectedPackage?.name === pkg.name || pkg.popular ? "text-primary" : "text-muted-foreground"
                }`} />
              </div>
              <CardTitle className="text-lg">{pkg.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{pkg.description}</p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  <span className="text-3xl font-bold text-primary">{pkg.credits}</span>
                </div>
                <div className="text-xl font-semibold">${pkg.price}</div>
                <div className="text-xs text-muted-foreground">{pkg.pricePerCredit}/credit</div>
                {pkg.savings && (
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                    Save {pkg.savings}
                  </Badge>
                )}
              </div>

              <ul className="space-y-2">
                {pkg.features.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs">
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className={`w-full h-1 rounded-full ${
                selectedPackage?.name === pkg.name ? "bg-primary" : "bg-border"
              }`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          className="btn-primary min-w-[200px]"
          onClick={handleProceedToPayment}
          disabled={!selectedPackage}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          {selectedPackage
            ? `Continue with ${selectedPackage.name} - $${selectedPackage.price}`
            : "Select a Package"}
        </Button>
      </div>
    </div>
  );
};

export default BuyCredits;
