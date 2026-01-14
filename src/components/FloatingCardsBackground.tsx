import { forwardRef } from "react";
import { CreditCard, User, Lock, Shield, Wallet, Key, Database, Fingerprint } from "lucide-react";

// Floating card component
const FloatingCard = ({ 
  icon: Icon, 
  delay, 
  duration, 
  startX, 
  startY,
  glowIntensity = 0.3
}: { 
  icon: React.ElementType; 
  delay: number; 
  duration: number; 
  startX: number; 
  startY: number;
  glowIntensity?: number;
}) => (
  <div
    className="absolute pointer-events-none"
    style={{
      left: `${startX}%`,
      top: `${startY}%`,
      animation: `float-card ${duration}s ease-in-out infinite, glow-pulse ${duration * 0.5}s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    }}
  >
    <div 
      className="w-16 h-20 bg-card/30 backdrop-blur-sm rounded-lg border border-destructive/20 flex items-center justify-center transition-shadow duration-1000"
      style={{
        boxShadow: `0 0 20px hsla(0, 70%, 50%, ${glowIntensity}), 0 0 40px hsla(0, 70%, 50%, ${glowIntensity * 0.5}), inset 0 0 15px hsla(0, 70%, 50%, ${glowIntensity * 0.3})`,
      }}
    >
      <Icon className="h-6 w-6 text-destructive/70 drop-shadow-[0_0_8px_hsla(0,70%,50%,0.5)]" />
    </div>
  </div>
);

// Background floating cards
const FloatingCardsBackground = forwardRef<HTMLDivElement>((_, ref) => {
  const cards = [
    { icon: CreditCard, delay: 0, duration: 8, startX: 5, startY: 10, glowIntensity: 0.25 },
    { icon: User, delay: 1.5, duration: 10, startX: 85, startY: 15, glowIntensity: 0.3 },
    { icon: Lock, delay: 3, duration: 7, startX: 15, startY: 70, glowIntensity: 0.35 },
    { icon: Shield, delay: 2, duration: 9, startX: 80, startY: 65, glowIntensity: 0.25 },
    { icon: CreditCard, delay: 4, duration: 11, startX: 50, startY: 5, glowIntensity: 0.4 },
    { icon: User, delay: 0.5, duration: 8, startX: 25, startY: 85, glowIntensity: 0.3 },
    { icon: Lock, delay: 2.5, duration: 10, startX: 70, startY: 80, glowIntensity: 0.25 },
    { icon: Shield, delay: 1, duration: 9, startX: 10, startY: 40, glowIntensity: 0.35 },
    { icon: Wallet, delay: 3.5, duration: 7, startX: 90, startY: 40, glowIntensity: 0.3 },
    { icon: Key, delay: 5, duration: 12, startX: 40, startY: 90, glowIntensity: 0.25 },
    { icon: Database, delay: 2.2, duration: 9, startX: 60, startY: 25, glowIntensity: 0.3 },
    { icon: Fingerprint, delay: 4.5, duration: 8, startX: 35, startY: 55, glowIntensity: 0.35 },
  ];

  return (
    <div ref={ref} className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <style>{`
        @keyframes float-card {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
            opacity: 0.15;
          }
          25% {
            transform: translateY(-20px) rotate(5deg);
            opacity: 0.25;
          }
          50% {
            transform: translateY(-10px) rotate(-3deg);
            opacity: 0.2;
          }
          75% {
            transform: translateY(-25px) rotate(3deg);
            opacity: 0.3;
          }
        }
        @keyframes glow-pulse {
          0%, 100% {
            filter: brightness(1) drop-shadow(0 0 10px hsla(0, 70%, 50%, 0.3));
          }
          50% {
            filter: brightness(1.2) drop-shadow(0 0 20px hsla(0, 70%, 50%, 0.5));
          }
        }
      `}</style>
      {cards.map((card, index) => (
        <FloatingCard key={index} {...card} />
      ))}
    </div>
  );
});

FloatingCardsBackground.displayName = "FloatingCardsBackground";

export default FloatingCardsBackground;
