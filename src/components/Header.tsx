import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Send, LogIn, LogOut, Menu, User, MessageSquare } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import LimitsBadge from "@/components/LimitsBadge";

const NAV_ITEMS = [
  { to: "/", label: "Главная" },
  { to: "/services", label: "Услуги" },
  { to: "/diagnoses", label: "Диагнозы" },
  { to: "/forum", label: "Форум" },
  { to: "/blog", label: "Блог" },
  { to: "/templates", label: "Шаблоны" },
  { to: "/testimonials", label: "Отзывы" },
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  const handleTelegram = () => {
    window.open("https://t.me/nepriziv2", "_blank");
  };

  const handleAuth = async () => {
    if (user) {
      await supabase.auth.signOut();
      navigate("/");
    } else {
      navigate("/auth");
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink/10 bg-paper/90 backdrop-blur-lg supports-[backdrop-filter]:bg-paper/75">
      <div className="container mx-auto px-3 sm:px-4 lg:px-12">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          {/* Logo — editorial monogram */}
          <Link to="/" className="flex items-center gap-3 min-w-0 group" aria-label="Главная — Важанина Александра, юрист">
            <div className="relative flex h-10 w-10 items-center justify-center border border-ink/80 flex-shrink-0 group-hover:border-gold group-hover:bg-ink transition-colors">
              <span className="font-serif italic text-lg leading-none text-ink group-hover:text-gold transition-colors">
                ВА
              </span>
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold" aria-hidden />
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <h1 className="font-serif text-base sm:text-lg leading-none text-ink truncate">
                Важанина Александра
              </h1>
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink/60 mt-1">
                Юрист · Призывное право
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "text-primary bg-primary/8"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                )}
              >
                {item.label}
              </Link>
            ))}
            {user && (
              <Link
                to="/dashboard"
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-semibold transition-colors",
                  isActive("/dashboard")
                    ? "text-primary bg-primary/10"
                    : "text-primary hover:bg-primary/8"
                )}
              >
                Кабинет
              </Link>
            )}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Limits indicator — visible on md+ */}
            <Link
              to={user ? "/dashboard" : "/auth"}
              className="hidden md:inline-flex mr-1 hover:opacity-80 transition-opacity"
              aria-label="Ваши лимиты"
            >
              <LimitsBadge variant="pill" />
            </Link>

            {/* Quick contact - desktop */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePhoneCall}
              className="h-10 w-10 hidden md:flex hover:text-primary"
              aria-label="Позвонить"
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleWhatsApp}
              className="h-10 w-10 hidden md:flex hover:text-emerald-500"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleTelegram}
              className="h-10 w-10 hidden md:flex hover:text-sky-500"
              aria-label="Telegram"
            >
              <Send className="h-4 w-4" />
            </Button>

            {/* Messages notification badge */}
            {user && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/client/messages")}
                className="h-10 w-10 relative"
                aria-label={unreadCount > 0 ? `Сообщения (${unreadCount})` : "Сообщения"}
              >
                <MessageSquare className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            )}

            {/* Auth */}
            {user ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/dashboard")}
                className="h-10 w-10 lg:hidden"
                aria-label="Кабинет"
              >
                <User className="h-4 w-4 text-primary" />
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleAuth}
                className="h-9 sm:h-10 px-3 sm:px-4 gap-1.5 font-semibold"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Войти</span>
              </Button>
            )}

            {/* Mobile menu trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 lg:hidden"
                  aria-label="Меню"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[340px] p-0 flex flex-col">
                <SheetHeader className="p-5 border-b">
                  <SheetTitle className="text-left">Меню</SheetTitle>
                </SheetHeader>

                {/* Limits indicator */}
                <div className="px-4 py-3 border-b">
                  <Link
                    to={user ? "/dashboard" : "/auth"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <LimitsBadge variant="row" />
                  </Link>
                </div>

                {/* Nav links */}
                <nav className="flex flex-col p-2 flex-1 overflow-y-auto">
                  {user && (
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-semibold transition-colors mb-2",
                        isActive("/dashboard")
                          ? "bg-primary/10 text-primary"
                          : "bg-primary/5 text-primary hover:bg-primary/10"
                      )}
                    >
                      <User className="h-5 w-5" />
                      Личный кабинет
                    </Link>
                  )}
                  {user && (
                    <Link
                      to="/client/messages"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-colors mb-1",
                        isActive("/client/messages") || isActive("/client/chat")
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground/80 hover:bg-muted"
                      )}
                    >
                      <span className="relative">
                        <MessageSquare className="h-5 w-5" />
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </span>
                      Сообщения{unreadCount > 0 && ` (${unreadCount})`}
                    </Link>
                  )}
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "px-4 py-3 rounded-xl text-base font-medium transition-colors",
                        isActive(item.to)
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground/80 hover:bg-muted"
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                {/* Quick actions footer */}
                <div className="border-t p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePhoneCall}
                      className="flex-col h-auto py-2.5 gap-1 text-[11px]"
                    >
                      <Phone className="h-4 w-4" />
                      Позвонить
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleWhatsApp}
                      className="flex-col h-auto py-2.5 gap-1 text-[11px] text-emerald-600 hover:text-emerald-700"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleTelegram}
                      className="flex-col h-auto py-2.5 gap-1 text-[11px] text-sky-600 hover:text-sky-700"
                    >
                      <Send className="h-4 w-4" />
                      Telegram
                    </Button>
                  </div>
                  {user && (
                    <Button
                      variant="ghost"
                      onClick={() => { handleAuth(); setMobileMenuOpen(false); }}
                      className="w-full justify-center text-muted-foreground hover:text-destructive gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Выйти
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
