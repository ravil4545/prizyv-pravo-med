import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
}: EmptyStateProps) {
  const sizes = {
    sm: { wrap: "py-8", icon: "h-10 w-10 mb-3", title: "text-base", desc: "text-sm" },
    md: { wrap: "py-12", icon: "h-12 w-12 mb-4", title: "text-lg", desc: "text-sm" },
    lg: { wrap: "py-16", icon: "h-14 w-14 mb-5", title: "text-xl", desc: "text-base" },
  }[size];

  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-4", sizes.wrap, className)}>
      <div className={cn("rounded-full bg-primary/8 flex items-center justify-center", sizes.icon)}>
        <Icon className="h-1/2 w-1/2 text-primary/60" />
      </div>
      <h3 className={cn("font-semibold text-foreground", sizes.title)}>{title}</h3>
      {description && (
        <p className={cn("text-muted-foreground mt-1.5 max-w-sm", sizes.desc)}>{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-5">
          {action && (
            <Button onClick={action.onClick} className="gap-2">
              {action.icon && <action.icon className="h-4 w-4" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick} className="text-muted-foreground">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
