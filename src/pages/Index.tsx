import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import profileImage from "@/assets/profile.jpg";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection profileImage={profileImage} />
    </div>
  );
};

export default Index;
