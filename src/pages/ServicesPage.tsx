import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
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

  const legalServices = [
    {
      icon: FileText,
      title: "Анализ документов и личного дела",
      description: "Детальный разбор всех документов в военкомате",
      price: "от 5 000 ₽"
    },
    {
      icon: Gavel,
      title: "Составление жалоб и заявлений",
      description: "Профессиональная подготовка процессуальных документов",
      price: "от 3 000 ₽"
    },
    {
      icon: Users,
      title: "Представительство в военкомате",
      description: "Личное сопровождение на заседаниях призывной комиссии",
      price: "от 8 000 ₽"
    },
    {
      icon: Scale,
      title: "Судебное представительство",
      description: "Полное ведение дела в судах всех инстанций",
      price: "от 15 000 ₽"
    },
    {
      icon: AlertTriangle,
      title: "Экстренная правовая помощь",
      description: "Срочные консультации в критических ситуациях",
      price: "от 2 000 ₽"
    },
    {
      icon: BookOpen,
      title: "Правовое просвещение",
      description: "Обучение правам и обязанностям призывника",
      price: "от 1 500 ₽"
    }
  ];

  const medicalServices = [
    {
      icon: Heart,
      title: "Анализ медицинских документов",
      description: "Экспертная оценка имеющихся справок и заключений",
      price: "от 4 000 ₽"
    },
    {
      icon: FileCheck,
      title: "Планирование дополнительных обследований",
      description: "Рекомендации по необходимым медицинским процедурам",
      price: "от 3 000 ₽"
    },
    {
      icon: Users,
      title: "Подготовка к медкомиссии",
      description: "Консультации по процедуре медицинского освидетельствования",
      price: "от 2 500 ₽"
    },
    {
      icon: BookOpen,
      title: "Консультации по Расписанию болезней",
      description: "Разъяснение медицинских критериев годности",
      price: "от 2 000 ₽"
    }
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
      title: "Достижение результата",
      description: "Получение военного билета или отсрочки"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
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
              От первичной консультации до получения военного билета — 
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
                <Card key={index} className="shadow-medium hover:shadow-strong transition-smooth border-0 bg-gradient-card">
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
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-primary">{service.price}</span>
                      <Button variant="outline" size="sm">
                        Подробнее
                      </Button>
                    </div>
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
                <Card key={index} className="shadow-medium hover:shadow-strong transition-smooth border-0 bg-background">
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
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold text-accent">{service.price}</span>
                      <Button variant="outline" size="sm">
                        Заказать
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

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
      <ChatWidget />
    </div>
  );
};

export default ServicesPage;