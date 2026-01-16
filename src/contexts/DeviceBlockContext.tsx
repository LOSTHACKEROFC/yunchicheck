import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { supabase } from "@/integrations/supabase/client";

interface DeviceBlockContextType {
  isBlocked: boolean;
  isChecking: boolean;
  blockReason: string | null;
}

const DeviceBlockContext = createContext<DeviceBlockContextType>({
  isBlocked: false,
  isChecking: true,
  blockReason: null,
});

export const useDeviceBlock = () => useContext(DeviceBlockContext);

interface DeviceBlockProviderProps {
  children: ReactNode;
}

export function DeviceBlockProvider({ children }: DeviceBlockProviderProps) {
  const { fingerprint, loading: fingerprintLoading } = useDeviceFingerprint();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  useEffect(() => {
    const checkBlock = async () => {
      if (fingerprintLoading) return;

      try {
        const { data, error } = await supabase.functions.invoke("check-device-block", {
          body: { fingerprint },
        });

        if (error) {
          console.error("Error checking device block:", error);
          setIsChecking(false);
          return;
        }

        if (data?.blocked) {
          setIsBlocked(true);
          setBlockReason(data.reason || "device");
        }
      } catch (err) {
        console.error("Failed to check device block:", err);
      } finally {
        setIsChecking(false);
      }
    };

    checkBlock();
  }, [fingerprint, fingerprintLoading]);

  return (
    <DeviceBlockContext.Provider value={{ isBlocked, isChecking, blockReason }}>
      {children}
    </DeviceBlockContext.Provider>
  );
}
