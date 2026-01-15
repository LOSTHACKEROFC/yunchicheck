import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowUpCircle, 
  Bitcoin, 
  Banknote, 
  Wallet,
  CheckCircle,
  Clock,
  Copy,
  History,
  Loader2,
  Upload,
  ImageIcon,
  X,
  Coins,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TopupTransaction {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  wallet_address: string | null;
  transaction_hash: string | null;
  created_at: string;
  completed_at: string | null;
  proof_image_url: string | null;
}

const paymentMethods = [
  { id: "btc", name: "Bitcoin", icon: Bitcoin, fee: "0%", time: "10-30 min", address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "eth", name: "Ethereum", icon: Wallet, fee: "0%", time: "5-15 min", address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F" },
  { id: "ltc", name: "Litecoin", icon: Bitcoin, fee: "0%", time: "5-10 min", address: "ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "usdt", name: "USDT TRC20", icon: Banknote, fee: "0%", time: "1-5 min", address: "TJYeasypBvHPcTKe5ykGEVMR8Hgb5a9r4J" },
];

// Credit packages with prices
const creditPackages = [
  { credits: 350, price: 25, popular: false },
  { credits: 1500, price: 100, popular: false },
  { credits: 9000, price: 500, popular: true },
  { credits: 45000, price: 2000, popular: false },
  { credits: 145000, price: 5000, popular: false },
  { credits: 710000, price: 15000, popular: false },
];

const ITEMS_PER_PAGE = 20;

const Topup = () => {
  const [selectedPackage, setSelectedPackage] = useState<typeof creditPackages[0] | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [transactions, setTransactions] = useState<TopupTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<TopupTransaction | null>(null);
  const [proofImage, setProofImage] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending" | "failed">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter transactions based on status
  const filteredTransactions = transactions.filter(tx => {
    if (statusFilter === "all") return true;
    return tx.status === statusFilter;
  });

  // Fetch transactions
  const fetchTransactions = async (loadMore = false) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!loadMore) {
      setLoadingTransactions(true);
    }

    // Get total count
    const { count } = await supabase
      .from('topup_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    setTotalCount(count || 0);

    const offset = loadMore ? transactions.length : 0;

    const { data, error } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1);

    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      const newData = data || [];
      if (loadMore) {
        setTransactions(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const uniqueNew = newData.filter(t => !existingIds.has(t.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setTransactions(newData);
      }
      setHasMore(newData.length === ITEMS_PER_PAGE && (offset + newData.length) < (count || 0));
    }
    setLoadingTransactions(false);
    setLoadingMore(false);
  };

  const loadMoreTransactions = async () => {
    setLoadingMore(true);
    await fetchTransactions(true);
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('topup-transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topup_transactions'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTransactions(prev => [payload.new as TopupTransaction, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as TopupTransaction;
            setTransactions(prev => 
              prev.map(t => t.id === updated.id ? updated : t)
            );
            
            // If this is the current transaction and it's completed
            if (currentTransaction?.id === updated.id && updated.status === 'completed') {
              toast.success(`${updated.amount} credits have been added to your account!`);
              setShowPayment(false);
              setCurrentTransaction(null);
              setSelectedPackage(null);
              setSelectedMethod("");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTransaction]);

  const handleTopup = async () => {
    if (!selectedPackage) {
      toast.error("Please select a credit package");
      return;
    }
    if (!selectedMethod) {
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
    
    // Store credits in the amount field
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
    setShowPayment(true);
    toast.success("Transaction created! Send payment to the address below.");
  };

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard!");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
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

      // Upload image to storage
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

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(fileName);

      // Update transaction with proof image URL
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

      // Call edge function to notify admin via Telegram
      const { error: notifyError } = await supabase.functions.invoke('notify-topup-proof', {
        body: { 
          transaction_id: currentTransaction.id,
          user_id: user.id,
          amount: currentTransaction.amount,
          payment_method: currentTransaction.payment_method,
          proof_image_url: publicUrl
        }
      });

      if (notifyError) {
        console.error('Error notifying admin:', notifyError);
        // Don't show error to user, proof was uploaded successfully
      }

      toast.success("Payment proof submitted! Waiting for admin confirmation.");
      setShowPayment(false);
      setCurrentTransaction(null);
      clearProofImage();
      setSelectedPackage(null);
      setSelectedMethod("");
    } catch (error) {
      console.error('Error submitting proof:', error);
      toast.error("Failed to submit payment proof");
    } finally {
      setUploadingProof(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const selectedPayment = paymentMethods.find(m => m.id === selectedMethod);

  if (showPayment && currentTransaction && selectedPackage) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Complete Payment</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Send the exact amount and upload payment confirmation</p>
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
                {selectedPackage.credits} Credits
              </p>
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
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Click to select or drag and drop</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">PNG, JPG up to 5MB</p>
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
                onClick={() => {
                  setShowPayment(false);
                  setCurrentTransaction(null);
                  clearProofImage();
                }}
              >
                Back
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">Buy Credits</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Purchase credit packages to use for checks</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Credit Packages */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Credit Packages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-3 pt-0 sm:p-6 sm:pt-0">
            {/* Package Selection */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {creditPackages.map((pkg) => (
                <button
                  key={pkg.credits}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`relative p-3 sm:p-4 rounded-lg border transition-all text-left ${
                    selectedPackage?.credits === pkg.credits
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary hover:border-primary/50"
                  }`}
                >
                  {pkg.popular && (
                    <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px]">
                      Popular
                    </Badge>
                  )}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Coins className={`h-4 w-4 sm:h-5 sm:w-5 ${selectedPackage?.credits === pkg.credits ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-xl sm:text-2xl font-bold ${selectedPackage?.credits === pkg.credits ? "text-primary" : "text-foreground"}`}>
                        {pkg.credits}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Credits</p>
                    <p className="text-base sm:text-lg font-semibold text-primary mt-1 sm:mt-2">${pkg.price}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Price Comparison Table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 sm:p-3 font-medium text-muted-foreground">Package</th>
                    <th className="text-right p-2 sm:p-3 font-medium text-muted-foreground">Credits</th>
                    <th className="text-right p-2 sm:p-3 font-medium text-muted-foreground">Price</th>
                    <th className="text-right p-2 sm:p-3 font-medium text-muted-foreground">Per Credit</th>
                    <th className="text-right p-2 sm:p-3 font-medium text-muted-foreground">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {creditPackages.map((pkg, index) => {
                    const pricePerCredit = pkg.price / pkg.credits;
                    const baseRate = creditPackages[0].price / creditPackages[0].credits;
                    const savings = index === 0 ? 0 : Math.round((1 - pricePerCredit / baseRate) * 100);
                    return (
                      <tr 
                        key={pkg.credits} 
                        className={`border-t border-border transition-colors cursor-pointer hover:bg-muted/30 ${
                          selectedPackage?.credits === pkg.credits ? "bg-primary/10" : ""
                        } ${pkg.popular ? "bg-primary/5" : ""}`}
                        onClick={() => setSelectedPackage(pkg)}
                      >
                        <td className="p-2 sm:p-3 font-medium">
                          <div className="flex items-center gap-1 sm:gap-2">
                            {pkg.popular && (
                              <Badge className="bg-primary text-primary-foreground text-[8px] sm:text-[10px] px-1 py-0">Best</Badge>
                            )}
                            <span className={selectedPackage?.credits === pkg.credits ? "text-primary" : ""}>
                              {index === 0 ? "Starter" : index === 1 ? "Basic" : index === 2 ? "Standard" : index === 3 ? "Pro" : index === 4 ? "Business" : "Enterprise"}
                            </span>
                          </div>
                        </td>
                        <td className={`p-2 sm:p-3 text-right font-semibold ${selectedPackage?.credits === pkg.credits ? "text-primary" : ""}`}>
                          {pkg.credits.toLocaleString()}
                        </td>
                        <td className="p-2 sm:p-3 text-right text-muted-foreground">${pkg.price.toLocaleString()}</td>
                        <td className="p-2 sm:p-3 text-right font-mono text-muted-foreground">
                          ${pricePerCredit.toFixed(4)}
                        </td>
                        <td className="p-2 sm:p-3 text-right">
                          {savings > 0 ? (
                            <span className="text-green-500 font-medium">-{savings}%</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Payment Methods */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Payment Method</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border transition-all text-left ${
                      selectedMethod === method.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary hover:border-primary/50"
                    }`}
                  >
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedMethod === method.id ? "bg-primary/20" : "bg-muted"
                    }`}>
                      <method.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${
                        selectedMethod === method.id ? "text-primary" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium text-sm sm:text-base ${
                        selectedMethod === method.id ? "text-primary" : "text-foreground"
                      }`}>
                        {method.name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
                        <span>Fee: {method.fee}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {method.time}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <Button 
              className="w-full btn-primary h-10 sm:h-12 text-sm sm:text-base"
              onClick={handleTopup}
              disabled={!selectedPackage || !selectedMethod || loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              )}
              {loading ? "Processing..." : selectedPackage ? `Buy ${selectedPackage.credits} Credits for $${selectedPackage.price}` : "Select a Package"}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="bg-card border-border">
          <CardHeader className="p-3 sm:p-6">
            <div className="flex flex-col gap-3">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <History className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Recent Purchases
                {totalCount > 0 && (
                  <span className="text-xs text-muted-foreground font-normal ml-auto">
                    {filteredTransactions.length} of {transactions.length}
                  </span>
                )}
              </CardTitle>
              <Select value={statusFilter} onValueChange={(value: "all" | "completed" | "pending" | "failed") => setStatusFilter(value)}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            {loadingTransactions ? (
              <div className="flex items-center justify-center py-6 sm:py-8">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <Clock className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 sm:mb-3 opacity-50" />
                <p className="text-sm sm:text-base">{statusFilter === "all" ? "No purchases yet" : `No ${statusFilter} purchases`}</p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] sm:h-[400px] pr-2">
                <div className="space-y-2 sm:space-y-3">
                  {filteredTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-secondary/50 border border-border"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-xs sm:text-sm flex items-center gap-1">
                          <Coins className="h-3 w-3 text-primary" />
                          {tx.amount} Credits
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), "MMM d, HH:mm")}
                        </p>
                      </div>
                      {getStatusBadge(tx.status)}
                    </div>
                  ))}
                  {hasMore && statusFilter === "all" && (
                    <Button 
                      variant="outline" 
                      className="w-full text-xs" 
                      size="sm"
                      onClick={loadMoreTransactions}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <>
                          <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>Load More ({totalCount - transactions.length} remaining)</>
                      )}
                    </Button>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Topup;
