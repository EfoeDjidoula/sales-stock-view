import { User, LogOut, Settings, Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const ROLE_CONFIG = {
  admin: {
    label: "Administrateur",
    icon: ShieldAlert,
    variant: "destructive" as const,
  },
  manager: {
    label: "Manager",
    icon: ShieldCheck,
    variant: "default" as const,
  },
  operator: {
    label: "Opérateur",
    icon: Shield,
    variant: "secondary" as const,
  },
};

export const ProfileMenu = () => {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { currentUserRole } = useUserRoles();

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Utilisateur";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleConfig = currentUserRole ? ROLE_CONFIG[currentUserRole] : null;
  const RoleIcon = roleConfig?.icon || Shield;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-2 h-10 hover:bg-secondary"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline-block text-sm font-medium max-w-[120px] truncate">
            {displayName}
          </span>
          {roleConfig && (
            <Badge variant={roleConfig.variant} className="hidden md:flex gap-1 text-xs">
              <RoleIcon className="w-3 h-3" />
              {roleConfig.label}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email}
            </p>
            {roleConfig && (
              <Badge variant={roleConfig.variant} className="w-fit gap-1 text-xs">
                <RoleIcon className="w-3 h-3" />
                {roleConfig.label}
              </Badge>
            )}
            {!roleConfig && (
              <Badge variant="outline" className="w-fit text-xs text-muted-foreground">
                Aucun rôle attribué
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <User className="w-4 h-4" />
          Mon profil
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 cursor-pointer">
          <Settings className="w-4 h-4" />
          Paramètres
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOut}
          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
