import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STALE_MIN = 30;
const color = (t: Row, ageMin: number) =>
  t.status === "incident" ? "hsl(var(--destructive))" : ageMin > STALE_MIN ? "hsl(var(--warning, 38 92% 50%))" : "hsl(142 70% 45%)";

export const LogisticsMap = ({ trips, vehicles, drivers, L, scopeQuery }: {
  trips: Row[]; vehicles: Row[]; drivers: Row[];
  L: (fr: string, en: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scopeQuery: (q: any) => any;
}) => {
  const [positions, setPositions] = useState<Row[]>([]);
  const [tripId, setTripId] = useState<string>("all");

  useEffect(() => {
    scopeQuery(db.from("logistics_gps_positions").select("*")).order("recorded_at", { ascending: false }).limit(1000)
      .then(({ data }: Row) => setPositions(data ?? []));
  }, [scopeQuery, trips]);

  const reg = (id?: string) => vehicles.find((v) => v.id === id)?.registration ?? "—";
  const drv = (id?: string) => drivers.find((v) => v.id === id)?.full_name ?? "—";
  const located = trips.filter((t) => t.last_position && t.status !== "delivered");
  const track = useMemo(() => positions.filter((p) => p.trip_id === tripId).reverse(), [positions, tripId]);
  const center: [number, number] = located[0]
    ? [Number(located[0].last_position.latitude), Number(located[0].last_position.longitude)]
    : [9.3, 2.3]; // Bénin par défaut
  const lastSeen = (vid: string) => positions.find((p) => p.vehicle_id === vid)?.recorded_at;
  const ago = (d?: string) => (d ? Math.round((Date.now() - new Date(d).getTime()) / 60000) : Infinity);

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{L("Carte de la flotte en mission", "Fleet map")}</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "hsl(142 70% 45%)" }} />{L("En route", "Moving")}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: "hsl(38 92% 50%)" }} />{L(`Sans signal > ${STALE_MIN} min`, `No signal > ${STALE_MIN} min`)}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-destructive" />{L("Incident", "Incident")}</span>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{L("Tous les transports", "All trips")}</SelectItem>
                {trips.map((t) => <SelectItem key={t.id} value={t.id}>{t.reference}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[460px] rounded-lg overflow-hidden border border-border relative z-0">
            <MapContainer key={center.join()} center={center} zoom={7} className="h-full w-full">
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {located.filter((t) => tripId === "all" || t.id === tripId).map((t) => {
                const p = t.last_position;
                const age = ago(p.recorded_at);
                return (
                  <CircleMarker key={t.id} center={[Number(p.latitude), Number(p.longitude)]} radius={10}
                    pathOptions={{ color: color(t, age), fillColor: color(t, age), fillOpacity: 0.8 }}>
                    <Popup>
                      <b>{t.reference}</b><br />{reg(t.truck_id)}{t.tanker_id && ` + ${reg(t.tanker_id)}`}<br />
                      {L("Chauffeur", "Driver")} : {drv(t.driver_id)}<br />
                      {L("Chargé", "Loaded")} : {t.qty_loaded ?? "—"} L<br />
                      {L("Mise à jour", "Updated")} : {p.recorded_at ? format(new Date(p.recorded_at), "dd/MM HH:mm") : "—"}
                    </Popup>
                  </CircleMarker>
                );
              })}
              {track.length > 1 && <Polyline positions={track.map((p) => [Number(p.latitude), Number(p.longitude)] as [number, number])} pathOptions={{ color: "hsl(var(--primary))", weight: 4 }} />}
              {track.map((p) => <CircleMarker key={p.id} center={[Number(p.latitude), Number(p.longitude)]} radius={4} pathOptions={{ color: "hsl(var(--primary))" }} />)}
            </MapContainer>
          </div>
          {located.length === 0 && <p className="text-xs text-muted-foreground mt-2">{L("Aucune position reçue. Utilisez le bouton de position sur un transport, ou branchez un boîtier GPS plus tard.", "No position received yet. Use the position button on a trip, or connect a GPS device later.")}</p>}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">{L("Relevés de position", "Position log")}{tripId !== "all" && ` — ${trips.find((t) => t.id === tripId)?.reference}`}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto max-h-80 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{L("Date", "Date")}</TableHead><TableHead>{L("Coordonnées", "Coordinates")}</TableHead><TableHead>km/h</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
              <TableBody>
                {(tripId === "all" ? positions : [...track].reverse()).slice(0, 100).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{format(new Date(p.recorded_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="text-xs font-mono">{Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}</TableCell>
                    <TableCell>{p.speed_kmh ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{p.source}</Badge></TableCell>
                  </TableRow>
                ))}
                {positions.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{L("Aucun relevé", "No records")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">{L("Boîtiers GPS des véhicules", "Vehicle GPS devices")}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto max-h-80 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{L("Véhicule", "Vehicle")}</TableHead><TableHead>{L("Boîtier", "Device")}</TableHead><TableHead>{L("Dernier signal", "Last signal")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {vehicles.filter((v) => v.kind !== "tanker").map((v) => {
                  const ls = lastSeen(v.id); const a = ago(ls);
                  return (
                    <TableRow key={v.id}>
                      <TableCell>{v.registration}</TableCell>
                      <TableCell>{v.gps_device_id ? <Badge variant="outline">{v.gps_device_id}</Badge> : <span className="text-muted-foreground text-xs">{L("Non équipé", "Not equipped")}</span>}</TableCell>
                      <TableCell className="text-xs">{ls ? <Badge variant={a > STALE_MIN ? "destructive" : "default"}>{a < 60 ? `${a} min` : `${Math.round(a / 60)} h`}</Badge> : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
