import { forwardRef } from "react";
import { CreditCard } from "lucide-react";

// Mini credit card component with realistic card design
const MiniCreditCard = ({ 
  delay, 
  duration, 
  startX, 
  startY,
  glowIntensity = 0.4,
  size = "medium"
}: { 
  delay: number; 
  duration: number; 
  startX: number; 
  startY: number;
  glowIntensity?: number;
  size?: "small" | "medium" | "large";
}) => {
  const sizeClasses = {
    small: "w-12 h-8",
    medium: "w-16 h-10",
    large: "w-20 h-12"
  };

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        animation: `float-card ${duration}s ease-in-out infinite, glow-pulse ${duration * 0.4}s ease-in-out infinite`,
        animationDelay: `${delay}s`,
      }}
    >
      <div 
        className={`${sizeClasses[size]} bg-gradient-to-br from-card/40 via-card/30 to-destructive/10 backdrop-blur-md rounded-lg border border-destructive/30 flex flex-col justify-between p-1.5 transition-all duration-1000`}
        style={{
          boxShadow: `
            0 0 ${15 * glowIntensity}px hsla(0, 70%, 50%, ${glowIntensity}), 
            0 0 ${30 * glowIntensity}px hsla(0, 70%, 50%, ${glowIntensity * 0.6}), 
            0 0 ${45 * glowIntensity}px hsla(0, 70%, 50%, ${glowIntensity * 0.3}),
            inset 0 0 ${10 * glowIntensity}px hsla(0, 70%, 50%, ${glowIntensity * 0.2})
          `,
        }}
      >
        {/* Card chip */}
        <div className="flex items-start justify-between">
          <div 
            className="w-3 h-2.5 rounded-sm bg-gradient-to-br from-yellow-500/60 to-yellow-600/40"
            style={{
              boxShadow: `0 0 6px hsla(45, 80%, 50%, 0.4)`
            }}
          />
          <CreditCard className="h-2.5 w-2.5 text-destructive/60 drop-shadow-[0_0_4px_hsla(0,70%,50%,0.5)]" />
        </div>
        
        {/* Card number dots */}
        <div className="flex gap-0.5 mt-auto">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-[1px]">
              {[...Array(4)].map((_, j) => (
                <div 
                  key={j} 
                  className="w-[2px] h-[2px] rounded-full bg-destructive/40"
                  style={{
                    boxShadow: `0 0 2px hsla(0, 70%, 50%, 0.3)`
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Background floating credit cards
const FloatingCardsBackground = forwardRef<HTMLDivElement>((_, ref) => {
  const cards = [
    { delay: 0, duration: 9, startX: 3, startY: 8, glowIntensity: 0.5, size: "medium" as const },
    { delay: 1.2, duration: 11, startX: 88, startY: 12, glowIntensity: 0.6, size: "large" as const },
    { delay: 2.5, duration: 8, startX: 12, startY: 72, glowIntensity: 0.45, size: "small" as const },
    { delay: 1.8, duration: 10, startX: 82, startY: 68, glowIntensity: 0.55, size: "medium" as const },
    { delay: 3.5, duration: 12, startX: 48, startY: 5, glowIntensity: 0.7, size: "large" as const },
    { delay: 0.8, duration: 9, startX: 22, startY: 88, glowIntensity: 0.4, size: "small" as const },
    { delay: 2.2, duration: 11, startX: 72, startY: 82, glowIntensity: 0.5, size: "medium" as const },
    { delay: 0.5, duration: 10, startX: 8, startY: 38, glowIntensity: 0.55, size: "large" as const },
    { delay: 3.8, duration: 8, startX: 92, startY: 42, glowIntensity: 0.45, size: "small" as const },
    { delay: 4.5, duration: 13, startX: 38, startY: 92, glowIntensity: 0.6, size: "medium" as const },
    { delay: 2.8, duration: 9, startX: 58, startY: 28, glowIntensity: 0.5, size: "small" as const },
    { delay: 4.2, duration: 10, startX: 32, startY: 52, glowIntensity: 0.65, size: "large" as const },
    { delay: 1.5, duration: 11, startX: 68, startY: 48, glowIntensity: 0.4, size: "medium" as const },
    { delay: 5.0, duration: 9, startX: 18, startY: 22, glowIntensity: 0.55, size: "small" as const },
    { delay: 3.2, duration: 12, startX: 78, startY: 18, glowIntensity: 0.5, size: "medium" as const },
  ];

  return (
    <div ref={ref} className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <style>{`
        @keyframes float-card {
          0%, 100% {
            transform: translateY(0px) rotate(-2deg) scale(1);
            opacity: 0.2;
          }
          25% {
            transform: translateY(-25px) rotate(3deg) scale(1.02);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-12px) rotate(-1deg) scale(1);
            opacity: 0.25;
          }
          75% {
            transform: translateY(-30px) rotate(4deg) scale(1.03);
            opacity: 0.4;
          }
        }
        @keyframes glow-pulse {
          0%, 100% {
            filter: brightness(1) drop-shadow(0 0 8px hsla(0, 70%, 50%, 0.4));
          }
          50% {
            filter: brightness(1.3) drop-shadow(0 0 25px hsla(0, 70%, 50%, 0.7));
          }
        }
      `}</style>
      {cards.map((card, index) => (
        <MiniCreditCard key={index} {...card} />
      ))}
    </div>
  );
});

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
