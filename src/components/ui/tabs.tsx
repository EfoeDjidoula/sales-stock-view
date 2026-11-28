import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const PermissionContext = React.createContext<Record<string, string>>({});
type TabsProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & { permissionMap?: Record<string, string> };
const Tabs = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Root>, TabsProps>(
  ({ permissionMap = {}, value, defaultValue, ...props }, ref) => {
    const { can } = usePermissions();
    const firstAllowed = Object.entries(permissionMap).find(([, code]) => can(code))?.[0];
    const allowedValue = (v?: string) => v && permissionMap[v] && !can(permissionMap[v]) ? firstAllowed : v;
    return <PermissionContext.Provider value={permissionMap}><TabsPrimitive.Root ref={ref} value={allowedValue(value)} defaultValue={allowedValue(defaultValue)} {...props} /></PermissionContext.Provider>;
  },
);
Tabs.displayName = "Tabs";

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground max-md:!flex max-md:!h-auto max-md:!flex-nowrap max-md:!justify-start max-md:w-full max-md:max-w-full max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const map = React.useContext(PermissionContext);
  const { can } = usePermissions();
  if (map[props.value] && !can(map[props.value])) return null;
  return (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 max-md:shrink-0 max-md:min-h-9 text-sm font-medium ring-offset-background transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
); });
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => {
  const map = React.useContext(PermissionContext);
  const { can } = usePermissions();
  if (map[props.value] && !can(map[props.value])) return null;
  return (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
); });
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
