import { useState } from "react";
import { useFiscalYears } from "@/hooks/useFiscalYears";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarCheck, CalendarX, Plus, Trash2, Lock, Unlock } from "lucide-react";

export function FiscalYearModule() {
  const { fiscalYears, isLoading, createFiscalYear, toggleFiscalYear, deleteFiscalYear } = useFiscalYears();
  const { currentUserRole } = useUserRoles();
  const isAdmin = currentUserRole === "admin";
  const [newYear, setNewYear] = useState(new Date().getFullYear().toString());

  const handleCreate = () => {
    const year = parseInt(newYear);
    if (isNaN(year) || year < 2000 || year > 2100) return;
    createFiscalYear.mutate(year);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Exercices comptables
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAdmin && (
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Année</label>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  className="w-32"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createFiscalYear.isPending}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Ouvrir un exercice
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : fiscalYears.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Aucun exercice comptable créé.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Année</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date d'ouverture</TableHead>
                    <TableHead>Date de clôture</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fiscalYears.map((fy) => (
                    <TableRow key={fy.id}>
                      <TableCell className="font-semibold text-foreground">{fy.year}</TableCell>
                      <TableCell>
                        <Badge
                          variant={fy.status === "open" ? "default" : "secondary"}
                          className={
                            fy.status === "open"
                              ? "bg-green-500/15 text-green-700 border-green-500/30"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {fy.status === "open" ? (
                            <><Unlock className="w-3 h-3 mr-1" /> Ouvert</>
                          ) : (
                            <><Lock className="w-3 h-3 mr-1" /> Clôturé</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(fy.opened_at).toLocaleDateString("fr-FR", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fy.closed_at
                          ? new Date(fy.closed_at).toLocaleDateString("fr-FR", {
                              day: "numeric", month: "long", year: "numeric",
                            })
                          : "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right space-x-2">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                disabled={toggleFiscalYear.isPending}
                              >
                                {fy.status === "open" ? (
                                  <><CalendarX className="w-3.5 h-3.5" /> Clôturer</>
                                ) : (
                                  <><CalendarCheck className="w-3.5 h-3.5" /> Réouvrir</>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {fy.status === "open"
                                    ? `Clôturer l'exercice ${fy.year} ?`
                                    : `Réouvrir l'exercice ${fy.year} ?`}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {fy.status === "open"
                                    ? "La clôture empêchera toute modification des données de cet exercice."
                                    : "La réouverture permettra de nouveau la modification des données."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    toggleFiscalYear.mutate({
                                      id: fy.id,
                                      newStatus: fy.status === "open" ? "closed" : "open",
                                    })
                                  }
                                >
                                  Confirmer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                disabled={deleteFiscalYear.isPending}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer l'exercice {fy.year} ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Cette action est irréversible.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteFiscalYear.mutate(fy.id)}
                                >
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
