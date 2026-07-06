import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Fuel, Loader2, ShieldCheck } from "lucide-react";

// The Supabase OAuth namespace is beta; type a minimal local wrapper.
type OAuthNs = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

const oauth = (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Requête d'autorisation invalide (authorization_id manquant).");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("Aucune URL de redirection retournée par le serveur d'autorisation.");
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-primary/10 glow-primary">
            <Fuel className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-display font-bold">YATT & CO ENERGY</h1>
            <p className="text-sm text-muted-foreground">Autorisation d'accès</p>
          </div>
        </div>

        <Card className="bg-card border-border">
          {error ? (
            <>
              <CardHeader>
                <CardTitle className="text-destructive">Erreur</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </>
          ) : !details ? (
            <CardContent className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Connecter {details.client?.name ?? "une application"}
                </CardTitle>
                <CardDescription>
                  {details.client?.name ?? "Cette application"} pourra accéder à
                  vos données (stations, clients, fournisseurs, structures de
                  prix) en votre nom.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  disabled={busy}
                  onClick={() => decide(true)}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Autoriser"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => decide(false)}
                >
                  Refuser
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default OAuthConsent;
