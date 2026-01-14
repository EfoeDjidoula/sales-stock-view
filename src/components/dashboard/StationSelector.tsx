import { stations, Station } from "@/data/stationsData";
import { cn } from "@/lib/utils";
import { MapPin, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StationSelectorProps {
  selectedStation: Station | null;
  onSelect: (station: Station | null) => void;
  showAll?: boolean;
}

export const StationSelector = ({
  selectedStation,
  onSelect,
  showAll = true,
}: StationSelectorProps) => {
  const handleChange = (value: string) => {
    if (value === "all") {
      onSelect(null);
    } else {
      const station = stations.find((s) => s.id === value);
      onSelect(station || null);
    }
  };

  return (
    <Select
      value={selectedStation?.id || "all"}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-[240px] bg-card border-border hover:border-primary/50 transition-colors">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <SelectValue placeholder="Sélectionner une station" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {showAll && (
          <SelectItem value="all" className="hover:bg-secondary focus:bg-secondary">
            <span className="font-medium">Toutes les stations</span>
          </SelectItem>
        )}
        {stations.map((station) => (
          <SelectItem
            key={station.id}
            value={station.id}
            className="hover:bg-secondary focus:bg-secondary"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{station.name}</span>
              <span className="text-xs text-muted-foreground">
                ({station.location})
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
