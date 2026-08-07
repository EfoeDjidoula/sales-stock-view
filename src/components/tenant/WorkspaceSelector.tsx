import { Globe, ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCountry } from "@/hooks/useCountry";
import { useTenant } from "@/hooks/useTenant";

export const WorkspaceSelector = () => {
  const { countries, setCountryId } = useCountry();
  const { tenant } = useTenant();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-10">
          <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-4">
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold">
            Sélectionnez votre espace de travail
          </h1>
          <p className="text-muted-foreground mt-2">
            Choisissez le pays dans lequel vous souhaitez travailler.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <Card
              key={c.id}
              className="border-border bg-card hover:border-primary/60 transition-colors"
            >
              <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                <span className="text-5xl leading-none" aria-hidden="true">
                  {c.flag || "🏳️"}
                </span>
                <div>
                  <p className="text-lg font-semibold">{c.name}</p>
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {tenant?.trade_name || tenant?.name}
                  </p>
                </div>
                <Button className="w-full gap-2 mt-2" onClick={() => setCountryId(c.id)}>
                  Accéder
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
