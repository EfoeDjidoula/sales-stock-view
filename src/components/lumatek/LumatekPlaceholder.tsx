import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const LumatekPlaceholder = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <Card className="border-dashed border-indigo-500/40 bg-indigo-500/5">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Construction className="h-5 w-5 text-indigo-400" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      <p className="text-sm font-medium text-indigo-300">Module en préparation</p>
      <p className="text-sm text-muted-foreground">
        {description || "Ce module sera disponible dans une prochaine version de la plateforme LUMATEK SaaS."}
      </p>
    </CardContent>
  </Card>
);
