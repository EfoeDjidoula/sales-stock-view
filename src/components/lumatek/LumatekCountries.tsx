import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const LumatekCountries = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["lumatek-countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("id, code, name, currency_code, vat_rate, locale, is_active")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card className="border-indigo-500/20">
      <CardHeader>
        <CardTitle className="text-base">Pays pris en charge</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Pays</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead>TVA</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data || []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.currency_code}</TableCell>
                  <TableCell>{Number(c.vat_rate)}%</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.is_active ? "border-emerald-500/30 text-emerald-400" : ""}>
                      {c.is_active ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
