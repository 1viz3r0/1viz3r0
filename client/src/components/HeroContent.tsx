import { Button } from "@/components/ui/button";

export default function HeroContent() {
  return (
    <div className="fixed inset-0 z-10 flex items-center pointer-events-none">
      <div className="container mx-auto px-4 md:px-8 lg:px-16">
        <div className="max-w-2xl pointer-events-auto">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-4 animate-fade-in">
            <span className="block text-foreground drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">
              Strengthening
            </span>
            <span className="block text-foreground drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] mt-2">
              Our India
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl leading-relaxed">
            Bridging the gap between theory and real-world in Modern{" "}
            <span className="text-foreground font-semibold">CyberEra</span>
          </p>
          
          <Button 
            size="lg"
            className="bg-card hover:bg-muted text-foreground font-bold text-lg px-8 py-6 border border-border shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all duration-300 hover:scale-105"
          >
            Learn More
          </Button>
        </div>
      </div>
    </div>
  );
}
