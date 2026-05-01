import { Badge } from "@/components/ui/badge";
import { Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export const DOCUMENT_FOLDERS = [
  { id: "general", label: "Все документы" },
  { id: "military", label: "Военкомат" },
  { id: "hospital", label: "Больница" },
  { id: "examination", label: "Обследования" },
  { id: "certificates", label: "Справки" },
  { id: "appeals", label: "Жалобы" },
];

interface DocumentFolderFilterProps {
  activeFolder: string;
  onSelect: (folder: string) => void;
  counts?: Record<string, number>;
}

export default function DocumentFolderFilter({ activeFolder, onSelect, counts = {} }: DocumentFolderFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {DOCUMENT_FOLDERS.map(({ id, label }) => {
        const isActive = activeFolder === id;
        const count = id === "general" ? undefined : counts[id];
        return (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground"
            )}
          >
            {isActive ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
            {label}
            {count !== undefined && count > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
                {count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
