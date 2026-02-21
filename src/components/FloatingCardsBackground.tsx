import React, { memo } from "react";

type CardBrand = "visa" | "mastercard" | "amex" | "discover";

const brandColors: Record<CardBrand, { hsl: string; border: string; bg: string }> = {
  visa: { hsl: "220, 90%, 60%", border: "220, 80%, 45%", bg: "linear-gradient(145deg, #1a1f71 0%, #0d1347 50%, #1a1f71 100%)" },
  mastercard: { hsl: "25, 95%, 58%", border: "0, 70%, 40%", bg: "linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" },
  amex: { hsl: "210, 80%, 55%", border: "210, 70%, 40%", bg: "linear-gradient(145deg, #006fcf 0%, #004a8f 50%, #003a70 100%)" },
  discover: { hsl: "25, 90%, 55%", border: "25, 80%, 42%", bg: "linear-gradient(145deg, #2d2d2d 0%, #1a1a1a 50%, #333 100%)" },
};

// Visa SVG logo
const VisaLogo = memo(({ w, h }: { w: number; h: number }) => (
  <svg width={w} height={h} viewBox="0 0 80 26" fill="none">
    <path d="M32.3 1L26 25H20.7L27 1H32.3ZM53.8 16.3L56.4 8.8L57.9 16.3H53.8ZM59.4 25H64.2L60 1H55.5C54.4 1 53.5 1.6 53.1 2.6L44.8 25H50.2L51.3 22H57.8L59.4 25ZM47.3 17.2C47.3 10.5 38 10.1 38.1 7.2C38.1 6.3 38.9 5.3 40.8 5.1C41.7 5 44.2 4.9 47 6.2L48.1 1.6C46.6 1.1 44.7 0.5 42.3 0.5C37.2 0.5 33.6 3.3 33.6 7.3C33.6 10.3 36.2 11.9 38.2 12.9C40.3 13.9 41 14.6 41 15.5C40.9 17 39.2 17.6 37.5 17.6C34.4 17.7 32.6 16.8 31.2 16.2L30.1 20.9C31.5 21.5 34.1 22.1 36.8 22.1C42.2 22.1 45.7 19.4 47.3 17.2ZM22.8 1L14.6 25H9.2L5.2 5C5 4.1 4.7 3.7 4 3.3C2.8 2.7 0.9 2.1 0 1.8L0.1 1H8.5C9.6 1 10.5 1.7 10.8 3L12.8 14.5L18 1H22.8Z" fill="white"/>
  </svg>
));

// Mastercard SVG logo
const MastercardLogo = memo(({ w, h }: { w: number; h: number }) => (
  <svg width={w} height={h} viewBox="0 0 52 32" fill="none">
    <circle cx="18" cy="16" r="14" fill="#EB001B"/>
    <circle cx="34" cy="16" r="14" fill="#F79E1B"/>
    <path d="M26 5.4C29 7.7 31 11.6 31 16C31 20.4 29 24.3 26 26.6C23 24.3 21 20.4 21 16C21 11.6 23 7.7 26 5.4Z" fill="#FF5F00"/>
  </svg>
));

// Amex SVG logo
const AmexLogo = memo(({ w, h }: { w: number; h: number }) => (
  <svg width={w} height={h} viewBox="0 0 60 20" fill="none">
    <path d="M5.2 0L0 20H6.8L7.8 16.8H11.2L12.2 20H19.6V17.2L20.3 20H24.2L24.9 17.1V20H42.4L45.2 16.9L47.8 20H55.6L48 10.1L55.6 0H48L45.3 3L42.7 0H24V2.6L23.2 0H18.2L17.2 2.7V0H9.6L8.2 3.6L6.7 0H5.2ZM6.4 3.2H9.8L13.6 12.4V3.2H17.4L20.3 10L22.9 3.2H26.7V16.8H24.4L24.4 5.6L21.2 16.8H19L15.8 5.6V16.8H11.2L10.1 13.6H5.8L4.7 16.8H2.2L6.4 3.2ZM28.8 3.2H40.8L45.2 8.1L49.8 3.2H52.6L46.4 10L52.6 16.8H49.6L45.2 11.8L40.6 16.8H28.8V3.2ZM7 5.4L5.2 11.2H8.8L7 5.4ZM31.2 5.6V8.6H37.6V11H31.2V14.4H38.4L42.4 10L38.6 5.6H31.2Z" fill="white"/>
  </svg>
));

