import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Download, 
  Scale, 
  FileCheck, 
  AlertTriangle,
  Clock,
  GraduationCap,
  MapPin
} from "lucide-react";

const TemplatesPage = () => {
  const handleDownload = (templateName: string) => {
    // Create a simple text content for demonstration
    const content = `ШАБЛОН ДОКУМЕНТА: ${templateName}

Данный документ является примером для ознакомления. 
Перед использованием обязательно проконсультируйтесь с юристом.

[Здесь должен быть полный текст шаблона]

Контакты для консультации:
Телефон: +7 (925) 350-05-33
WhatsApp: https://wa.me/79253500533
Telegram: https://t.me/nepriziv2`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${templateName.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const templates = [
    {
      icon: FileText,
      title: "Заявление о приобщении документов к личному делу",
      description: "Стандартная форма для подачи дополнительных медицинских справок и документов в военкомат",
      category: "Основные документы",
      gradient: "bg-gradient-primary"
    },
    {
      icon: FileCheck,
      title: "Заявление о выдаче копии решения призывной комиссии",
      description: "Запрос официальной копии решения для дальнейшего обжалования",
      category: "Основные документы", 
      gradient: "bg-gradient-accent"
    },
    {
      icon: Scale,
      title: "Заявление о ознакомлении с личным делом",
      description: "Право призывника на ознакомление с материалами своего дела",
      category: "Основные документы",
      gradient: "bg-gradient-primary"
    },
    {
      icon: AlertTriangle,
      title: "Жалоба в вышестоящий военкомат",
      description: "Обжалование решения призывной комиссии в вышестоящей инстанции",
      category: "Обжалование",
      gradient: "bg-gradient-accent"
    },
    {
      icon: Scale,
      title: "Исковое заявление в суд",
      description: "Подача судебного иска при несогласии с решением военкомата",
      category: "Судебные документы",
      gradient: "bg-gradient-primary"
    },
    {
      icon: FileText,
      title: "Апелляционная жалоба",
      description: "Обжалование решения суда первой инстанции",
      category: "Судебные документы",
      gradient: "bg-gradient-accent"
    },
    {
      icon: GraduationCap,
      title: "Заявление об отсрочке по обучению",
      description: "Запрос отсрочки для студентов дневной формы обучения",
      category: "Отсрочки",
      gradient: "bg-gradient-primary"
    },
    {
      icon: MapPin,
      title: "Заявление о снятии с воинского учета",
      description: "При выезде за пределы РФ на срок более 6 месяцев",
      category: "Снятие с учета",
      gradient: "bg-gradient-accent"
    }
  ];

  const categories = [
    "Основные документы",
    "Обжалование", 
    "Судебные документы",
    "Отсрочки",
    "Снятие с учета"
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">
              Шаблоны документов
              <span className="block text-accent-light">для призывников</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-primary-foreground/90 max-w-3xl mx-auto leading-relaxed">
              Готовые образцы заявлений и жалоб для защиты ваших прав в военкомате и суде
            </p>
          </div>
        </div>
      </section>

      {/* Warning Section */}
      <section className="py-12 bg-gradient-soft">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card className="border-accent/20 bg-background/80 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-6 w-6 text-accent" />
                  <CardTitle className="text-xl text-foreground">Важное уведомление</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Представленные шаблоны носят информационный характер. Перед использованием любого документа
                  обязательно проконсультируйтесь с квалифицированным юристом для адаптации под вашу конкретную ситуацию.
                  Неправильное оформление документов может негативно повлиять на исход дела.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Templates by Category */}
      {categories.map((category, categoryIndex) => (
        <section key={category} className={categoryIndex % 2 === 0 ? "py-16 bg-background" : "py-16 bg-muted/20"}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {category}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {templates
                .filter(template => template.category === category)
                .map((template, index) => {
                  const Icon = template.icon;
                  return (
                    <Card 
                      key={index} 
                      className="shadow-soft hover:shadow-accent transition-all duration-300 border-0 bg-gradient-card hover:scale-105 group"
                    >
                      <CardHeader className="pb-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${template.gradient} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <CardTitle className="text-lg text-foreground group-hover:text-primary transition-colors duration-300">
                          {template.title}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">
                          {template.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button 
                          variant="outline" 
                          className="w-full" 
                          onClick={() => handleDownload(template.title)}
                        >
                          <Download className="h-4 w-4" />
                          Скачать шаблон
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        </section>
      ))}

      {/* CTA Section */}
      <section className="py-20 bg-gradient-primary text-primary-foreground">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Нужна помощь с заполнением?
            </h2>
            <p className="text-xl mb-8 text-primary-foreground/90">
              Получите персональную консультацию по правильному оформлению документов
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button 
                variant="hero" 
                size="lg"
                onClick={() => {
                  const message = encodeURIComponent("Добрый день! Мне нужна помощь с заполнением документов для военкомата...");
                  window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
                }}
                className="w-full sm:w-auto text-lg px-8 py-4 bg-white text-primary hover:bg-gray-100"
              >
                <FileCheck className="h-5 w-5" />
                Получить консультацию
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

export default TemplatesPage;