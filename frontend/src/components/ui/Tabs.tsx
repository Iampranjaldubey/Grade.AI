import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-edge",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-content-muted",
        "hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-safe:transition-colors",
        "data-[state=active]:border-brand data-[state=active]:text-content",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface-muted",
        className,
      )}
      {...props}
    />
  );
}