// Discover SVG logo
const DiscoverLogo = memo(({ w, h }: { w: number; h: number }) => (
  <svg width={w} height={h} viewBox="0 0 64 18" fill="none">
    <path d="M4 0H8C10.8 0 12.5 2 12.5 4.5C12.5 7.5 10.2 9 7.6 9H4V0ZM6 2V7H7.4C9 7 10.4 6 10.4 4.5C10.4 3 9.2 2 7.6 2H6Z" fill="white"/>
    <rect x="14" y="0" width="2" height="9" fill="white"/>
    <path d="M19 5.8C19 6.8 19.8 7.2 21 7.6C22.6 8 24 8.6 24 10.6C24 12.8 22.2 14 20 14C18.4 14 17 13.4 16 12.4L17.2 11C17.8 11.8 18.8 12.2 19.8 12.2C20.8 12.2 21.6 11.8 21.6 10.8C21.6 9.8 20.6 9.4 19.6 9C18.2 8.4 17 7.8 17 6C17 4 18.6 3 20.4 3C21.8 3 23 3.6 23.6 4.2L22.4 5.6C21.8 5 21.2 4.8 20.4 4.8C19.6 4.8 19 5.2 19 5.8Z" fill="white"/>
    <path d="M32 8.5C32 11.6 29.8 14 27 14C24.2 14 22 11.6 22 8.5C22 5.4 24.2 3 27 3C28 3 28.8 3.4 29.4 3.8" fill="none" stroke="white" strokeWidth="2"/>
    <circle cx="35" cy="8.5" r="5.5" fill="#F47216"/>
    <path d="M41.5 0L38 9H40.2L40.8 7.2H44.2L44.8 9H47L43.5 0H41.5ZM42.5 2.4L43.6 5.6H41.4L42.5 2.4Z" fill="white"/>
    <path d="M48 0V9H53V7H50V5.2H52.8V3.2H50V2H53V0H48Z" fill="white"/>
    <path d="M55 0V9H57V5.6L60.4 9H63L59 5L62.6 0H60.2L57 4.2V0H55Z" fill="white" />
  </svg>
));

const BrandLogos: Record<CardBrand, React.FC<{ w: number; h: number }>> = {
  visa: VisaLogo,
  mastercard: MastercardLogo,
  amex: AmexLogo,
  discover: DiscoverLogo,
};

const MiniCreditCard = memo(({ 
  delay, duration, startX, startY, size, brand 
}: { 
  delay: number; duration: number; startX: number; startY: number;
  size: "small" | "medium" | "large"; brand: CardBrand;
}) => {
  const dims = { small: { w: 72, h: 46 }, medium: { w: 90, h: 58 }, large: { w: 110, h: 70 } };
  const logoW = { small: 28, medium: 36, large: 44 };
  const logoH = { small: 10, medium: 13, large: 16 };
  const { hsl, border, bg } = brandColors[brand];
  const glowDuration = duration * 0.5 + 1.5;
  const d = dims[size];
  const Logo = BrandLogos[brand];

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
        style={{
          width: d.w,
          height: d.h,
          background: bg,
          border: `1px solid hsla(${border}, 0.5)`,
          borderRadius: 8,
          padding: size === "small" ? 6 : 8,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          boxShadow: `
            0 0 10px hsla(${hsl}, 0.45),
            0 0 25px hsla(${hsl}, 0.25),
            0 0 50px hsla(${hsl}, 0.12),
            0 0 80px hsla(${hsl}, 0.06),
            inset 0 0 15px hsla(${hsl}, 0.1),
            inset 0 1px 0 hsla(0, 0%, 100%, 0.08)
          `,
        }}
      >
        {/* Glossy shine */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: 8, pointerEvents: "none",
          background: "linear-gradient(160deg, hsla(0,0%,100%,0.1) 0%, hsla(0,0%,100%,0.02) 30%, transparent 50%)",
        }} />

        {/* Top: Chip + Contactless */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative", zIndex: 1 }}>
          {/* EMV Chip */}
          <div style={{
            width: size === "small" ? 14 : 18,
            height: size === "small" ? 11 : 14,
            borderRadius: 3,
            background: "linear-gradient(145deg, #d4af37 0%, #c5a028 30%, #b8962a 60%, #d4af37 100%)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.3), inset 0 0 3px rgba(255,255,255,0.2)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Chip lines */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(0,0,0,0.15)" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, background: "rgba(0,0,0,0.15)" }} />
            <div style={{ position: "absolute", top: "25%", left: "25%", right: "25%", bottom: "25%", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 1 }} />
          </div>
          {/* Contactless icon */}
          <svg width={size === "small" ? 8 : 10} height={size === "small" ? 8 : 10} viewBox="0 0 20 20" fill="none" style={{ opacity: 0.5 }}>
            <path d="M10 16C13.3 16 16 13.3 16 10" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <path d="M10 12C11.1 12 12 11.1 12 10" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            <path d="M10 20C16.6 20 20 16.6 20 10" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Middle: Card number */}
        <div style={{ display: "flex", gap: size === "small" ? 3 : 5, position: "relative", zIndex: 1 }}>
          {[0,1,2,3].map(g => (
            <div key={g} style={{ display: "flex", gap: 1.5 }}>
              {[0,1,2,3].map(d => (
                <div key={d} style={{
                  width: size === "small" ? 2.5 : 3,
                  height: size === "small" ? 2.5 : 3,
                  borderRadius: "50%",
                  background: "hsla(0, 0%, 100%, 0.35)",
                }} />
              ))}
            </div>
          ))}
        </div>

        {/* Bottom: Brand logo */}
        <div style={{ display: "flex", justifyContent: "flex-end", position: "relative", zIndex: 1 }}>
          <Logo w={logoW[size]} h={logoH[size]} />
        </div>
      </div>
    </div>
  );
});

