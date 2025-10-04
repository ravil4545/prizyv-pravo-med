import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  content: string;
}

const UserTemplatesPage = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const templates: Template[] = [
    {
      id: "1",
      title: "Заявление о постановке на воинский учёт",
      description: "Форма для подачи заявления о постановке на воинский учёт по месту жительства",
      category: "Воинский учёт",
      content: `Начальнику военного комиссариата
[название района/города]
от гражданина [Фамилия Имя Отчество]
[дата рождения]
проживающего по адресу:
[полный адрес]
паспорт серия [____] номер [______]

ЗАЯВЛЕНИЕ
о постановке на воинский учёт

Прошу поставить меня на воинский учёт по месту жительства.

К заявлению прилагаю:
1. Паспорт гражданина РФ (копия)
2. Фотографии 3х4 см - 2 шт.
3. Документ об образовании (копия)

Дата: [__________]
Подпись: [__________]`
    },
    {
      id: "2",
      title: "Заявление о снятии с воинского учёта",
      description: "При переезде или других основаниях для снятия с воинского учёта",
      category: "Воинский учёт",
      content: `Начальнику военного комиссариата
[название района/города]
от гражданина [Фамилия Имя Отчество]
состоящего на воинском учёте
[дата рождения]

ЗАЯВЛЕНИЕ
о снятии с воинского учёта

Прошу снять меня с воинского учёта в связи с [указать причину: переездом на новое место жительства / другое].

Новое место жительства: [полный адрес]

К заявлению прилагаю:
1. Военный билет (для предъявления)
2. Документ, подтверждающий переезд (копия)

Дата: [__________]
Подпись: [__________]`
    },
    {
      id: "3",
      title: "Заявление об отсрочке от призыва (по состоянию здоровья)",
      description: "Для получения отсрочки от призыва по медицинским показаниям",
      category: "Отсрочки",
      content: `Начальнику военного комиссариата
[название района/города]
от гражданина [Фамилия Имя Отчество]
[дата рождения]
проживающего по адресу: [полный адрес]

ЗАЯВЛЕНИЕ
об отсрочке от призыва

Прошу предоставить мне отсрочку от призыва на военную службу по состоянию здоровья в соответствии со статьей 23 Федерального закона "О воинской обязанности и военной службе".

Основание: имеющиеся заболевания [указать диагноз], подтвержденные медицинскими документами.

К заявлению прилагаю:
1. Медицинские справки и выписки
2. Результаты медицинских обследований
3. Копии амбулаторных карт

Прошу направить меня на медицинское освидетельствование.

Дата: [__________]
Подпись: [__________]`
    },
    {
      id: "4",
      title: "Жалоба на решение призывной комиссии",
      description: "Образец обжалования решения призывной комиссии",
      category: "Обжалование",
      content: `Начальнику [вышестоящего военкомата]
от гражданина [Фамилия Имя Отчество]
[дата рождения]
проживающего по адресу: [полный адрес]
тел: [номер телефона]

ЖАЛОБА
на решение призывной комиссии

[Дата] призывная комиссия военного комиссариата [название] приняла решение о [указать решение].

Считаю данное решение незаконным и необоснованным по следующим причинам:
[изложить подробно причины несогласия с решением]

На основании изложенного и руководствуясь статьей 28 Федерального закона "О воинской обязанности и военной службе", прошу:
1. Отменить решение призывной комиссии от [дата]
2. Направить меня на дополнительное медицинское освидетельствование
3. [другие требования]

Приложения:
1. Копия решения призывной комиссии
2. Медицинские документы
3. [другие документы]

Дата: [__________]
Подпись: [__________]`
    },
    {
      id: "5",
      title: "Запрос на получение копий медицинских документов",
      description: "Для получения копий медицинских документов из военкомата",
      category: "Документы",
      content: `Начальнику военного комиссариата
[название района/города]
от гражданина [Фамилия Имя Отчество]
[дата рождения]
проживающего по адресу: [полный адрес]

ЗАЯВЛЕНИЕ
о предоставлении копий медицинских документов

Прошу предоставить мне заверенные копии следующих медицинских документов, находящихся в моем личном деле:
1. Акт медицинского освидетельствования от [дата]
2. Заключение врача-специалиста [указать специальность]
3. [другие документы]

Копии документов необходимы для [указать цель: обжалования решения / получения медицинской помощи / другое].

На основании статьи 29 Федерального закона "О воинской обязанности и военной службе" прошу предоставить указанные документы в течение 10 дней с момента подачи заявления.

Дата: [__________]
Подпись: [__________]`
    }
  ];

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (template: Template) => {
    const blob = new Blob([template.content], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${template.title}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Шаблон скачан",
      description: "Файл сохранён на вашем устройстве",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12">
          <div className="text-center">Загрузка...</div>
        </main>
      </div>
    );
  }

  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад в личный кабинет
          </Button>

          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold mb-4">Шаблоны заявлений</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Готовые шаблоны документов для призывников. Скачайте и заполните необходимые поля.
            </p>
          </div>

          {categories.map((category) => (
            <div key={category} className="mb-12">
              <h2 className="text-2xl font-bold mb-6">{category}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {templates
                  .filter((t) => t.category === category)
                  .map((template) => (
                    <Card key={template.id}>
                      <CardHeader>
                        <div className="flex items-start gap-3">
                          <FileText className="h-6 w-6 text-primary mt-1" />
                          <div className="flex-1">
                            <CardTitle className="text-lg">{template.title}</CardTitle>
                            <CardDescription className="mt-2">
                              {template.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Button
                          onClick={() => handleDownload(template)}
                          className="w-full"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Скачать шаблон
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default UserTemplatesPage;
