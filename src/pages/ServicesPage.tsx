import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import Pricing from "@/components/Pricing";
import SubscriptionPricing from "@/components/SubscriptionPricing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Scale, 
  FileText, 
  Heart, 
  Users, 
  Clock, 
  Shield, 
  CheckCircle,
  Phone,
  BookOpen,
  Gavel,
  FileCheck,
  AlertTriangle
} from "lucide-react";

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

  /** Внутренние маршруты рендерим через Link, tel/hash/файлы — обычной ссылкой. */
  const isExternalHref = (href: string) =>
    href.startsWith("tel:") || href.startsWith("#") || href.startsWith("http") || href.endsWith(".pdf");

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
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              Полный спектр услуг
              <span className="block text-accent-light">для призывников</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-primary-foreground/90 max-w-3xl mx-auto leading-relaxed">
              От первичной консультации до итогового решения призывной комиссии —
              профессиональное сопровождение на каждом этапе
            </p>
            <Button 
              variant="hero" 
              size="lg"
              onClick={handleConsultation}
              className="text-lg px-8 py-4"
            >
              <Phone className="h-5 w-5" />
              Получить консультацию
            </Button>
          </div>
        </div>
      </section>

      {/* Legal Services */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Юридические услуги
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Профессиональная правовая поддержка на всех этапах призывной процедуры
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {legalServices.map((service, index) => {
              const Icon = service.icon;
              return (
                <Card key={index} className="shadow-medium hover:shadow-strong transition-shadow duration-300 border-0 bg-gradient-card">
                  <CardHeader className="pb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-primary mb-4">
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-lg text-foreground">{service.title}</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      {isExternalHref(service.to) ? (
                        <a href={service.to}>{service.cta}</a>
                      ) : (
                        <Link to={service.to}>{service.cta}</Link>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Medical Services */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Медицинские консультации
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Экспертный анализ медицинских документов и рекомендации по обследованиям
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {medicalServices.map((service, index) => {
              const Icon = service.icon;
              return (
                <Card key={index} className="shadow-medium hover:shadow-strong transition-shadow duration-300 border-0 bg-background">
                  <CardHeader className="pb-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 mb-4">
                      <Icon className="h-6 w-6 text-accent" />
                    </div>
                    <CardTitle className="text-lg text-foreground">{service.title}</CardTitle>
                    <CardDescription className="text-muted-foreground text-sm">
                      {service.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      {isExternalHref(service.to) ? (
                        <a href={service.to}>{service.cta}</a>
                      ) : (
                        <Link to={service.to}>{service.cta}</Link>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Тарифы (§1.6). Страница «Услуги» — единственный пункт меню, названный
          как услуги, — не содержала ни одной цены: прайс жил только на главной.
          Человек, пришедший за «сколько стоит», уходил ни с чем. */}
      <Pricing />
      <SubscriptionPricing />

      {/* Process Steps */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Как мы работаем
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Пошаговый процесс работы с каждым клиентом
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {serviceSteps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary mx-auto mb-4">
                  <span className="text-2xl font-bold text-primary-foreground">{step.step}</span>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm">{step.description}</p>
                {index < serviceSteps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-0.5 bg-gradient-to-r from-primary to-transparent transform translate-x-4"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Готовы начать работу?
            </h2>
            <p className="text-xl mb-8 text-primary-foreground/90">
              Получите бесплатную консультацию уже сегодня
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                variant="hero" 
                size="lg"
                onClick={handleConsultation}
                className="w-full sm:w-auto text-lg px-8 py-4 bg-white text-primary hover:bg-gray-100"
              >
                <Phone className="h-5 w-5" />
                Бесплатная консультация
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ServicesPage;