import { Check, ChevronDown, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCountry } from "@/hooks/useCountry";

export const CountrySwitcher = () => {
  const { country, countries, setCountryId } = useCountry();

  if (!country) return null;

  const single = countries.length <= 1;

  const content = (
    <span className="flex items-center gap-2">
      <span className="text-lg leading-none" aria-hidden="true">
        {country.flag || "🏳️"}
      </span>
      <span className="font-medium">{country.name}</span>
      {!single && <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </span>
  );

  if (single) {
    return (
      <div className="flex items-center gap-2 text-sm bg-secondary px-3 py-2 rounded-lg">
        <Globe className="w-4 h-4 text-muted-foreground" />
        {content}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" aria-label="Changer de pays">
          {content}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50 w-56">
        <DropdownMenuLabel>Pays autorisés</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {countries.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => setCountryId(c.id)}
            className="gap-2 cursor-pointer"
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {c.flag || "🏳️"}
            </span>
            <span className="flex-1">{c.name}</span>
            {c.id === country.id && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
