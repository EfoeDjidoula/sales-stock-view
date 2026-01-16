import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";
import { useStations } from "@/hooks/useIndexEntries";

interface DbStation {
  id: string;
  name: string;
  location: string;
}

interface DbStationSelectorProps {
  selectedStation: DbStation | null;
  onSelect: (station: DbStation | null) => void;
  showAll?: boolean;
}

export const DbStationSelector = ({
  selectedStation,
  onSelect,
  showAll = true,
}: DbStationSelectorProps) => {
  const { data: stations, isLoading } = useStations();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Chargement...</span>
      </div>
    );
  }

  return (
    <Select
      value={selectedStation?.id || (showAll ? "all" : "")}
      onValueChange={(value) => {
        if (value === "all") {
          onSelect(null);
        } else {
          const station = stations?.find((s) => s.id === value);
          if (station) {
            onSelect(station);
          }
        }
      }}
    >
      <SelectTrigger className="w-[220px] bg-secondary border-border">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <SelectValue placeholder="Sélectionner une station" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {showAll && (
          <SelectItem value="all" className="cursor-pointer">
            Toutes les stations
          </SelectItem>
        )}
        {stations?.map((station) => (
          <SelectItem
            key={station.id}
            value={station.id}
            className="cursor-pointer"
          >
            {station.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export type { DbStation };
