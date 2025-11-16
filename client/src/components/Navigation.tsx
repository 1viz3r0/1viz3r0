import { Button } from "@/components/ui/button";

export default function Navigation() {
  const navItems = ['HOME', 'ABOUT US', 'PROGRAMS', 'PARTNERS'];

  return (
    <nav className="fixed top-8 left-0 right-0 z-50 pointer-events-none">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between">
          {/* Main navigation links - grouped pill container */}
          <div className="flex-1 flex justify-center pointer-events-auto">
            <div className="flex items-center gap-1 px-6 py-3 bg-card/80 backdrop-blur-md rounded-full border border-border/30 shadow-lg">
              {navItems.map((item) => (
                <a
                  key={item}
                  href="#"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted/50"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
          
          {/* Auth buttons - right side */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <a
              href="#"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              LOGIN
            </a>
            <Button 
              className="bg-card hover:bg-muted text-foreground font-semibold px-6 py-2 rounded-full shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] border border-border transition-all"
            >
              REGISTER
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
