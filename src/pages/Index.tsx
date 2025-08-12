import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/galaxy-hero.jpg";
import { Link } from "react-router-dom";

const Index = () => {
  useEffect(() => {
    document.title = "Galaxy Trader — AI Binance Signals";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "AI-powered Binance buy/sell signals with 99.74% accuracy. Join now and trade smarter.");
  }, []);

  return (
    <header className="relative min-h-screen bg-cosmic overflow-hidden">
      <img src={heroImage} alt="Nebula galaxy fintech background" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40" loading="eager" />
      <div className="relative container mx-auto px-6 py-24 flex flex-col-reverse md:flex-row items-center gap-12">
        <div className="w-full md:w-1/2 space-y-6 animate-fade-in">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Galaxy Trader</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl">
            Predict the next move and trade smarter. Our AI-driven Binance signals boast an accuracy of <span className="font-semibold text-foreground">99.74%</span>.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Link to="/auth/register" className="w-full sm:w-auto">
              <Button variant="hero" size="lg" className="w-full">Join Now</Button>
            </Link>
            <Link to="/auth/login" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full">Sign In</Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">Secure authentication. Email verification required.</p>
        </div>
        <div className="w-full md:w-1/2 animate-scale-in">
          <div className="glass-panel p-6 md:p-8">
            <h2 className="text-xl font-semibold mb-2">Why Galaxy Trader?</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>AI-powered buy/sell signals</li>
              <li>Professional-grade charts and live data</li>
              <li>Fast, smooth, and responsive experience</li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Index;
