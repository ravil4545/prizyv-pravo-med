import { Phone, MessageCircle, Send, Mail, Clock, Briefcase, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useBranding } from "@/contexts/BrandingContext";
import LawyerPartnerDialog from "@/components/LawyerPartnerDialog";
import { isCabinetPath } from "@/lib/cabinetNav";

const Footer = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isLawyer } = useLawyerProfile();
  const branding = useBranding();
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);

  const phoneDigits = (branding.phone || "+79253500533").replace(/\D/g, "");
  const phoneDisplay = branding.phone || "+7 (925) 350-05-33";

  const handlePhoneCall = () => {
    window.location.href = `tel:+${phoneDigits}`;
  };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent("Добрый день! Мне необходима консультация...");
    const wa = branding.whatsapp || "79253500533";
    window.open(`https://wa.me/${wa}?text=${msg}`, "_blank");
  };
  const handleTelegram = () => {
    const tg = branding.telegram || "nepriziv2";
    const url = tg.startsWith("http") ? tg : `https://t.me/${tg}`;
    window.open(url, "_blank");
  };
  const handleEmail = () => {
    window.location.href = `mailto:${branding.email || "dompc9@gmail.com"}`;
  };

  const monogram = (() => {
    const parts = branding.displayName.trim().split(/\s+/);
    if (parts.length === 0) return "ВА";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  // В кабинете «хром» даёт DashboardLayout — тяжёлый маркетинговый Footer
  // на рабочих страницах кабинета не рендерим.
  if (isCabinetPath(location.pathname)) return null;

  return (
    <footer className={`bg-ink text-paper py-16 sm:py-20 ${isMobile ? "pb-24" : ""}`}>
      {/* Top stamp strip */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 mb-12">
        <div className="flex items-center gap-3 pb-4 border-b border-paper/15 font-mono text-[10px] tracking-[0.25em] uppercase text-gold/80">
          <span>контакты · реквизиты · позиция</span>
          <span className="h-px flex-1 bg-paper/15" />
          <span className="hidden sm:inline">2014 → {new Date().getFullYear()}</span>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14">
          {/* Brand block */}
          <div className={isLawyer ? "md:col-span-4" : "md:col-span-5"}>
            <div className="flex items-start gap-4 mb-5">
              <div className="relative flex h-14 w-14 items-center justify-center border border-paper/40 flex-shrink-0 overflow-hidden">
                {branding.isBranded && branding.photoUrl && /^(https?:|data:|blob:|\/)/.test(branding.photoUrl) ? (
                  <img
                    src={branding.photoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (sibling) sibling.style.display = "flex";
                    }}
                  />
                ) : null}
                <span
                  className="font-serif italic text-2xl leading-none text-paper items-center justify-center w-full h-full"
                  style={{
                    display: branding.isBranded && branding.photoUrl && /^(https?:|data:|blob:|\/)/.test(branding.photoUrl)
                      ? "none"
                      : "flex",
                  }}
                >
                  {monogram}
                </span>
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold" aria-hidden />
              </div>
              <div>
                <h3 className="font-serif text-xl sm:text-2xl leading-tight text-paper">
                  {branding.displayName}
                </h3>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-1">
                  {branding.subtitle}
                </p>
              </div>
            </div>
            <p className="text-sm text-paper/75 leading-relaxed max-w-md mb-6">
              {branding.about}
            </p>

            <div className="flex flex-wrap gap-2">
              {[
                { onClick: handlePhoneCall, icon: Phone, label: "Телефон" },
                { onClick: handleTelegram, icon: Send, label: "Telegram" },
                { onClick: handleWhatsApp, icon: MessageCircle, label: "WhatsApp" },
                { onClick: handleEmail, icon: Mail, label: "Email" },
              ].map(({ onClick, icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="flex items-center gap-2 px-3 py-2 border border-paper/25 hover:border-gold hover:text-gold text-xs font-mono uppercase tracking-wider transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Nav */}
          <nav className={isLawyer ? "md:col-span-2" : "md:col-span-3"}>
            <h4 className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-5">
              Разделы
            </h4>
            <ul className="space-y-2.5">
              {[
                { to: "/", label: "Главная" },
                { to: "/services", label: "Услуги" },
                { to: "/diagnoses", label: "Диагнозы" },
                { to: "/templates", label: "Шаблоны" },
                { to: "/blog", label: "Блог" },
                { to: "/forum", label: "Форум" },
                { to: "/testimonials", label: "Отзывы" },
              ].map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-sm text-paper/75 hover:text-gold transition-colors inline-flex items-center gap-2"
                  >
                    <span className="font-mono text-[10px] text-gold/50">→</span>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* For lawyers — только для залогиненных юристов */}
          {isLawyer && (
            <nav className="md:col-span-3">
              <h4 className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-5">
                Для юристов
              </h4>
              <ul className="space-y-2.5">
                {[
                  { to: "/lawyer", label: "Кабинет юриста" },
                  { to: "/lawyers", label: "Каталог юристов" },
                  { to: "/lawyer/clients", label: "CRM клиентов" },
                  { to: "/lawyer/chats", label: "Чаты с клиентами" },
                  { to: "/lawyer/templates", label: "Библиотека шаблонов" },
                ].map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-sm text-paper/75 hover:text-gold transition-colors inline-flex items-center gap-2"
                    >
                      <span className="font-mono text-[10px] text-gold/50">→</span>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Contacts */}
          <div className={isLawyer ? "md:col-span-3" : "md:col-span-4"}>
            <h4 className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-5">
              Связаться напрямую
            </h4>
            <dl className="space-y-4">
              <div className="flex gap-3">
                <Phone className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="font-serif text-base text-paper">{phoneDisplay}</dt>
                  <dd className="text-xs text-paper/60 mt-0.5">Звонок и бесплатная вводная</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Mail className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="font-mono text-sm text-paper break-all">{branding.email || "dompc9@gmail.com"}</dt>
                  <dd className="text-xs text-paper/60 mt-0.5">Письменные обращения</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-sm text-paper">Пн–Пт: 9:00–20:00 МСК</dt>
                  <dd className="text-xs text-paper/60 mt-0.5">Сб–Вс — по предварительной записи</dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        {/* ── Lawyer cabinet entry — отдельный блок снизу ────────────────── */}
        <div className="mt-12 pt-8 border-t border-paper/15">
          {isLawyer ? (
            <Link
              to="/lawyer"
              className="group flex items-center gap-4 p-4 border border-paper/20 hover:border-gold transition-colors max-w-2xl"
            >
              <div className="h-12 w-12 border border-gold/40 flex items-center justify-center flex-shrink-0">
                <Briefcase className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-base text-paper">Кабинет юриста</p>
                <p className="text-xs text-paper/60 mt-0.5 font-mono uppercase tracking-wider">
                  CRM · клиенты · документы · бренд
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gold/60 group-hover:text-gold flex-shrink-0" />
            </Link>
          ) : (
            <button
              onClick={() => setPartnerDialogOpen(true)}
              className="group flex items-center gap-4 p-4 border border-paper/20 hover:border-gold transition-colors max-w-2xl w-full text-left"
            >
              <div className="h-12 w-12 border border-gold/40 flex items-center justify-center flex-shrink-0">
                <Briefcase className="h-5 w-5 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-base text-paper">Юристам — стать партнёром</p>
                <p className="text-xs text-paper/60 mt-0.5 font-mono uppercase tracking-wider">
                  Личный кабинет · CRM · приём заявок
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gold/60 group-hover:text-gold flex-shrink-0" />
            </button>
          )}
        </div>

        {/* Bottom strip */}
        <div className="border-t border-paper/15 mt-14 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-paper/55">
              © {new Date().getFullYear()} {branding.displayName} · Все права защищены
            </p>
            <p className="text-[11px] text-paper/40 max-w-md leading-relaxed">
              Информация на сайте не является публичной офертой и не заменяет очной
              консультации. Услуги оказываются на основании договора.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] tracking-[0.15em] uppercase">
            <Link to="/privacy" className="text-paper/55 hover:text-gold transition-colors">
              Конфиденциальность
            </Link>
            <Link to="/terms" className="text-paper/55 hover:text-gold transition-colors">
              Условия
            </Link>
            <Link to="/offer" className="text-paper/55 hover:text-gold transition-colors">
              Оферта
            </Link>
            <Link to="/requisites" className="text-paper/55 hover:text-gold transition-colors">
              Реквизиты
            </Link>
          </div>
        </div>
      </div>
      <LawyerPartnerDialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen} />
    </footer>
  );
};

export default Footer;
