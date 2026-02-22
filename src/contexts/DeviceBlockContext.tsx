import { useEffect, useState, useRef, createContext, useContext, ReactNode } from "react";
import { useDeviceFingerprint } from "@/hooks/useDeviceFingerprint";
import { supabase } from "@/integrations/supabase/client";

interface DeviceBlockContextType {
  isBlocked: boolean;
  isChecking: boolean;
  blockReason: string | null;
}

const DeviceBlockContext = createContext<DeviceBlockContextType>({
  isBlocked: false,
  isChecking: false,
  blockReason: null,
});

export const useDeviceBlock = () => useContext(DeviceBlockContext);

interface DeviceBlockProviderProps {
  children: ReactNode;
}

export function DeviceBlockProvider({ children }: DeviceBlockProviderProps) {
  const { fingerprint, loading: fingerprintLoading } = useDeviceFingerprint();
  const [isBlocked, setIsBlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (fingerprintLoading || hasChecked.current) return;

    const checkBlock = async () => {
      setIsChecking(true);
      hasChecked.current = true;

      try {
        const { data, error } = await supabase.functions.invoke("check-device-block", {
          body: { fingerprint },
        });

        if (error) {
          console.error("Error checking device block:", error);
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
