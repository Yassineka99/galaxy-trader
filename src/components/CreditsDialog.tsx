import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { db } from "@/integrations/firebase/config";
import { ref, runTransaction } from "firebase/database";
import { Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Offer {
  key: string;
  title: string;
  price: string;
  credits: number;
  description: string[];
  paypalUrl: string;
}

const offers: Offer[] = [
  {
    key: "small",
    title: "Small Pack",
    price: "$25",
    credits: 50,
    paypalUrl: "https://www.paypal.com/ncp/payment/B4CHYA7JUSW6U",
    description: [
      "Perfect for trying the app or making a quick single prediction.",
      "50 credits total",
      "Cost per prediction: 50 credits",
      "Ideal for first-time users",
    ],
  },
  {
    key: "starter",
    title: "Starter Pack",
    price: "$40",
    credits: 100,
    paypalUrl: "https://www.paypal.com/ncp/payment/GKT8V879P8H74",
    description: [
      "Great value for casual traders who want more than one shot.",
      "100 credits total (enough for 2 predictions)",
      "20% cheaper per credit than Small Pack",
      "Recommended for beginners looking to test strategies",
    ],
  },
  {
    key: "value",
    title: "Value Pack",
    price: "$100",
    credits: 350,
    paypalUrl: "https://www.paypal.com/ncp/payment/45JZLPTV7TGDL",
    description: [
      "The sweet spot for regular users, with big savings.",
      "350 credits total (enough for 7 predictions)",
      "40% cheaper per credit than Small Pack",
      "Best for consistent traders",
    ],
  },
  {
    key: "pro",
    title: "Pro Pack",
    price: "$185",
    credits: 750,
    paypalUrl: "https://www.paypal.com/ncp/payment/5VBYMZ6LZND7J",
    description: [
      "Maximum value for serious traders who want the most plays.",
      "750 credits total (enough for 15 predictions)",
      "50% cheaper per credit than Small Pack",
      "Perfect for high-frequency users",
    ],
  },
  {
    key: "master",
    title: "Master Pack",
    price: "$400",
    credits: 2000,
    paypalUrl: "https://www.paypal.com/ncp/payment/3RA5LXHSFDG5L",
    description: [
      "The ultimate bulk deal for professionals.",
      "2000 credits total (enough for 40 predictions)",
      "60% cheaper per credit than Small Pack",
      "Designed for traders who want long-term usage without reloading",
    ],
  },
];

const OfferCard = ({ offer }: { offer: Offer }) => {
  const { user } = useAuth();

  const addCredits = async (amount: number) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Please sign in to add credits.", variant: "destructive" });
      return;
    }
    try {
      await runTransaction(ref(db, `users/${user.uid}/credits`), (current) => {
        const value = typeof current === "number" ? current : 0;
        return value + amount;
      });
      toast({ title: "Credits added", description: `+${amount} credits added to your account (test).` });
    } catch (e) {
      toast({ title: "Update failed", description: "Couldn't add credits. Please try again.", variant: "destructive" });
    }
  };

  return (
    <article className="glass-panel p-5 rounded-lg flex flex-col justify-between">
      <header className="mb-3">
        <h3 className="text-lg font-semibold">{offer.title}</h3>
        <p className="text-sm text-muted-foreground">{offer.price} • {offer.credits} credits</p>
      </header>

      <ul className="text-sm space-y-1 mb-4 list-disc pl-5">
        {offer.description.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <form action={offer.paypalUrl} method="post" target="_blank">
          <Button type="submit" variant="secondary" aria-label={`Buy ${offer.title} with PayPal`}>
            Buy with PayPal
          </Button>
        </form>
        <Button onClick={() => addCredits(offer.credits)} aria-label={`Mark ${offer.title} as paid (test)`}>
          Mark as paid (test)
        </Button>
      </div>
    </article>
  );
};

export const CreditsDialogTrigger = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="Add credits">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Credits</DialogTitle>
          <DialogDescription>
            Test-only PayPal buttons. Complete payment in the new tab, then click "Mark as paid (test)" to add credits.
          </DialogDescription>
        </DialogHeader>
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {offers.map((o) => (
            <OfferCard offer={o} key={o.key} />
          ))}
        </section>
        <p className="text-xs text-muted-foreground mt-2">
          Note: This flow is for testing only and does not verify payments automatically.
        </p>
      </DialogContent>
    </Dialog>
  );
};
