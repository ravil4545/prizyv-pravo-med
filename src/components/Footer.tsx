import { Phone, MessageCircle, Send, Mail, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";

const Footer = () => {
  const isMobile = useIsMobile();
  const { isLawyer } = useLawyerProfile();

  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent("Добрый день! Мне необходима консультация...");
    window.open(`https://wa.me/79253500533?text=${msg}`, "_blank");
  };
  const handleTelegram = () => {
    window.open("https://t.me/nepriziv2", "_blank");
  };
  const handleEmail = () => {
    window.location.href = "mailto:dompc9@gmail.com";
  };

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
              <div className="relative flex h-14 w-14 items-center justify-center border border-paper/40 flex-shrink-0">
                <span className="font-serif italic text-2xl leading-none text-paper">ВА</span>
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-gold" aria-hidden />
              </div>
              <div>
                <h3 className="font-serif text-xl sm:text-2xl leading-tight text-paper">
                  Важанина Александра Евгеньевна
                </h3>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mt-1">
                  Юрист · Призывное право
                </p>
              </div>
            </div>
            <p className="text-sm text-paper/75 leading-relaxed max-w-md mb-6">
              Помогаю призывникам и их семьям законно получить отсрочку,
              освобождение или военный билет. Работаю на основании договора,
              соблюдаю адвокатскую тайну.
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
                  <dt className="font-serif text-base text-paper">+7 (925) 350-05-33</dt>
                  <dd className="text-xs text-paper/60 mt-0.5">Звонок и бесплатная вводная</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Mail className="h-4 w-4 text-gold mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="font-mono text-sm text-paper">dompc9@gmail.com</dt>
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

        {/* Bottom strip */}
        <div className="border-t border-paper/15 mt-14 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-paper/55">
              © {new Date().getFullYear()} Важанина А.Е. · Все права защищены
            </p>
            <p className="text-[11px] text-paper/40 max-w-md leading-relaxed">
              Информация на сайте не является публичной офертой и не заменяет очной
              консультации. Услуги оказываются на основании договора.
            </p>
          </div>
          <div className="flex gap-5 font-mono text-[10px] tracking-[0.15em] uppercase">
            <a href="#" className="text-paper/55 hover:text-gold transition-colors">
              Конфиденциальность
            </a>
            <a href="#" className="text-paper/55 hover:text-gold transition-colors">
              Условия
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
