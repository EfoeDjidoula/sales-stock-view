import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AccessDeniedProps {
  onGoBack?: () => void;
  message?: string;
}

export const AccessDenied = ({ 
  onGoBack, 
  message = "Vous n'avez pas les permissions nécessaires pour accéder à cette section." 
}: AccessDeniedProps) => {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="max-w-md w-full text-center border-destructive/20 bg-destructive/5">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 p-4 rounded-full bg-destructive/10">
            <ShieldX className="w-12 h-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl text-destructive">Accès Refusé</CardTitle>
          <CardDescription className="text-base mt-2">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Si vous pensez qu'il s'agit d'une erreur, veuillez contacter votre administrateur.
          </p>
          {onGoBack && (
            <Button onClick={onGoBack} variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Retour aux Ventes
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
