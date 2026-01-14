import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { stations, Station, formatNumber } from "@/data/stationsData";
import { StationSelector } from "@/components/dashboard/StationSelector";
import {
  Fuel,
  Calendar,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Banknote,
  Smartphone,
  Building2,
  Receipt,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

// Schema for a single product entry
const productEntrySchema = z.object({
  indexArrivee: z
    .string()
    .min(1, "Index requis")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Doit être un nombre positif",
    }),
  indexDepart: z
    .string()
    .min(1, "Index requis")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Doit être un nombre positif",
    }),
  jaugeDuJour: z
    .string()
    .min(1, "Jauge requise")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
      message: "Doit être un nombre positif",
    }),
});

// Versement schema
const versementSchema = z.object({
  montant: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
  reference: z.string().optional(),
});

// Bon de valeur schema
const bonSchema = z.object({
  nombre: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseInt(val)) && parseInt(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
  valeurUnitaire: z
    .string()
    .refine((val) => val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
      message: "Doit être un nombre positif",
    }),
});

// Main form schema
const indexEntrySchema = z.object({
  date: z.string().min(1, "Date requise"),
  super1: productEntrySchema,
  super2: productEntrySchema,
  gasoil1: productEntrySchema,
  gasoil2: productEntrySchema,
  // Versements
  versementMomo: versementSchema,
  versementBanque: versementSchema,
  versementLiquidite: versementSchema,
  // Bons de valeur
  bonsCarburant: bonSchema,
  bonsEntreprise: bonSchema,
});

type IndexEntryForm = z.infer<typeof indexEntrySchema>;

const defaultValues: IndexEntryForm = {
  date: new Date().toISOString().split("T")[0],
  super1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  super2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil1: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  gasoil2: { indexArrivee: "", indexDepart: "", jaugeDuJour: "" },
  versementMomo: { montant: "", reference: "" },
  versementBanque: { montant: "", reference: "" },
  versementLiquidite: { montant: "", reference: "" },
  bonsCarburant: { nombre: "", valeurUnitaire: "" },
  bonsEntreprise: { nombre: "", valeurUnitaire: "" },
};

