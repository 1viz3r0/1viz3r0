import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Lock, Eye, Zap, Shield } from 'lucide-react';
import Logo from '@/components/Logo';

const Index = () => {
  return (
    <div className="min-h-screen bg-transparent" style={{ position: "relative", zIndex: 10 }}>
      {/* Header */}
      <header className="bg-transparent" style={{ position: "relative", zIndex: 10 }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" />
            <div className="flex gap-4">
              <Link to="/login">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link to="/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center" style={{ position: "relative", zIndex: 10 }}>
        <h1 className="mb-6 text-5xl font-bold">
          Complete Security in One Extension
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-xl text-muted-foreground">
          Protect your browsing with real-time page scanning, download protection, 
          password monitoring, and more - all in one powerful browser extension.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/register">
            <Button size="lg">
              Get Started Free
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">
              Sign In
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20" style={{ position: "relative", zIndex: 10 }}>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold">Page Security</h3>
            <p className="text-muted-foreground">
              Real-time scanning powered by OWASP ZAP
            </p>
          </div>
          
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold">Download Protection</h3>
            <p className="text-muted-foreground">
              ClamAV integration for malware detection
            </p>
          </div>
          
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Eye className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold">Privacy Tools</h3>
            <p className="text-muted-foreground">
              Password checker and data cleanup
            </p>
          </div>
          
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold">Network Monitor</h3>
            <p className="text-muted-foreground">
              LibreSpeed integration for speed checks
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
