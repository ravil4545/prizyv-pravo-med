import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import Pricing from "@/components/Pricing";
import SubscriptionPricing from "@/components/SubscriptionPricing";
import {
  Scale,
  FileText,
  Heart,
  Users,
  Phone,
  BookOpen,
  Gavel,
  FileCheck,
  AlertTriangle,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { sectionNumber } from "@/lib/sectionNumbers";

interface ServiceItem {
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  to: string;
}

/** Внутренние маршруты рендерим через Link, tel/hash/файлы — обычной ссылкой. */
const isExternalHref = (href: string) =>
  href.startsWith("tel:") || href.startsWith("#") || href.startsWith("http") || href.endsWith(".pdf");

/**
 * Карточка услуги в editorial-языке: острые углы, тонкая рамка, золотая иконка.
 * Заменила shadcn-Card с градиентной заливкой и скруглениями — из-за неё
 * страница выглядела как другой сайт.
 */
const ServiceCard = ({ service }: { service: ServiceItem }) => {
  const Icon = service.icon;
  const inner = (
    <>
      <Icon className="h-5 w-5 text-gold mb-3" />
      <h3 className="font-serif text-lg text-ink leading-tight mb-1.5">{service.title}</h3>
      <p className="text-sm text-ink-soft flex-1">{service.description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold-deep">
        {service.cta}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </>
  );

  const className =
    "group flex flex-col h-full bg-background p-5 hover:bg-gold/5 transition-colors";

  return isExternalHref(service.to) ? (
    <a href={service.to} className={className}>{inner}</a>
  ) : (
    <Link to={service.to} className={className}>{inner}</Link>
  );
};

const ServicesPage = () => {
  const handleConsultation = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  // У каждой карточки теперь есть реальное назначение. Раньше все 10 кнопок
  // («Подробнее» ×6 и «Заказать» ×4) были без onClick и без ссылки — клик не
  // делал ничего.
  const legalServices = [
    {
      icon: FileText,
      title: "Анализ документов и личного дела",
      description: "Детальный разбор всех документов в военкомате",
      cta: "Шаблон заявления об ознакомлении",
      to: "/templates",
    },
    {
      icon: Gavel,
      title: "Составление жалоб и заявлений",
      description: "Профессиональная подготовка процессуальных документов",
      cta: "Готовые шаблоны",
      to: "/templates",
    },
    {
      icon: Users,
      title: "Представительство в военкомате",
      description: "Личное сопровождение на заседаниях призывной комиссии",
      cta: "Стоимость",
      to: "#pricing",
    },
    {
      icon: Scale,
      title: "Судебное представительство",
      description: "Полное ведение дела в судах всех инстанций",
      cta: "Стоимость",
      to: "#pricing",
    },
    {
      icon: AlertTriangle,
      title: "Экстренная правовая помощь",
      description: "Срочные консультации в критических ситуациях",
      cta: "Позвонить сейчас",
      to: "tel:+79253500533",
    },
    {
      icon: BookOpen,
      title: "Правовое просвещение",
      description: "Обучение правам и обязанностям призывника",
      cta: "Читать статьи",
      to: "/blog",
    },
  ];

  const medicalServices = [
    {
      icon: Heart,
      title: "Анализ медицинских документов",
      description: "Экспертная оценка имеющихся справок и заключений",
      cta: "Спросить ИИ бесплатно",
      to: "/ai",
    },
    {
      icon: FileCheck,
      title: "Планирование дополнительных обследований",
      description: "Рекомендации по необходимым медицинским процедурам",
      cta: "Спросить ИИ бесплатно",
      to: "/ai",
    },
    {
      icon: Users,
      title: "Подготовка к медкомиссии",
      description: "Консультации по процедуре медицинского освидетельствования",
      cta: "Скачать чек-лист",
      to: "/leadmagnets/checklist-medcomission.pdf",
    },
    {
      icon: BookOpen,
      title: "Консультации по Расписанию болезней",
      description: "Разъяснение медицинских критериев годности",
      cta: "Открыть справочник",
      to: "/diagnoses",
    },
  ];


  const serviceSteps = [
    {
      step: "01",
      title: "Первичная консультация",
      description: "Бесплатная оценка ситуации и перспектив дела"
    },
    {
      step: "02", 
      title: "Анализ документов",
      description: "Детальное изучение всех имеющихся материалов"
    },
    {
      step: "03",
      title: "Разработка стратегии",
      description: "Составление индивидуального плана действий"
    },
    {
      step: "04",
      title: "Реализация плана",
      description: "Выполнение всех необходимых процедур и действий"
    },
    {
      step: "05",
      title: "Итоговое решение",
      description: "Сопровождение до итогового решения призывной комиссии"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Услуги юриста по призыву: анализ документов, обжалование, сопровождение"
        description="Четыре формата работы: консультация, юридический анализ медицинских документов по Расписанию болезней, обжалование решения призывной комиссии, сопровождение до итогового решения."
      />
      <Header />
      
      {/* Шапка страницы в editorial-языке (§7.1).
          Была градиентная «SaaS»-заливка с крупным bold-заголовком — рядом с
          главной страница читалась как чужой сайт, хотя «Услуги» это прямой
          пункт главного меню. */}
      <section className="bg-ink text-paper">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-14 sm:py-20">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("services")}</span>
              <span className="h-px flex-1 bg-gold/30 max-w-[80px]" />
              <span className="font-mono text-gold/80 text-[10px] sm:text-xs tracking-[0.25em] uppercase">
                Услуги и цены
              </span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl leading-[1.05] mb-5">
              Полный спектр услуг
              <span className="block italic font-light text-gold mt-1">для призывников.</span>
            </h1>

            <p className="text-base sm:text-lg text-paper/85 leading-relaxed max-w-2xl mb-8">
              От первичной консультации до итогового решения призывной комиссии — сопровождение
              на каждом этапе. Ниже — что входит в работу и сколько это стоит.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="#pricing"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gold text-ink font-semibold text-sm hover:bg-gold-deep hover:text-paper transition-colors"
              >
                Смотреть тарифы
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <button
                onClick={handleConsultation}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-paper/30 text-paper font-medium text-sm hover:border-gold hover:text-gold transition-colors"
              >
                <Phone className="h-4 w-4 text-gold" />
                Бесплатная консультация
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Юридические услуги */}
      <section className="bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                Юридические услуги
              </span>
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-10 max-w-2xl">
              Правовая поддержка на всех этапах призывной процедуры
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ink/10 border border-ink/10">
              {legalServices.map((service) => (
                <ServiceCard key={service.title} service={service} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Medical Services */}
      <section className="bg-paper-deep/40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                Медицинская часть
              </span>
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-10 max-w-2xl">
              Разбор медицинских документов и план обследований
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10">
              {medicalServices.map((service) => (
                <ServiceCard key={service.title} service={service} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Тарифы (§1.6). Страница «Услуги» — единственный пункт меню, названный
          как услуги, — не содержала ни одной цены: прайс жил только на главной.
          Человек, пришедший за «сколько стоит», уходил ни с чем. */}
      <Pricing />
      <SubscriptionPricing />

      {/* Порядок работы. Соединительная линия между шагами убрана: она была
          absolute без relative у родителя и позиционировалась от случайного
          контейнера. */}
      <section className="bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-16 sm:py-20">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">
                Порядок работы
              </span>
              <span className="h-px flex-1 bg-ink/10" />
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-ink mb-10 max-w-2xl">
              Как строится работа по делу
            </h2>

            <ol className="border-y border-ink/15">
              {serviceSteps.map((step) => (
                <li
                  key={step.step}
                  className="grid grid-cols-[3rem_1fr] sm:grid-cols-[5rem_1fr] gap-4 py-5 border-b border-ink/10 last:border-0"
                >
                  <span className="font-mono text-sm text-gold-deep tracking-[0.15em]">{step.step}</span>
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg text-ink leading-tight">{step.title}</h3>
                    <p className="text-sm text-ink-soft mt-1">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Финальный блок */}
      <section className="bg-ink text-paper">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-16 sm:py-20">
          <div className="max-w-3xl">
            <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl leading-tight mb-4">
              Разберём вашу ситуацию
              <span className="block italic font-light text-gold mt-1">за 15 минут, бесплатно.</span>
            </h2>
            <p className="text-base text-paper/80 mb-8 max-w-xl">
              Без обязательств: посмотрим документы, назовём подходящие статьи Расписания болезней
              и скажем, чего не хватает.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/razbor"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-gold text-ink font-semibold text-sm hover:bg-gold-deep hover:text-paper transition-colors"
              >
                Разбор за 3 минуты — бесплатно
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <button
                onClick={handleConsultation}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-paper/30 text-paper font-medium text-sm hover:border-gold hover:text-gold transition-colors"
              >
                <Phone className="h-4 w-4 text-gold" />
                Написать юристу
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ServicesPage;