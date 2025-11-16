import CyberScene from "@/components/CyberScene";
import Navigation from "@/components/Navigation";
import HeroContent from "@/components/HeroContent";

const Index = () => {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-background">
      <CyberScene />
      <Navigation />
      <HeroContent />
    </main>
  );
};

export default Index;
