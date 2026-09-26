import { AlertTriangle, Lock, ShieldX, Clock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLicenseState, alertThreshold } from "@/hooks/useLicenseState";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

/** Alertes de licence : J-60/J-30/J-15/J-7/Jour J, période de grâce, lecture seule. */
export const LicenseBanner = () => {
  const { state, mode } = useLicenseState();
  if (!state) return null;

  if (mode === "blocked") return null; // géré par LicenseBlockedScreen

  if (mode === "read_only" || mode === "limited") {
    const suspended = state.status === "suspended" || state.status === "terminated";
    return (
      <Alert variant="destructive" className="mb-4">
        <Lock className="h-4 w-4" />
        <AlertTitle>{suspended ? "Licence suspendue" : "Licence expirée"} — {mode === "limited" ? "accès limité" : "lecture seule"}</AlertTitle>
        <AlertDescription>
          Vos données restent consultables et ne sont jamais supprimées, mais les modifications sont bloquées.
          Contactez LUMATEK TECHNOLOGY pour renouveler ou réactiver votre licence.
        </AlertDescription>
      </Alert>
    );
  }

  if (mode === "grace") {
    return (
      <Alert variant="destructive" className="mb-4">
        <Clock className="h-4 w-4" />
        <AlertTitle>Licence expirée le {fmt(state.expiration_date)} — période de grâce</AlertTitle>
        <AlertDescription>
          L'accès complet est maintenu jusqu'au {fmt(state.grace_end)}. Au-delà, l'environnement passera en
          {state.expiry_policy === "limited" ? " accès limité" : " lecture seule"}.
        </AlertDescription>
      </Alert>
    );
  }

  const t = alertThreshold(state.days_left);
  if (t === null) return null;
  return (
    <Alert className="mb-4 border-amber-500/50 text-amber-400">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t === 0 ? "Votre licence expire aujourd'hui" : `Licence : expiration dans ${state.days_left} jour(s) (J-${t})`}</AlertTitle>
      <AlertDescription>
        Licence {state.license_number} ({state.plan_name}) valable jusqu'au {fmt(state.expiration_date)}. Pensez à la renouveler.
      </AlertDescription>
    </Alert>
  );
};

export const LicenseBlockedScreen = ({ onSignOut }: { onSignOut?: () => void }) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md text-center space-y-4">
      <ShieldX className="w-12 h-12 mx-auto text-destructive" />
      <h1 className="text-2xl font-display font-bold">Accès suspendu</h1>
      <p className="text-muted-foreground">
        Le compte de votre société est suspendu. Vos données sont conservées intégralement.
        Contactez LUMATEK TECHNOLOGY pour réactiver l'accès.
      </p>
      {onSignOut && (
        <button className="underline text-sm text-primary" onClick={onSignOut}>Se déconnecter</button>
      )}
    </div>
  </div>
);
