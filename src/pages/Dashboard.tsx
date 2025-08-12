import { useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";

const TradingView = () => {
  return (
    <div className="w-full h-[480px] rounded-lg overflow-hidden glass-panel">
      <iframe
        title="BTCUSDT Chart"
        loading="lazy"
        className="w-full h-full"
        src="https://s.tradingview.com/widgetembed/?symbol=BINANCE:BTCUSDT&interval=60&hidesidetoolbar=1&symboledit=1&saveimage=1&hideideas=1&theme=dark&style=1&timezone=Etc%2FUTC"
      />
    </div>
  );
};

const useBinanceTicker = (symbol: string) => {
  const [price, setPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const stream = `${symbol.toLowerCase()}@trade`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.p) setPrice(parseFloat(data.p));
      } catch {}
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [symbol]);

  return price;
};

const PriceCard = ({ symbol }: { symbol: string }) => {
  const price = useBinanceTicker(symbol);
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => { if (price) setPrev(price); }, [price]);
  const trend = useMemo(() => {
    if (!price || !prev) return 0;
    return price - prev;
  }, [price, prev]);

  const trendColor = trend > 0 ? "text-accent" : trend < 0 ? "text-destructive" : "text-foreground";

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Live</p>
          <h3 className="text-lg font-semibold">{symbol.toUpperCase()}</h3>
        </div>
        <div className={`text-2xl font-bold ${trendColor}`}>{price ? price.toFixed(2) : "—"}</div>
      </div>
    </div>
  );
};

const Dashboard = () => {
  useEffect(() => {
    document.title = "Dashboard — Galaxy Trader";
  }, []);

  return (
    <div className="min-h-screen bg-cosmic">
      <Navbar />
      <main className="container mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TradingView />
          </div>
          <div className="space-y-4">
            <PriceCard symbol="btcusdt" />
            <PriceCard symbol="ethusdt" />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
