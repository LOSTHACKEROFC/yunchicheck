import React, { memo } from "react";

type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "default";

const brandColors: Record<CardBrand, { hsl: string; border: string }> = {
  default: { hsl: "0, 85%, 55%", border: "0, 90%, 50%" },
  visa: { hsl: "220, 90%, 60%", border: "220, 95%, 55%" },
  mastercard: { hsl: "25, 95%, 58%", border: "20, 100%, 52%" },
  amex: { hsl: "180, 80%, 55%", border: "180, 90%, 50%" },
  discover: { hsl: "35, 95%, 58%", border: "35, 100%, 52%" },
};

const MiniCreditCard = memo(({ 
  delay, duration, startX, startY, size, brand 
}: { 
  delay: number; duration: number; startX: number; startY: number;
  size: "small" | "medium" | "large"; brand: CardBrand;
}) => {
  const sizeMap = { small: "w-14 h-9", medium: "w-18 h-11", large: "w-22 h-14" };
  const { hsl, border } = brandColors[brand];
  const glowDuration = duration * 0.5 + 1.5;

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
          background: `linear-gradient(135deg, hsla(${hsl}, 0.3), hsla(${hsl}, 0.08), hsla(${hsl}, 0.2))`,
          border: `1.5px solid hsla(${border}, 0.6)`,
          boxShadow: `
            0 0 12px hsla(${hsl}, 0.5),
            0 0 30px hsla(${hsl}, 0.3),
            0 0 60px hsla(${hsl}, 0.15),
            0 0 90px hsla(${hsl}, 0.08),
            inset 0 0 20px hsla(${hsl}, 0.15),
            inset 0 1px 0 hsla(${hsl}, 0.3)
          `,
        }}
      >
        {/* Neon edge highlight */}
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(135deg, hsla(${hsl}, 0.25) 0%, transparent 35%, transparent 65%, hsla(${hsl}, 0.15) 100%)`,
          }}
        />
        <div className="flex items-start justify-between relative z-10">
          <div 
            className="w-3.5 h-2.5 rounded-sm"
            style={{ 
              background: `linear-gradient(135deg, hsla(45, 90%, 65%, 0.7), hsla(45, 90%, 45%, 0.5))`,
              boxShadow: `0 0 6px hsla(45, 90%, 55%, 0.5)`
            }} 
          />
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ 
              background: `radial-gradient(circle, hsla(${hsl}, 0.9), hsla(${hsl}, 0.4))`,
              boxShadow: `0 0 8px hsla(${hsl}, 0.7), 0 0 16px hsla(${hsl}, 0.3)`
            }} 
          />
        </div>
        <div className="flex gap-1 mt-auto relative z-10">
          {[0,1,2,3].map(i => (
            <div 
              key={i} 
              className="w-2.5 h-[2px] rounded-full" 
              style={{
                background: `hsla(${hsl}, 0.6)`,
                boxShadow: `0 0 4px hsla(${hsl}, 0.4)`
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
        0%, 100% { transform: translateY(0) rotate(-2deg) translateZ(0); opacity: 0.35; }
        25% { transform: translateY(-20px) rotate(3deg) translateZ(0); opacity: 0.55; }
        50% { transform: translateY(-10px) rotate(-1deg) translateZ(0); opacity: 0.4; }
        75% { transform: translateY(-25px) rotate(4deg) translateZ(0); opacity: 0.6; }
      }
      @keyframes neon-glow-default {
        0%, 100% { filter: brightness(1.1) drop-shadow(0 0 10px hsla(0, 85%, 55%, 0.5)); }
        50% { filter: brightness(1.8) drop-shadow(0 0 30px hsla(0, 85%, 55%, 0.9)) drop-shadow(0 0 60px hsla(0, 85%, 55%, 0.4)); }
      }
      @keyframes neon-glow-visa {
        0%, 100% { filter: brightness(1.1) drop-shadow(0 0 10px hsla(220, 90%, 60%, 0.5)); }
        50% { filter: brightness(1.8) drop-shadow(0 0 30px hsla(220, 90%, 60%, 0.9)) drop-shadow(0 0 60px hsla(220, 90%, 60%, 0.4)); }
      }
      @keyframes neon-glow-mastercard {
        0%, 100% { filter: brightness(1.1) drop-shadow(0 0 10px hsla(25, 95%, 58%, 0.5)); }
        50% { filter: brightness(1.8) drop-shadow(0 0 30px hsla(25, 95%, 58%, 0.9)) drop-shadow(0 0 60px hsla(25, 95%, 58%, 0.4)); }
      }
      @keyframes neon-glow-amex {
        0%, 100% { filter: brightness(1.1) drop-shadow(0 0 10px hsla(180, 80%, 55%, 0.5)); }
        50% { filter: brightness(1.8) drop-shadow(0 0 30px hsla(180, 80%, 55%, 0.9)) drop-shadow(0 0 60px hsla(180, 80%, 55%, 0.4)); }
      }
      @keyframes neon-glow-discover {
        0%, 100% { filter: brightness(1.1) drop-shadow(0 0 10px hsla(35, 95%, 58%, 0.5)); }
        50% { filter: brightness(1.8) drop-shadow(0 0 30px hsla(35, 95%, 58%, 0.9)) drop-shadow(0 0 60px hsla(35, 95%, 58%, 0.4)); }
      }
    `}</style>
    {cards.map((card, i) => <MiniCreditCard key={i} {...card} />)}
  </div>
));

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
