import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLumatekStats } from "@/hooks/useLumatekStats";
import {
  Building2,
  CheckCircle2,
  PauseCircle,
  Users,
  Globe2,
  Fuel,
  KeyRound,
  Activity,
} from "lucide-react";

const StatCard = ({
  label,
  value,
  icon: Icon,
  hint,
  loading,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hint?: string;
  loading?: boolean;
}) => (
  <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-transparent">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <p className="text-3xl font-semibold">{value}</p>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-lg bg-indigo-500/15 p-2">
          <Icon className="h-5 w-5 text-indigo-300" />
        </div>
      </div>
    </CardContent>
  </Card>
);

export const LumatekDashboard = () => {
  const { data, isLoading } = useLumatekStats();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clients (total)" value={data?.totalTenants ?? 0} icon={Building2} loading={isLoading} />
        <StatCard label="Clients actifs" value={data?.activeTenants ?? 0} icon={CheckCircle2} loading={isLoading} />
        <StatCard
          label="Clients suspendus"
          value={data?.suspendedTenants ?? 0}
          icon={PauseCircle}
          hint={`${data?.archivedTenants ?? 0} archivé(s)`}
          loading={isLoading}
        />
        <StatCard
          label="Utilisateurs"
          value={data?.totalUsers ?? 0}
          icon={Users}
          hint={`${data?.activeUsers ?? 0} actif(s)`}
          loading={isLoading}
        />
        <StatCard label="Pays actifs" value={data?.activeCountries ?? 0} icon={Globe2} loading={isLoading} />
        <StatCard label="Stations" value={data?.totalStations ?? 0} icon={Fuel} loading={isLoading} />
        <StatCard label="Licences actives" value="—" icon={KeyRound} hint="Module en préparation" />
        <StatCard label="Contrats actifs" value="—" icon={KeyRound} hint="Module en préparation" />
      </div>

      <Card className="border-indigo-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-indigo-300" />
            Activité récente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : data?.activity.length ? (
            data.activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-indigo-500/40 text-indigo-300">
                    {item.label}
                  </Badge>
                  <span className="text-sm">{item.detail}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucune activité récente.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
