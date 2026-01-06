import { useLocation, useNavigate } from "react-router-dom";
import { FileHeart, BookOpen, MessageSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const MobileBottomNav = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't show on desktop
  if (!isMobile) return null;

  // Don't show on auth pages
  const hiddenRoutes = ["/auth", "/login", "/register", "/reset-password"];
  if (hiddenRoutes.includes(location.pathname)) return null;

  const navItems = [
    {
      label: "Документы",
      icon: FileHeart,
      path: "/dashboard/medical-documents",
      requiresAuth: true,
    },
    {
      label: "История",
      icon: BookOpen,
      path: "/medical-history",
      requiresAuth: true,
    },
    {
      label: "AI Чат",
      icon: MessageSquare,
      path: "/dashboard/ai-chat",
      requiresAuth: true,
    },
  ];

  const handleNavigate = (path: string, requiresAuth: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      navigate("/auth");
    } else {
      navigate(path);
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border shadow-lg md:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path, item.requiresAuth)}
              className={`
                flex flex-col items-center justify-center gap-1 flex-1 h-full
                transition-all duration-200 rounded-lg mx-1
                ${active 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <div className={`
                p-2 rounded-xl transition-all duration-200
                ${active 
                  ? "bg-primary/10 scale-110" 
                  : "hover:bg-muted"
                }
              `}>
                <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-primary" : ""}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
};

export default MobileBottomNav;
