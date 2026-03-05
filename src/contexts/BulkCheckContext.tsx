import { createContext, useContext, useState, ReactNode } from "react";

interface BulkCheckContextType {
  isBulkChecking: boolean;
  setIsBulkChecking: (value: boolean) => void;
}

const BulkCheckContext = createContext<BulkCheckContextType>({
  isBulkChecking: false,
  setIsBulkChecking: () => {},
});

export const BulkCheckProvider = ({ children }: { children: ReactNode }) => {
  const [isBulkChecking, setIsBulkChecking] = useState(false);
  return (
    <BulkCheckContext.Provider value={{ isBulkChecking, setIsBulkChecking }}>
      {children}
    </BulkCheckContext.Provider>
  );
};

export const useBulkCheck = () => useContext(BulkCheckContext);
