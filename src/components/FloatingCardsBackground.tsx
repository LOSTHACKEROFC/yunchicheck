import React, { memo } from "react";

type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "default";

const brandColors: Record<CardBrand, string> = {
  default: "0, 70%, 50%",
  visa: "220, 80%, 55%",
  mastercard: "30, 90%, 55%",
  amex: "180, 70%, 50%",
  discover: "35, 85%, 55%",
};

const MiniCreditCard = memo(({ 
  delay, duration, startX, startY, size, brand 
}: { 
  delay: number; duration: number; startX: number; startY: number;
  size: "small" | "medium" | "large"; brand: CardBrand;
}) => {
  const sizeMap = { small: "w-12 h-8", medium: "w-16 h-10", large: "w-20 h-12" };
  const hsl = brandColors[brand];

  return (
    <div
      className="absolute pointer-events-none will-change-transform"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        animation: `float-card ${duration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        contain: "layout style paint",
      }}
    >
      <div 
        className={`${sizeMap[size]} rounded-lg border border-white/10 flex flex-col justify-between p-1.5`}
        style={{
          background: `linear-gradient(135deg, hsla(${hsl}, 0.15), hsla(${hsl}, 0.05))`,
          boxShadow: `0 0 12px hsla(${hsl}, 0.3)`,
        }}
      >
        <div className="flex items-start justify-between">
          <div className="w-3 h-2.5 rounded-sm bg-yellow-500/40" />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: `hsla(${hsl}, 0.5)` }} />
        </div>
        <div className="flex gap-1 mt-auto">
          {[0,1,2,3].map(i => (
            <div key={i} className="w-2 h-[2px] rounded-full bg-white/20" />
          ))}
        </div>
      </div>
    </div>
  );
});

MiniCreditCard.displayName = "MiniCreditCard";

const cards = [
  { delay: 0, duration: 12, startX: 5, startY: 10, size: "medium" as const, brand: "visa" as const },
  { delay: 1.5, duration: 14, startX: 85, startY: 15, size: "large" as const, brand: "mastercard" as const },
  { delay: 3, duration: 10, startX: 15, startY: 75, size: "small" as const, brand: "default" as const },
  { delay: 2, duration: 13, startX: 80, startY: 70, size: "medium" as const, brand: "amex" as const },
  { delay: 4, duration: 15, startX: 45, startY: 5, size: "large" as const, brand: "visa" as const },
  { delay: 1, duration: 11, startX: 25, startY: 90, size: "small" as const, brand: "mastercard" as const },
  { delay: 3.5, duration: 13, startX: 70, startY: 85, size: "medium" as const, brand: "discover" as const },
  { delay: 0.5, duration: 12, startX: 10, startY: 40, size: "small" as const, brand: "default" as const },
  { delay: 5, duration: 14, startX: 55, startY: 30, size: "small" as const, brand: "amex" as const },
  { delay: 2.5, duration: 11, startX: 35, startY: 55, size: "medium" as const, brand: "discover" as const },
];

const FloatingCardsBackground = memo(() => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" style={{ contain: "strict" }}>
    <style>{`
      @keyframes float-card {
        0%, 100% { transform: translateY(0) rotate(-2deg) translateZ(0); opacity: 0.2; }
        50% { transform: translateY(-20px) rotate(2deg) translateZ(0); opacity: 0.35; }
      }
    `}</style>
    {cards.map((card, i) => <MiniCreditCard key={i} {...card} />)}
  </div>
));

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
