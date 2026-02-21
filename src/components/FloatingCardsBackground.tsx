import React, { memo } from "react";

type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "default";

const brandColors: Record<CardBrand, { hsl: string; border: string }> = {
  default: { hsl: "0, 70%, 50%", border: "0, 85%, 45%" },
  visa: { hsl: "220, 80%, 55%", border: "220, 90%, 50%" },
  mastercard: { hsl: "30, 90%, 55%", border: "25, 95%, 50%" },
  amex: { hsl: "180, 70%, 50%", border: "180, 80%, 45%" },
  discover: { hsl: "35, 85%, 55%", border: "35, 90%, 50%" },
};

const MiniCreditCard = memo(({ 
  delay, duration, startX, startY, size, brand 
}: { 
  delay: number; duration: number; startX: number; startY: number;
  size: "small" | "medium" | "large"; brand: CardBrand;
}) => {
  const sizeMap = { small: "w-12 h-8", medium: "w-16 h-10", large: "w-20 h-12" };
  const { hsl, border } = brandColors[brand];
  const glowDuration = duration * 0.6 + 2;

  return (
    <div
      className="absolute pointer-events-none will-change-transform"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        animation: `float-card ${duration}s ease-in-out infinite, neon-glow-${brand} ${glowDuration}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        contain: "layout style paint",
      }}
    >
      <div 
        className={`${sizeMap[size]} rounded-lg flex flex-col justify-between p-1.5 relative`}
        style={{
          background: `linear-gradient(135deg, hsla(${hsl}, 0.2), hsla(${hsl}, 0.05), hsla(${hsl}, 0.12))`,
          border: `1px solid hsla(${border}, 0.4)`,
          boxShadow: `
            0 0 8px hsla(${hsl}, 0.3),
            0 0 20px hsla(${hsl}, 0.15),
            0 0 40px hsla(${hsl}, 0.08),
            inset 0 0 12px hsla(${hsl}, 0.1)
          `,
        }}
      >
        {/* Neon edge highlight */}
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(135deg, hsla(${hsl}, 0.15) 0%, transparent 40%, transparent 60%, hsla(${hsl}, 0.1) 100%)`,
          }}
        />
        <div className="flex items-start justify-between relative z-10">
          <div 
            className="w-3 h-2.5 rounded-sm"
            style={{ 
              background: `linear-gradient(135deg, hsla(45, 80%, 60%, 0.6), hsla(45, 80%, 40%, 0.4))`,
              boxShadow: `0 0 4px hsla(45, 80%, 50%, 0.3)`
            }} 
          />
          <div 
            className="w-2.5 h-2.5 rounded-full" 
            style={{ 
              background: `hsla(${hsl}, 0.6)`,
              boxShadow: `0 0 6px hsla(${hsl}, 0.5)`
            }} 
          />
        </div>
        <div className="flex gap-1 mt-auto relative z-10">
          {[0,1,2,3].map(i => (
            <div 
              key={i} 
              className="w-2 h-[2px] rounded-full" 
              style={{
                background: `hsla(${hsl}, 0.4)`,
                boxShadow: `0 0 3px hsla(${hsl}, 0.2)`
              }}
            />
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
        0%, 100% { transform: translateY(0) rotate(-2deg) translateZ(0); opacity: 0.25; }
        25% { transform: translateY(-18px) rotate(2deg) translateZ(0); opacity: 0.4; }
        50% { transform: translateY(-8px) rotate(-1deg) translateZ(0); opacity: 0.3; }
        75% { transform: translateY(-22px) rotate(3deg) translateZ(0); opacity: 0.45; }
      }
      @keyframes neon-glow-default {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 6px hsla(0, 70%, 50%, 0.3)); }
        50% { filter: brightness(1.4) drop-shadow(0 0 16px hsla(0, 70%, 50%, 0.6)); }
      }
      @keyframes neon-glow-visa {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 6px hsla(220, 80%, 55%, 0.3)); }
        50% { filter: brightness(1.4) drop-shadow(0 0 16px hsla(220, 80%, 55%, 0.6)); }
      }
      @keyframes neon-glow-mastercard {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 6px hsla(30, 90%, 55%, 0.3)); }
        50% { filter: brightness(1.4) drop-shadow(0 0 16px hsla(30, 90%, 55%, 0.6)); }
      }
      @keyframes neon-glow-amex {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 6px hsla(180, 70%, 50%, 0.3)); }
        50% { filter: brightness(1.4) drop-shadow(0 0 16px hsla(180, 70%, 50%, 0.6)); }
      }
      @keyframes neon-glow-discover {
        0%, 100% { filter: brightness(1) drop-shadow(0 0 6px hsla(35, 85%, 55%, 0.3)); }
        50% { filter: brightness(1.4) drop-shadow(0 0 16px hsla(35, 85%, 55%, 0.6)); }
      }
    `}</style>
    {cards.map((card, i) => <MiniCreditCard key={i} {...card} />)}
  </div>
));

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