const IndexEntry = () => {
  const [selectedStation, setSelectedStation] = useState<Station | null>(
    stations[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<IndexEntryForm>({
    resolver: zodResolver(indexEntrySchema),
    defaultValues,
  });

  const onSubmit = async (data: IndexEntryForm) => {
    if (!selectedStation) {
      toast.error("Veuillez sélectionner une station");
      return;
    }

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Calculate quantities
    const super1Qty =
      parseFloat(data.super1.indexArrivee) -
      parseFloat(data.super1.indexDepart);
    const super2Qty =
      parseFloat(data.super2.indexArrivee) -
      parseFloat(data.super2.indexDepart);
    const gasoil1Qty =
      parseFloat(data.gasoil1.indexArrivee) -
      parseFloat(data.gasoil1.indexDepart);
    const gasoil2Qty =
      parseFloat(data.gasoil2.indexArrivee) -
      parseFloat(data.gasoil2.indexDepart);

    const totalSuper = super1Qty + super2Qty;
    const totalGasoil = gasoil1Qty + gasoil2Qty;

    toast.success(
      `Index enregistrés pour ${selectedStation.name}`,
      {
        description: `Super: ${formatNumber(totalSuper)} L | Gasoil: ${formatNumber(totalGasoil)} L`,
      }
    );

    setIsSubmitting(false);
    form.reset(defaultValues);
  };

  const ProductEntryCard = ({
    title,
    fieldPrefix,
    productType,
  }: {
    title: string;
    fieldPrefix: "super1" | "super2" | "gasoil1" | "gasoil2";
    productType: "super" | "gasoil";
  }) => {
    const colorClass = productType === "super" ? "super" : "gasoil";

    // Calculate quantity in real-time
    const indexArrivee = form.watch(`${fieldPrefix}.indexArrivee`);
    const indexDepart = form.watch(`${fieldPrefix}.indexDepart`);
    const quantity =
      indexArrivee && indexDepart
        ? parseFloat(indexArrivee) - parseFloat(indexDepart)
        : 0;

    return (
      <Card className="bg-card border-border hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full bg-${colorClass}`}
              />
              {title}
            </CardTitle>
            {quantity > 0 && (
              <span className="text-sm font-medium text-success">
                +{formatNumber(quantity)} L
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name={`${fieldPrefix}.indexDepart`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Index Départ
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="bg-secondary border-border"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`${fieldPrefix}.indexArrivee`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Index Arrivée
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="bg-secondary border-border"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name={`${fieldPrefix}.jaugeDuJour`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-muted-foreground">
                  Jauge du Jour (L)
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    placeholder="0"
                    className="bg-secondary border-border"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 glow-primary">
                  <Fuel className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-display font-bold">
                    Saisie des Index
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Enregistrement journalier
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StationSelector
                selectedStation={selectedStation}
                onSelect={(s) => s && setSelectedStation(s)}
                showAll={false}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date Selection */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Date de Saisie
                </CardTitle>
                <CardDescription>
                  Sélectionnez la date pour laquelle vous saisissez les index
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="date"
                          className="w-full md:w-64 bg-secondary border-border"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Station Info */}
            {selectedStation && (
              <div className="bg-card rounded-xl border border-primary/30 p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Fuel className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold">
                    {selectedStation.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedStation.location} •{" "}
                    {selectedStation.currentStock.length} cuves
                  </p>
                </div>
              </div>
            )}

            {/* Super Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-super" />
                Carburant Super
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProductEntryCard
                  title="Super - Pompe 1 & 2"
                  fieldPrefix="super1"
                  productType="super"
                />
                <ProductEntryCard
                  title="Super - Pompe 3 & 4"
                  fieldPrefix="super2"
                  productType="super"
                />
              </div>
            </div>

            {/* Gasoil Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-display font-semibold flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gasoil" />
                Carburant Gasoil
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ProductEntryCard
                  title="Gasoil - Pompe 1 & 2"
                  fieldPrefix="gasoil1"
                  productType="gasoil"
                />
                <ProductEntryCard
                  title="Gasoil - Pompe 3 & 4"
                  fieldPrefix="gasoil2"
                  productType="gasoil"
                />
              </div>
            </div>

            {/* Versements Section */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Versements du Jour
                </CardTitle>
                <CardDescription>
                  Saisissez les versements effectués par mode de paiement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* MOMO */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-orange-400">
                      <Smartphone className="w-5 h-5" />
                      <span className="font-semibold">Mobile Money</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementMomo.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementMomo.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Référence
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="N° transaction"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Banque */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-blue-400">
                      <Building2 className="w-5 h-5" />
                      <span className="font-semibold">Virement Bancaire</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementBanque.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementBanque.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Référence
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="N° virement"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Liquidité */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-green-400">
                      <Banknote className="w-5 h-5" />
                      <span className="font-semibold">Espèces</span>
                    </div>
                    <FormField
                      control={form.control}
                      name="versementLiquidite.montant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Montant (FCFA)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              placeholder="0"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="versementLiquidite.reference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Note
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Observation"
                              className="bg-background border-border"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Total Versements */}
                {(() => {
                  const momo = parseFloat(form.watch("versementMomo.montant") || "0");
                  const banque = parseFloat(form.watch("versementBanque.montant") || "0");
                  const liquidite = parseFloat(form.watch("versementLiquidite.montant") || "0");
                  const total = momo + banque + liquidite;
                  return total > 0 ? (
                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                      <span className="text-sm font-medium">Total Versements</span>
                      <span className="text-lg font-bold text-primary">
                        {formatNumber(total)} FCFA
                      </span>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>

            {/* Bons de Valeur Section */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Bons de Valeur
                </CardTitle>
                <CardDescription>
                  Saisissez les bons de carburant et bons entreprise acceptés
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bons Carburant */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-super">
                      <Receipt className="w-5 h-5" />
                      <span className="font-semibold">Bons Carburant</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="bonsCarburant.nombre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Nombre
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bonsCarburant.valeurUnitaire"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Valeur unitaire (FCFA)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    {(() => {
                      const nombre = parseInt(form.watch("bonsCarburant.nombre") || "0");
                      const valeur = parseFloat(form.watch("bonsCarburant.valeurUnitaire") || "0");
                      const total = nombre * valeur;
                      return total > 0 ? (
                        <div className="text-sm text-right text-super font-medium">
                          Total: {formatNumber(total)} FCFA
                        </div>
                      ) : null;
                    })()}
                  </div>

                  {/* Bons Entreprise */}
                  <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2 text-gasoil">
                      <Receipt className="w-5 h-5" />
                      <span className="font-semibold">Bons Entreprise</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="bonsEntreprise.nombre"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Nombre
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="bonsEntreprise.valeurUnitaire"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">
                              Valeur unitaire (FCFA)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="1"
                                placeholder="0"
                                className="bg-background border-border"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    {(() => {
                      const nombre = parseInt(form.watch("bonsEntreprise.nombre") || "0");
                      const valeur = parseFloat(form.watch("bonsEntreprise.valeurUnitaire") || "0");
                      const total = nombre * valeur;
                      return total > 0 ? (
                        <div className="text-sm text-right text-gasoil font-medium">
                          Total: {formatNumber(total)} FCFA
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Total Bons */}
                {(() => {
                  const bonsCarburant = parseInt(form.watch("bonsCarburant.nombre") || "0") * parseFloat(form.watch("bonsCarburant.valeurUnitaire") || "0");
                  const bonsEntreprise = parseInt(form.watch("bonsEntreprise.nombre") || "0") * parseFloat(form.watch("bonsEntreprise.valeurUnitaire") || "0");
                  const total = bonsCarburant + bonsEntreprise;
                  return total > 0 ? (
                    <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                      <span className="text-sm font-medium">Total Bons de Valeur</span>
                      <span className="text-lg font-bold text-primary">
                        {formatNumber(total)} FCFA
                      </span>
                    </div>
                  ) : null;
                })()}
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="submit"
                size="lg"
                className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 mr-2" />
                    Enregistrer les Index
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => form.reset(defaultValues)}
                className="border-border"
              >
                Réinitialiser
              </Button>
            </div>

            {/* Form Status */}
            {form.formState.isSubmitSuccessful && (
              <div className="flex items-center gap-2 text-success bg-success/10 border border-success/30 rounded-lg p-4">
                <CheckCircle2 className="w-5 h-5" />
                <span>Les index ont été enregistrés avec succès</span>
              </div>
            )}

            {Object.keys(form.formState.errors).length > 0 && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                <AlertCircle className="w-5 h-5" />
                <span>
                  Veuillez corriger les erreurs dans le formulaire
                </span>
              </div>
            )}
          </form>
        </Form>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-8 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 YATT & CO ENERGY BENIN SA - Système de Gestion des Stations</p>
        </div>
      </footer>
    </div>
  );
};

export default IndexEntry;
