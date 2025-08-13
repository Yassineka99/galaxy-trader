import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/galaxy-hero.jpg";
import { Link } from "react-router-dom";
import { 
  RocketIcon, 
  DiamondIcon, 
  BarChartIcon, 
  GiftIcon, 
  UsersIcon, 
  CalendarIcon, 
  BadgeCheckIcon,
  RefreshCwIcon
} from "lucide-react";

const Index = () => {
  useEffect(() => {
    document.title = "Galaxy Trader — AI-Powered Binance Predictions";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Earn real Binance USDT with AI-powered predictions. Get accurate buy/sell signals, complete tasks, and level up your trading experience.");
  }, []);

  const features = [
    {
      icon: <BarChartIcon className="w-6 h-6" />,
      title: "AI Market Predictions",
      description: "99.74% accurate buy/sell signals powered by advanced AI algorithms"
    },
    {
      icon: <DiamondIcon className="w-6 h-6" />,
      title: "Earn Diamonds & Credits",
      description: "Watch ads, refer friends, complete tasks to earn diamonds convertible to USDT"
    },
    {
      icon: <GiftIcon className="w-6 h-6" />,
      title: "Real Binance Cashouts",
      description: "Convert 1,000 diamonds to 5 USDT directly to your Binance wallet"
    },
    {
      icon: <UsersIcon className="w-6 h-6" />,
      title: "Referral Bonuses",
      description: "Earn up to 15 diamonds per referral + level-based rewards"
    },
    {
      icon: <CalendarIcon className="w-6 h-6" />,
      title: "Daily Streaks",
      description: "Earn up to 5 diamonds/day with consecutive logins"
    },
    {
      icon: <BadgeCheckIcon className="w-6 h-6" />,
      title: "VIP Benefits",
      description: "+50% diamonds on all activities for $4.99/month"
    },
    {
      icon: <RefreshCwIcon className="w-6 h-6" />,
      title: "Daily/Weekly Tasks",
      description: "Complete challenges for bonus diamond rewards"
    },
    {
      icon: <RocketIcon className="w-6 h-6" />,
      title: "100-Level Progression",
      description: "Increase diamond earnings as you level up (up to 5x more)"
    }
  ];

  return (
    <div className="bg-cosmic min-h-screen overflow-hidden">
      {/* Hero Section */}
      <header className="relative pt-24 pb-40">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroImage} 
            alt="Nebula galaxy fintech background" 
            className="w-full h-full object-cover opacity-40" 
            loading="eager" 
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cosmic"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-cosmic/90 via-transparent to-cosmic/90"></div>
        </div>

        <div className="relative container mx-auto px-6 z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-3 bg-primary/10 px-4 py-2 rounded-full mb-4">
                <DiamondIcon className="w-5 h-5 text-primary" />
                <span className="text-primary font-medium">Earn Real Binance USDT</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Trade Smarter, Earn More
                </span>
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl">
                Galaxy Trader gives you AI-powered Binance predictions with 
                <span className="font-semibold text-primary"> 99.74% accuracy</span>. 
                Convert your earnings to real Binance USDT or unlock premium signals.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link to="/auth/register" className="w-full sm:w-auto">
                  <Button 
                    variant="hero" 
                    size="lg" 
                    className="w-full group"
                  >
                    Start Earning Now
                    <RocketIcon className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link to="/auth/login" className="w-full sm:w-auto">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="w-full bg-transparent backdrop-blur-md"
                  >
                    Trading Dashboard
                  </Button>
                </Link>
              </div>
              
              <div className="flex flex-wrap gap-6 pt-6">
                <div className="flex items-center gap-2">
                  <DiamondIcon className="w-5 h-5 text-primary" />
                  <span>Convert Diamonds → USDT</span>
                </div>
                <div className="flex items-center gap-2">
                  <BarChartIcon className="w-5 h-5 text-primary" />
                  <span>Premium Predictions</span>
                </div>
                <div className="flex items-center gap-2">
                  <GiftIcon className="w-5 h-5 text-primary" />
                  <span>Level-Based Rewards</span>
                </div>
              </div>
            </div>
            
            <div className="animate-scale-in">
              <div className="galaxy-card bg-background/80 backdrop-blur-xl border border-accent/30 rounded-2xl p-8 shadow-2xl shadow-primary/10">
                <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  Your Path to Profits
                </h2>
                
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg mt-1">
                      <DiamondIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Earn Diamonds</h3>
                      <p className="text-muted-foreground">
                        Watch ads, complete tasks, refer friends, and maintain login streaks
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg mt-1">
                      <RefreshCwIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Convert to Credits</h3>
                      <p className="text-muted-foreground">
                        10 diamonds = 1 prediction (50 credits)
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg mt-1">
                      <BarChartIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Get AI Predictions</h3>
                      <p className="text-muted-foreground">
                        99.74% accurate buy/sell signals for Binance
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-2 rounded-lg mt-1">
                      <GiftIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Cash Out USDT</h3>
                      <p className="text-muted-foreground">
                        Convert 1,000 diamonds to 5 Binance USDT
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="relative py-24 bg-gradient-to-b from-cosmic to-cosmic-darker">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Galaxy Trader Ecosystem
              </span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Designed to keep you profitable whether you pay or play for free
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="galaxy-feature-card bg-background/70 backdrop-blur-lg border border-accent/20 rounded-xl p-6 hover:shadow-lg hover:shadow-primary/10 transition-all"
              >
                <div className="text-primary mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[url('@/assets/star-pattern.svg')] opacity-10"></div>
        </div>
        <div className="container mx-auto px-6 text-center relative z-10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Start Your <span className="text-primary">Profitable Journey</span> Today
            </h2>
            <p className="text-xl text-muted-foreground mb-10">
              Join thousands of traders maximizing their Binance profits with AI-powered precision
            </p>
            <Link to="/auth/register">
              <Button 
                variant="hero" 
                size="default"
                className="px-12 py-7 text-lg group"
              >
                Launch Your Trading Galaxy
                <RocketIcon className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground mt-6">
              Secure authentication • Email verification • Level-based rewards
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;