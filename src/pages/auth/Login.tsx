import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { sendEmailVerification } from "firebase/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Minimum 6 characters"),
});

type FormValues = z.infer<typeof schema>;

const Login = () => {
  const { signIn, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [resending, setResending] = useState(false);

  useEffect(() => {
    document.title = "Sign in — Galaxy Trader";
  }, []);

  useEffect(() => {
    if (user && user.emailVerified) {
      const from = (location.state as any)?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [user, location.state, navigate]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const u = await signIn(values.email, values.password);
      if (u && !u.emailVerified) {
        toast("Please verify your email to continue.");
      } else {
        navigate("/dashboard");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to sign in");
    }
  };

  const showVerifyBanner = useMemo(() => params.get("verify") || params.get("checkEmail"), [params]);

  const resend = async () => {
    if (!user) return;
    setResending(true);
    try {
      await sendEmailVerification(user);
      toast.success("Verification email sent.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send verification");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-cosmic grid place-items-center px-6">
      <Card className="w-full max-w-md glass-panel">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          {showVerifyBanner && (
            <div className="mb-4 glass-panel p-3">
              <p className="text-sm">Verify your email to access the dashboard.</p>
              {user && (
                <Button variant="secondary" size="sm" onClick={resend} disabled={resending} className="mt-2">
                  {resending ? "Sending..." : "Resend verification"}
                </Button>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input placeholder="Email" type="email" {...register("email")} />
              {errors.email && <p className="text-destructive text-sm mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Input placeholder="Password" type="password" {...register("password")} />
              {errors.password && <p className="text-destructive text-sm mt-1">{errors.password.message}</p>}
            </div>
            <Button variant="hero" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={async () => {
              try {
                const u = await signInWithGoogle();
                if (u && u.emailVerified) navigate("/dashboard");
              } catch (e: any) {
                toast.error(e?.message || "Google sign-in failed");
              }
            }}>
              Continue with Google
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              New here? <Link to="/auth/register" className="story-link">Create an account</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
