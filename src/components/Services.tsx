import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Scale, FileText, Heart, Users, Clock, Shield } from "lucide-react";

const Services = () => {
  const handleConsultation = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  const services = [
    {
      icon: Scale,
      title: "Юридическое сопровождение",
      description: "Полное правовое сопровождение процедуры призыва",
      features: [
        "Анализ документов и личного дела",
        "Составление жалоб и заявлений",
        "Представительство в военкомате",
        "Обжалование решений призывной комиссии",
        "Судебное представительство"
      ]
    },
    {
      icon: Heart,
      title: "Медицинский анализ",
      description: "Профессиональная оценка медицинских документов",
      features: [
        "Анализ имеющихся медицинских документов",
        "Определение необходимых обследований",
        "Рекомендации по дополнительным процедурам",
        "Консультации по Расписанию болезней",
        "Подготовка к медицинскому освидетельствованию"
      ]
    }
  ];

  const advantages = [
    {
      icon: Clock,
      title: "Оперативность",
      description: "Быстрое реагирование на ваши запросы"
    },
    {
      icon: Users,
      title: "Индивидуальный подход",
      description: "Персональная стратегия для каждого клиента"
    },
    {
      icon: Shield,
      title: "Конфиденциальность",
      description: "Полная защита персональных данных"
    }
  ];

  return (
    <section className="py-20 bg-gradient-card">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Наши услуги
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Профессиональная помощь на всех этапах призывной процедуры
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <Card key={index} className="shadow-medium hover:shadow-strong transition-smooth border-0 bg-background">
                <CardHeader className="pb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-primary">
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-foreground">{service.title}</CardTitle>
                      <CardDescription className="text-muted-foreground">
                        {service.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {service.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start space-x-3">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 mt-0.5">
                          <div className="h-2 w-2 rounded-full bg-accent"></div>
                        </div>
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {advantages.map((advantage, index) => {
            const Icon = advantage.icon;
            return (
              <div key={index} className="text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary mx-auto mb-4">
                  <Icon className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{advantage.title}</h3>
                <p className="text-muted-foreground">{advantage.description}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Button 
            variant="cta" 
            size="lg"
            onClick={handleConsultation}
            className="text-lg px-8 py-4"
          >
            <FileText className="h-5 w-5" />
            Получить консультацию
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;