MiniCreditCard.displayName = "MiniCreditCard";

const cards: Array<{ delay: number; duration: number; startX: number; startY: number; size: "small" | "medium" | "large"; brand: CardBrand }> = [
  { delay: 0, duration: 12, startX: 4, startY: 8, size: "medium", brand: "visa" },
  { delay: 1.5, duration: 14, startX: 84, startY: 12, size: "large", brand: "mastercard" },
  { delay: 3, duration: 10, startX: 14, startY: 72, size: "small", brand: "amex" },
  { delay: 2, duration: 13, startX: 78, startY: 68, size: "medium", brand: "amex" },
  { delay: 4, duration: 15, startX: 44, startY: 4, size: "large", brand: "visa" },
  { delay: 1, duration: 11, startX: 24, startY: 88, size: "small", brand: "mastercard" },
  { delay: 3.5, duration: 13, startX: 68, startY: 84, size: "medium", brand: "discover" },
  { delay: 0.5, duration: 12, startX: 8, startY: 38, size: "large", brand: "mastercard" },
  { delay: 5, duration: 14, startX: 54, startY: 28, size: "small", brand: "visa" },
  { delay: 2.5, duration: 11, startX: 34, startY: 54, size: "medium", brand: "discover" },
];

const FloatingCardsBackground = memo(() => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" style={{ contain: "strict" }}>
    <style>{`
      @keyframes float-card {
        0%, 100% { transform: translateY(0) rotate(-2deg) translateZ(0); opacity: 0.3; }
        25% { transform: translateY(-20px) rotate(2.5deg) translateZ(0); opacity: 0.5; }
        50% { transform: translateY(-8px) rotate(-1deg) translateZ(0); opacity: 0.35; }
        75% { transform: translateY(-24px) rotate(3.5deg) translateZ(0); opacity: 0.55; }
      }
      @keyframes neon-glow-visa {
        0%, 100% { filter: brightness(1.05) drop-shadow(0 0 8px hsla(220, 90%, 60%, 0.4)); }
        50% { filter: brightness(1.6) drop-shadow(0 0 24px hsla(220, 90%, 60%, 0.8)) drop-shadow(0 0 50px hsla(220, 90%, 60%, 0.35)); }
      }
      @keyframes neon-glow-mastercard {
        0%, 100% { filter: brightness(1.05) drop-shadow(0 0 8px hsla(25, 95%, 58%, 0.4)); }
        50% { filter: brightness(1.6) drop-shadow(0 0 24px hsla(25, 95%, 58%, 0.8)) drop-shadow(0 0 50px hsla(25, 95%, 58%, 0.35)); }
      }
      @keyframes neon-glow-amex {
        0%, 100% { filter: brightness(1.05) drop-shadow(0 0 8px hsla(210, 80%, 55%, 0.4)); }
        50% { filter: brightness(1.6) drop-shadow(0 0 24px hsla(210, 80%, 55%, 0.8)) drop-shadow(0 0 50px hsla(210, 80%, 55%, 0.35)); }
      }
      @keyframes neon-glow-discover {
        0%, 100% { filter: brightness(1.05) drop-shadow(0 0 8px hsla(25, 90%, 55%, 0.4)); }
        50% { filter: brightness(1.6) drop-shadow(0 0 24px hsla(25, 90%, 55%, 0.8)) drop-shadow(0 0 50px hsla(25, 90%, 55%, 0.35)); }
      }
    `}</style>
    {cards.map((card, i) => <MiniCreditCard key={i} {...card} />)}
  </div>
));

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
