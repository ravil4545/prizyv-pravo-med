import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Phone, MessageCircle, Send, X, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const QuickActionFAB = () => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!isMobile) return null;

  // Hidden on certain pages
  const hiddenRoutes = ["/auth", "/login", "/register", "/reset-password", "/dashboard/ai-chat", "/dashboard/medical-documents"];
  if (hiddenRoutes.some(r => location.pathname.startsWith(r))) return null;

  const actions = [
    {
      icon: Phone,
      label: "Позвонить",
      color: "bg-primary",
      onClick: () => { window.location.href = "tel:+79253500533"; },
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      color: "bg-emerald-500",
      onClick: () => {
        const m = encodeURIComponent("Здравствуйте! Мне нужна консультация по призыву");
        window.open(`https://wa.me/79253500533?text=${m}`, "_blank");
      },
    },
    {
      icon: Send,
      label: "Telegram",
      color: "bg-sky-500",
      onClick: () => window.open("https://t.me/nepriziv2", "_blank"),
    },
  ];

  return (
    <div className="fixed right-4 bottom-[80px] z-40 flex flex-col items-end gap-2.5 md:hidden">
      {/* Action buttons */}
      {open && actions.map((action, i) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            className={cn(
              "flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-full text-white shadow-lg",
              "animate-in slide-in-from-bottom-2 fade-in",
              action.color
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <span className="text-sm font-semibold">{action.label}</span>
            <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
          </button>
        );
      })}

      {/* Main FAB toggle */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200",
          "bg-gradient-to-br from-primary to-accent text-white",
          "active:scale-90",
          open && "rotate-45"
        )}
        aria-label={open ? "Закрыть быстрые действия" : "Быстрые действия"}
      >
        {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
      </button>
    </div>
  );
};

export default QuickActionFAB;
