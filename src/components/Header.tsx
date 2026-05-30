import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Send, LogIn, LogOut, Menu, User, MessageSquare, Briefcase, ChevronDown, ArrowRight } from "lucide-react";
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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/contexts/BrandingContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import LimitsBadge from "@/components/LimitsBadge";
import CabinetChooserDialog from "@/components/CabinetChooserDialog";

const initials = (full: string): string => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ВА";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Главное меню — 4 ключевых раздела. Остальное уходит в дроп-даун «Ещё»
// и в мобильный Sheet, чтобы не размывать фокус на главные CTA.
const PRIMARY_NAV = [
  { to: "/services", label: "Услуги" },
  { to: "/diagnoses", label: "Диагнозы" },
  { to: "/blog", label: "Блог" },
];

const SECONDARY_NAV = [
  { to: "/forum", label: "Форум" },
  { to: "/templates", label: "Шаблоны" },
  { to: "/testimonials", label: "Отзывы" },
  { to: "/commissariats", label: "Военкоматы" },
];

// Все пункты для мобильного меню
const ALL_NAV_ITEMS = [
  { to: "/", label: "Главная" },
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const branding = useBranding();
  const { unreadCount } = useUnreadMessages();
  const { isLawyer } = useLawyerProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cabinetChooserOpen, setCabinetChooserOpen] = useState(false);

  // Кабинеты раздельны: кнопка «Кабинет» открывает всплывашку выбора.
  // cabinetPath нужен лишь для второстепенных ссылок (лимиты/сообщения).
  const cabinetPath = isLawyer ? "/lawyer" : "/dashboard";

  // Иконка «Сообщения» ведёт в инбокс по роли: у юриста чаты с клиентами
  // живут в /lawyer/chats, у клиента — в /client/messages. Раньше всех вело
  // в /client/messages, из-за чего юрист попадал на пустую клиентскую страницу.
  const messagesPath = isLawyer ? "/lawyer/chats" : "/client/messages";

  const brandPhoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");
  const brandWhatsapp = branding.whatsapp || "79253500533";
  const brandShortName = branding.displayName.split(/\s+/).slice(0, 2).join(" ");
  const monogram = initials(branding.displayName);
  const homePath = branding.routePrefix || "/";

  const handlePhoneCall = () => {
    window.location.href = `tel:+${brandPhoneDigits}`;
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/${brandWhatsapp}?text=${message}`, "_blank");
  };

  const handleTelegram = () => {
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
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
    <>
    <header className="sticky top-0 z-50 w-full border-b border-ink/10 bg-paper">
      <div className="container mx-auto px-3 sm:px-4 lg:px-12">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          {/* Logo — editorial monogram */}
          <Link to={homePath} className="flex items-center gap-3 min-w-0 group" aria-label={`Главная — ${branding.displayName}`}>
            <div className="relative flex h-10 w-10 items-center justify-center border border-ink/80 flex-shrink-0 group-hover:border-gold group-hover:bg-ink transition-colors overflow-hidden">
              {/* Фото показываем только если URL непустой и валидный (https/http/data/blob) —
                  иначе мерцает иконка «битая картинка» */}
              {branding.photoUrl && /^(https?:|data:|blob:|\/)/.test(branding.photoUrl) ? (
                <img
                  src={branding.photoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // Тихий фолбэк на монограмму если фото не загрузилось
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (sibling) sibling.style.display = "flex";
                  }}
                />
              ) : null}
              <span
                className="font-serif italic text-lg leading-none text-ink group-hover:text-gold transition-colors flex items-center justify-center w-full h-full"
                style={{
                  display: branding.photoUrl && /^(https?:|data:|blob:|\/)/.test(branding.photoUrl)
                    ? "none"
                    : "flex",
                }}
              >
                {monogram}
              </span>
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold" aria-hidden />
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              <h1 className="font-serif text-base sm:text-lg leading-none text-ink truncate">
                {brandShortName}
              </h1>
              <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-ink/60 mt-1">
                {branding.subtitle}
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {PRIMARY_NAV.map((item) => (
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
            {/* «Ещё» — второстепенные разделы в дропдауне, чтобы не размывать фокус */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
                >
                  Ещё
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {SECONDARY_NAV.map((item) => (
                  <DropdownMenuItem key={item.to} onClick={() => navigate(item.to)}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {user && (
              <button
                type="button"
                onClick={() => setCabinetChooserOpen(true)}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-semibold transition-colors",
                  isActive("/dashboard") || isActive("/lawyer")
                    ? "text-primary bg-primary/10"
                    : "text-primary hover:bg-primary/8"
                )}
              >
                Кабинет
              </button>
            )}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Primary CTA — «Записаться», самый заметный элемент шапки */}
            <Button
              onClick={handlePhoneCall}
              size="sm"
              className="hidden md:inline-flex h-10 px-4 gap-2 bg-gold text-ink hover:bg-gold-deep hover:text-paper font-semibold border-0 shadow-none"
              aria-label="Записаться на бесплатный разбор"
            >
              <Phone className="h-4 w-4" />
              Записаться
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>

            {/* Compact phone CTA for mobile */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePhoneCall}
              className="md:hidden h-10 w-10 text-gold hover:text-gold-deep"
              aria-label="Записаться по телефону"
            >
              <Phone className="h-4 w-4" />
            </Button>

            {/* Limits indicator — visible on md+ */}
            <Link
              to={user ? cabinetPath : "/auth"}
              className="hidden md:inline-flex mr-1 hover:opacity-80 transition-opacity"
              aria-label="Ваши лимиты"
            >
              <LimitsBadge variant="pill" />
            </Link>

            {/* Secondary contacts — desktop, иконками */}
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

            {/* Messages notification badge — юрист идёт в /lawyer/chats, клиент в /client/messages */}
            {user && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(messagesPath)}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    aria-label="Меню аккаунта"
                  >
                    <User className="h-4 w-4 text-primary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="truncate">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTimeout(() => setCabinetChooserOpen(true), 0)}>
                    {isLawyer ? <Briefcase className="h-4 w-4 mr-2" /> : <User className="h-4 w-4 mr-2" />}
                    Кабинет
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/profile")}>
                    <User className="h-4 w-4 mr-2" />
                    Профиль и настройки
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleAuth}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Выйти
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAuth}
                className="h-9 sm:h-10 px-2 sm:px-3 gap-1.5 text-foreground/70 hover:text-foreground"
                aria-label="Войти в личный кабинет"
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
                    to={user ? cabinetPath : "/auth"}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <LimitsBadge variant="row" />
                  </Link>
                </div>

                {/* Nav links */}
                <nav className="flex flex-col p-2 flex-1 overflow-y-auto">
                  {user && (
                    <button
                      type="button"
                      onClick={() => { setMobileMenuOpen(false); setTimeout(() => setCabinetChooserOpen(true), 0); }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-semibold transition-colors mb-2 w-full text-left",
                        isActive("/dashboard") || isActive("/lawyer")
                          ? "bg-primary/10 text-primary"
                          : "bg-primary/5 text-primary hover:bg-primary/10"
                      )}
                    >
                      {isLawyer ? <Briefcase className="h-5 w-5" /> : <User className="h-5 w-5" />}
                      Кабинет
                    </button>
                  )}
                  {user && (
                    <Link
                      to={messagesPath}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3.5 rounded-xl text-base font-medium transition-colors mb-1",
                        isActive("/client/messages") || isActive("/client/chat") || isActive("/lawyer/chats") || isActive("/lawyer/chat")
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
                  {ALL_NAV_ITEMS.map((item) => (
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
    <CabinetChooserDialog open={cabinetChooserOpen} onOpenChange={setCabinetChooserOpen} />
    </>
  );
};

export default Header;
