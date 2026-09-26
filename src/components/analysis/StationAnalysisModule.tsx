import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useStations } from "@/hooks/useStations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Download, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Row {
  date: string;
  superLiters: number;
  gasoilLiters: number;
  superStock: number;
  gasoilStock: number;
}
interface Result {
  summary: string;
  anomalies: { date: string; product: string; severity: string; title: string; detail: string }[];
  actions: { priority: number; title: string; detail: string }[];
}

const pos = (n: number) => (n > 0 ? n : 0);
const sevVariant = (s: string) => (s === "haute" ? "destructive" : s === "moyenne" ? "default" : "secondary");

export const StationAnalysisModule = () => {
  const { stations } = useStations();
  const today = format(new Date(), "yyyy-MM-dd");
  const [stationId, setStationId] = useState("");
  const [start, setStart] = useState(format(subDays(new Date(), 14), "yyyy-MM-dd"));
  const [end, setEnd] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId && stations?.length) setStationId(stations[0].id);
  }, [stations, stationId]);

  const loadFromEntries = async () => {
    if (!stationId) return;
    setLoadingData(true);
    setResult(null);
    const { data, error } = await supabase
      .from("index_entries")
      .select("*")
      .eq("station_id", stationId)
      .gte("entry_date", start)
      .lte("entry_date", end > today ? today : end)
      .order("entry_date");
    setLoadingData(false);
    if (error) return toast.error(`Chargement impossible : ${error.message}`);
    setRows(
      (data ?? []).map((e) => ({
        date: e.entry_date,
        superLiters: pos(e.super1_index_arrivee - e.super1_index_depart) + pos(e.super2_index_arrivee - e.super2_index_depart),
        gasoilLiters: pos(e.gasoil1_index_arrivee - e.gasoil1_index_depart) + pos(e.gasoil2_index_arrivee - e.gasoil2_index_depart),
        superStock: (e.super1_jauge ?? 0) + (e.super2_jauge ?? 0),
        gasoilStock: (e.gasoil1_jauge ?? 0) + (e.gasoil2_jauge ?? 0),
      }))
    );
    if (!data?.length) toast.info("Aucune saisie sur cette période : ajoutez les jours manuellement.");
  };

  const updateRow = (i: number, key: keyof Row, value: string) =>
    setRows((r) =>
      r.map((row, idx) =>
        idx === i ? { ...row, [key]: key === "date" ? value : Math.max(0, Number(value) || 0) } : row
      )
    );

  const addRow = () =>
    setRows((r) => [...r, { date: end, superLiters: 0, gasoilLiters: 0, superStock: 0, gasoilStock: 0 }]);

  const analyze = async () => {
    setError(null);
    setResult(null);
    if (rows.length < 2) return setError("Fournissez au moins 2 jours de données.");
    setAnalyzing(true);
    const stationName = stations?.find((s) => s.id === stationId)?.name ?? "";
    const { data, error } = await supabase.functions.invoke("analyze-station", {
      body: { stationName, start, end, rows },
    });
    setAnalyzing(false);
    if (error) {
      let msg = "Analyse impossible.";
      try {
        const ctx = await (error as any).context?.json?.();
        if (ctx?.error) msg = ctx.error;
      } catch { /* ignore */ }
      return setError(msg);
    }
    if (data?.error) return setError(data.error);
    setResult(data as Result);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Analyse IA des anomalies
          </CardTitle>
          <CardDescription>
            Choisissez une station et une période, vérifiez ou complétez les ventes et niveaux de stock, puis lancez l'analyse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div className="space-y-1">
              <Label>Station</Label>
              <Select value={stationId} onValueChange={setStationId}>
                <SelectTrigger><SelectValue placeholder="Station" /></SelectTrigger>
                <SelectContent>
                  {stations?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Du</Label>
              <Input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Au</Label>
              <Input type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <Button variant="outline" onClick={loadFromEntries} disabled={!stationId || loadingData} className="gap-2">
              {loadingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Charger les saisies
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Ventes Super (L)</th>
                  <th className="p-2 text-left">Ventes Gasoil (L)</th>
                  <th className="p-2 text-left">Stock Super (L)</th>
                  <th className="p-2 text-left">Stock Gasoil (L)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-1"><Input type="date" value={r.date} max={today} onChange={(e) => updateRow(i, "date", e.target.value)} /></td>
                    {(["superLiters", "gasoilLiters", "superStock", "gasoilStock"] as const).map((k) => (
                      <td key={k} className="p-1">
                        <Input type="number" min={0} value={r[k]} onChange={(e) => updateRow(i, k, e.target.value)} />
                      </td>
                    ))}
                    <td className="p-1">
                      <Button size="icon" variant="ghost" aria-label="Supprimer la ligne" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Aucune donnée. Chargez les saisies ou ajoutez des jours.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 justify-between">
            <Button variant="ghost" onClick={addRow}>+ Ajouter un jour</Button>
            <Button onClick={analyze} disabled={analyzing || rows.length < 2} className="gap-2">
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {analyzing ? "Analyse en cours..." : "Analyser"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader><CardTitle>Synthèse</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{result.summary}</p></CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader><CardTitle>Anomalies détectées</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result.anomalies.length === 0 && <p className="text-sm text-muted-foreground">Aucune anomalie notable.</p>}
              {result.anomalies.map((a, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sevVariant(a.severity) as any}>{a.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{a.date} · {a.product}</span>
                  </div>
                  <p className="font-medium text-sm">{a.title}</p>
                  <p className="text-sm text-muted-foreground">{a.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardHeader><CardTitle>Actions prioritaires</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {result.actions.map((a, i) => (
                <div key={i} className="flex gap-3 rounded-lg border border-border p-3">
                  <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-sm font-bold">
                    {a.priority ?? i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-sm">{a.title}</p>
                    <p className="text-sm text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
