import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Fuel, LogIn, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextParam = params.get("next");
  const redirectTo =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";
  const { signIn } = useAuth();
  const { t, language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaLoadError, setCaptchaLoadError] = useState(false);

  const enter = () => {
    if (splashLeaving) return;
    setSplashLeaving(true);
    setTimeout(() => setShowSplash(false), 700);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaToken) {
      toast.error(t("Veuillez confirmer que vous n'êtes pas un robot"));
      return;
    }
    setIsLoading(true);

    const { data: check, error: checkError } = await supabase.functions.invoke("verify-turnstile", {
      body: { token: captchaToken },
    });
    // Un jeton Turnstile n'est utilisable qu'une seule fois : on le régénère.
    setCaptchaReset((n) => n + 1);
    if (checkError || !check?.success) {
      toast.error(t("Vérification anti-robot échouée"), {
        description: t("Veuillez réessayer la vérification."),
      });
      setIsLoading(false);
      return;
    }

    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
       toast.error(t("Erreur de connexion"), {
        description: error.message,
      });
    } else {
       toast.success(t("Connexion réussie"));
      navigate(redirectTo);
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {showSplash && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Entrer"
          onClick={enter}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && enter()}
          className={`fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-6 bg-background px-6 text-center transition-opacity duration-700 ${splashLeaving ? "opacity-0" : "opacity-100 animate-fade-in"}`}
        >
          <img src="/email/lumatek-logo.png" alt="LUMATEK TECHNOLOGY" className="h-24 w-24 object-contain" />
          <h1 className="font-display text-3xl font-bold tracking-wide text-primary sm:text-5xl">LUMATEK TECHNOLOGY</h1>
          <p className="max-w-xl text-lg italic text-muted-foreground sm:text-xl">COMMITED TO A DATA DRIVEN DECISION MAKING !!!</p>
        </div>
      )}
      <div className={`w-full max-w-md space-y-6 transition-opacity duration-700 ${showSplash && !splashLeaving ? "opacity-0" : "opacity-100"}`}>
        <div className="flex justify-end"><LanguageSwitcher /></div>
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-primary/10 glow-primary">
            <Fuel className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold">
               {t("Gestion des stations-service")}
            </h1>
            <p className="text-sm text-muted-foreground">
               {t("Connectez-vous pour accéder à votre espace")}
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="w-5 h-5" />
               {t("Connexion")}
            </CardTitle>
            <CardDescription>
               {t("Connectez-vous avec vos identifiants fournis par l'administrateur.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="votre@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                 <Label htmlFor="login-password">{t("Mot de passe")}</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("Vérification anti-robot")}</Label>
                {!showSplash && (
                  <TurnstileWidget
                    onToken={setCaptchaToken}
                    resetKey={captchaReset}
                    language={language}
                    onLoadError={() => setCaptchaLoadError(true)}
                  />
                )}
                {captchaLoadError && (
                  <p className="text-xs text-destructive">
                    {t("Impossible de charger la vérification. Vérifiez votre connexion puis rechargez la page.")}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={isLoading || !captchaToken}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                     {t("Connexion...")}
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                     {t("Se connecter")}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by LUMATEK TECHNOLOGY
        </p>
      </div>
    </div>
  );
};

export default Auth;
