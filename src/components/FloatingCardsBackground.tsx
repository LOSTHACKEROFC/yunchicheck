import React, { memo } from "react";
import { CardBrandLogo } from "@/components/CardBrandLogo";

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
  const sizeMap = { small: "w-16 h-10", medium: "w-20 h-13", large: "w-24 h-16" };
  const logoSize = size === "small" ? "xs" : size === "medium" ? "sm" : "md";
  const { hsl, border } = brandColors[brand];
  const glowDuration = duration * 0.5 + 1.5;
  const brandName = brand === "default" ? "visa" : brand;

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
        className={`${sizeMap[size]} rounded-lg flex flex-col justify-between p-2 relative overflow-hidden`}
        style={{
          background: `linear-gradient(145deg, hsla(${hsl}, 0.25), hsla(0, 0%, 10%, 0.8), hsla(${hsl}, 0.15))`,
          border: `1.5px solid hsla(${border}, 0.5)`,
          boxShadow: `
            0 0 12px hsla(${hsl}, 0.5),
            0 0 30px hsla(${hsl}, 0.3),
            0 0 60px hsla(${hsl}, 0.15),
            0 0 90px hsla(${hsl}, 0.08),
            inset 0 0 20px hsla(${hsl}, 0.12),
            inset 0 1px 0 hsla(${hsl}, 0.3)
          `,
        }}
      >
        {/* Glossy reflection */}
        <div 
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(160deg, hsla(0, 0%, 100%, 0.08) 0%, transparent 40%, transparent 100%)`,
          }}
        />
        
        {/* Top row: chip + brand logo */}
        <div className="flex items-start justify-between relative z-10">
          <div 
            className="w-4 h-3 rounded-sm"
            style={{ 
              background: `linear-gradient(135deg, hsla(45, 90%, 65%, 0.7), hsla(45, 90%, 45%, 0.5))`,
              boxShadow: `0 0 6px hsla(45, 90%, 55%, 0.4)`
            }} 
          />
          <div style={{ opacity: 0.85 }}>
            <CardBrandLogo brand={brandName} size={logoSize} />
          </div>
        </div>

        {/* Card number dots */}
        <div className="flex gap-1.5 relative z-10 mt-auto">
          {[0,1,2,3].map(g => (
            <div key={g} className="flex gap-[2px]">
              {[0,1,2,3].map(d => (
                <div 
                  key={d} 
                  className="w-[3px] h-[3px] rounded-full" 
                  style={{
                    background: `hsla(0, 0%, 100%, 0.35)`,
                    boxShadow: `0 0 2px hsla(${hsl}, 0.3)`
                  }}
                />
              ))}
            </div>
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
  { delay: 3, duration: 10, startX: 15, startY: 75, size: "small" as const, brand: "amex" as const },
  { delay: 2, duration: 13, startX: 80, startY: 70, size: "medium" as const, brand: "amex" as const },
  { delay: 4, duration: 15, startX: 45, startY: 5, size: "large" as const, brand: "visa" as const },
  { delay: 1, duration: 11, startX: 25, startY: 90, size: "small" as const, brand: "mastercard" as const },
  { delay: 3.5, duration: 13, startX: 70, startY: 85, size: "medium" as const, brand: "discover" as const },
  { delay: 0.5, duration: 12, startX: 10, startY: 40, size: "large" as const, brand: "mastercard" as const },
  { delay: 5, duration: 14, startX: 55, startY: 30, size: "small" as const, brand: "visa" as const },
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
