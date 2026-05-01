import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useLawyerProfile } from "@/hooks/useLawyerProfile";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileText, Download, ArrowLeft, Crown, Copy, Check } from "lucide-react";
import { jsPDF } from "jspdf";

// ── Template definitions ──────────────────────────────────────────────────────

interface Template {
  key: string;
  category: string;
  title: string;
  description: string;
  isPro: boolean;
  fields: { key: string; label: string; placeholder: string; multiline?: boolean }[];
  body: (fields: Record<string, string>) => string;
}

const TEMPLATES: Template[] = [
  {
    key: "attach_docs",
    category: "Военкомат",
    title: "Заявление о приобщении медицинских документов",
    description: "Заявление для подачи в отдел делопроизводства военкомата. Регистрируется в 2-х экземплярах.",
    isPro: false,
    fields: [
      { key: "commissar_name", label: "ФИО военного комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Наименование военкомата", placeholder: 'Военкомат г. Москвы ЦАО' },
      { key: "client_name", label: "ФИО заявителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес регистрации", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "docs_list", label: "Перечень прилагаемых документов", placeholder: "1. Выписка из истории болезни...\n2. Заключение врача-специалиста...", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
проживающего по адресу: ${f.client_address},
тел.: ${f.client_phone}

ЗАЯВЛЕНИЕ
о приобщении медицинских документов к личному делу призывника

Прошу Вас приобщить к моему личному делу призывника прилагаемые медицинские документы, подтверждающие наличие у меня заболевания, являющегося основанием для присвоения категории годности в соответствии с Расписанием болезней (Приложение к Положению о военно-врачебной экспертизе, утверждённому Постановлением Правительства РФ № 565).

Перечень прилагаемых документов:
${f.docs_list}

Прошу рассмотреть данные документы при проведении медицинского освидетельствования.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "appeal_commission",
    category: "Обжалование",
    title: "Жалоба на решение призывной комиссии",
    description: "Жалоба в призывную комиссию субъекта РФ. Рассматривается в течение 5 рабочих дней.",
    isPro: false,
    fields: [
      { key: "region", label: "Субъект РФ", placeholder: "г. Москвы" },
      { key: "client_name", label: "ФИО заявителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "decision_date", label: "Дата решения комиссии", placeholder: "20.05.2026" },
      { key: "decision_content", label: "Суть обжалуемого решения", placeholder: "Признан годным к военной службе (категория А)..." },
      { key: "arguments", label: "Доводы жалобы", placeholder: "Считаю данное решение незаконным, поскольку...", multiline: true },
      { key: "request", label: "Просительная часть", placeholder: "Прошу отменить решение призывной комиссии и направить меня на дополнительное медицинское освидетельствование." },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `В призывную комиссию ${f.region}

от ${f.client_name},
адрес: ${f.client_address},
тел.: ${f.client_phone}

ЖАЛОБА
на решение призывной комиссии

${f.decision_date} призывной комиссией было принято следующее решение: ${f.decision_content}

С данным решением я не согласен по следующим основаниям:

${f.arguments}

На основании ст. 28 Федерального закона «О воинской обязанности и военной службе», главы 22 КАС РФ —

ПРОШУ:

${f.request}

Приложения: медицинские документы согласно описи.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "additional_exam",
    category: "Военкомат",
    title: "Ходатайство о направлении на дополнительное обследование",
    description: "Подаётся в военкомат при несогласии с заключением врача-специалиста.",
    isPro: false,
    fields: [
      { key: "commissar_name", label: "ФИО военного комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Военкомат", placeholder: 'Военкомат г. Москвы ЦАО' },
      { key: "client_name", label: "ФИО", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "diagnosis", label: "Диагноз", placeholder: "Остеохондроз шейного отдела позвоночника..." },
      { key: "exam_requested", label: "Запрашиваемые обследования", placeholder: "МРТ шейного отдела позвоночника, консультация врача-невролога...", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
адрес: ${f.client_address}

ХОДАТАЙСТВО
о направлении на дополнительное медицинское обследование

В связи с наличием у меня заболевания — ${f.diagnosis} — прошу направить меня на дополнительное медицинское обследование для уточнения диагноза и определения степени функциональных нарушений в целях правильного применения Расписания болезней (ПП РФ № 565).

Прошу назначить следующие обследования:
${f.exam_requested}

Результаты обследований будут представлены в военкомат для приобщения к личному делу.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "medical_records_request",
    category: "Медицина",
    title: "Запрос медицинских документов из поликлиники",
    description: "Запрос на выдачу выписки из истории болезни или медицинских заключений.",
    isPro: true,
    fields: [
      { key: "clinic_name", label: "Наименование медорганизации", placeholder: "ГБУЗ ГП № 5 ДЗМ" },
      { key: "chief_doctor", label: "ФИО главного врача", placeholder: "Главному врачу" },
      { key: "client_name", label: "ФИО пациента", placeholder: "Петров Пётр Петрович" },
      { key: "birth_date", label: "Дата рождения", placeholder: "01.01.2005" },
      { key: "policy", label: "Полис ОМС", placeholder: "1234 5678 9012 3456" },
      { key: "docs_requested", label: "Запрашиваемые документы", placeholder: "Выписку из амбулаторной карты за период 2023–2026 гг. с указанием всех поставленных диагнозов и проведённых обследований...", multiline: true },
      { key: "purpose", label: "Цель запроса", placeholder: "для представления в военную комиссию" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Главному врачу ${f.clinic_name}
${f.chief_doctor}

от пациента ${f.client_name},
дата рождения: ${f.birth_date},
полис ОМС: ${f.policy}

ЗАЯВЛЕНИЕ
о выдаче медицинских документов

В соответствии со ст. 22 Федерального закона от 21.11.2011 № 323-ФЗ «Об основах охраны здоровья граждан в Российской Федерации» прошу выдать мне следующие документы:

${f.docs_requested}

Документы необходимы ${f.purpose}.

Прошу выдать заверенные копии (оригиналы по запросу) в срок, предусмотренный законодательством.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "poa",
    category: "Юридические",
    title: "Шаблон доверенности на юриста",
    description: "Простая письменная доверенность с правом передоверия (нотариально заверять необязательно).",
    isPro: true,
    fields: [
      { key: "client_name", label: "ФИО доверителя", placeholder: "Петров Пётр Петрович" },
      { key: "client_passport", label: "Паспорт доверителя", placeholder: "серия 4515 № 123456, выдан..." },
      { key: "client_address", label: "Адрес доверителя", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "lawyer_name", label: "ФИО представителя", placeholder: "Сидоров Сидор Сидорович" },
      { key: "lawyer_passport", label: "Паспорт представителя", placeholder: "серия 4515 № 654321, выдан..." },
      { key: "powers", label: "Полномочия", placeholder: "представлять мои интересы в военкомате, призывной комиссии, судах...", multiline: true },
      { key: "valid_until", label: "Срок действия", placeholder: "31.12.2026" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `ДОВЕРЕННОСТЬ

${f.date} г.

Я, ${f.client_name}, паспорт ${f.client_passport}, проживающий по адресу: ${f.client_address}, настоящей доверенностью уполномочиваю:

${f.lawyer_name}, паспорт ${f.lawyer_passport}

${f.powers}

Доверенность выдана сроком до ${f.valid_until}. Право передоверия предоставляется.

${f.client_name} _____________
`,
  },
  {
    key: "acquaint_case",
    category: "Военкомат",
    title: "Заявление об ознакомлении с материалами личного дела",
    description: "Право на ознакомление с личным делом закреплено в ФЗ «О воинской обязанности».",
    isPro: true,
    fields: [
      { key: "commissar_name", label: "ФИО комиссара", placeholder: "Иванову И.И." },
      { key: "commissariat", label: "Военкомат", placeholder: 'Военкомат г. Москвы ЦАО' },
      { key: "client_name", label: "ФИО", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `Военному комиссару ${f.commissariat}
${f.commissar_name}

от ${f.client_name},
адрес: ${f.client_address},
тел.: ${f.client_phone}

ЗАЯВЛЕНИЕ
об ознакомлении с материалами личного дела призывника

На основании п. 5 ст. 5.1 Федерального закона от 28.03.1998 № 53-ФЗ «О воинской обязанности и военной службе», ст. 24 Конституции Российской Федерации прошу предоставить мне возможность ознакомиться с материалами моего личного дела призывника, а также сделать из него выписки и снять копии в разумный срок.

Прошу сообщить дату и время ознакомления.

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "admin_claim",
    category: "Суд",
    title: "Административный иск об оспаривании решения призывной комиссии",
    description: "Подаётся в районный суд по месту нахождения военкомата (гл. 22 КАС РФ).",
    isPro: true,
    fields: [
      { key: "court_name", label: "Наименование суда", placeholder: "Пресненский районный суд г. Москвы" },
      { key: "client_name", label: "ФИО истца", placeholder: "Петров Пётр Петрович" },
      { key: "client_address", label: "Адрес истца", placeholder: "г. Москва, ул. Пушкина, д. 1, кв. 1" },
      { key: "client_phone", label: "Телефон", placeholder: "+7 999 000 00 00" },
      { key: "respondent", label: "Ответчик", placeholder: "Призывная комиссия муниципального образования..." },
      { key: "decision_date", label: "Дата оспариваемого решения", placeholder: "20.05.2026" },
      { key: "decision_content", label: "Суть решения", placeholder: "Признать годным, категория А..." },
      { key: "arguments", label: "Основания для оспаривания", placeholder: "Решение противоречит ПП РФ №565, ст. 66, поскольку...", multiline: true },
      { key: "request_court", label: "Требования к суду", placeholder: "Признать решение незаконным. Обязать комиссию направить на дополнительное обследование.", multiline: true },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `В ${f.court_name}

Административный истец: ${f.client_name}
адрес: ${f.client_address}
тел.: ${f.client_phone}

Административный ответчик: ${f.respondent}

АДМИНИСТРАТИВНОЕ ИСКОВОЕ ЗАЯВЛЕНИЕ
об оспаривании решения призывной комиссии

${f.decision_date} ${f.respondent} принято решение: ${f.decision_content}.

Считаю данное решение незаконным и необоснованным по следующим основаниям:

${f.arguments}

На основании главы 22 КАС РФ, ст. 28 ФЗ № 53-ФЗ —

ПРОШУ:
${f.request_court}

Приложения:
1. Копия оспариваемого решения
2. Медицинские документы согласно описи
3. Квитанция об уплате государственной пошлины

${f.date}                                    ${f.client_name} _____________
`,
  },
  {
    key: "health_act",
    category: "Медицина",
    title: "Акт исследования состояния здоровья (шаблон)",
    description: "Заполняется врачом-специалистом. Шаблон для запроса у врача.",
    isPro: true,
    fields: [
      { key: "doctor_name", label: "ФИО врача", placeholder: "Смирнов А.А." },
      { key: "doctor_specialty", label: "Специальность", placeholder: "врач-невролог" },
      { key: "clinic_name", label: "Медорганизация", placeholder: "ГБУЗ ГП № 5 ДЗМ" },
      { key: "client_name", label: "ФИО пациента", placeholder: "Петров Пётр Петрович" },
      { key: "birth_date", label: "Дата рождения", placeholder: "01.01.2005" },
      { key: "diagnosis", label: "Диагноз (полный)", placeholder: "M42.0 — Остеохондроз позвоночника у взрослых, шейный отдел, со стойким болевым синдромом и ограничением движений..." },
      { key: "functional_impairment", label: "Степень нарушения функций", placeholder: "Нарушение функции средней степени: ограничение объёма движений в шейном отделе..." },
      { key: "exams_done", label: "Проведённые обследования", placeholder: "МРТ шейного отдела от 01.03.2026: протрузии дисков C4-C5, C5-C6..." },
      { key: "date", label: "Дата", placeholder: "01.06.2026" },
    ],
    body: (f) => `АКТ
исследования состояния здоровья

${f.date}

Врач ${f.doctor_specialty} ${f.clinic_name}
${f.doctor_name}

провёл обследование гражданина: ${f.client_name}, ${f.birth_date} г.р.

ДИАГНОЗ:
${f.diagnosis}

СТЕПЕНЬ НАРУШЕНИЯ ФУНКЦИЙ:
${f.functional_impairment}

ПРОВЕДЁННЫЕ ОБСЛЕДОВАНИЯ:
${f.exams_done}

ЗАКЛЮЧЕНИЕ:
Диагноз подтверждён клинически и инструментально. Рекомендую при проведении военно-врачебной экспертизы применить соответствующую статью Расписания болезней (ПП РФ № 565).

Врач ${f.doctor_specialty}: ${f.doctor_name} _____________

М.П.
`,
  },
];

const CATEGORIES = ["Все", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

const LawyerTemplatesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLawyer, isPro, loading: profileLoading } = useLawyerProfile();
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState("Все");
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState("");
  const [copied, setCopied] = useState(false);

  const openTemplate = (tpl: Template) => {
    setActiveTemplate(tpl);
    const defaults: Record<string, string> = {};
    tpl.fields.forEach((f) => { defaults[f.key] = ""; });
    setFields(defaults);
    setPreview(tpl.body(defaults));
  };

  const updateField = (key: string, value: string) => {
    const updated = { ...fields, [key]: value };
    setFields(updated);
    if (activeTemplate) setPreview(activeTemplate.body(updated));
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Скопировано в буфер обмена" });
  };

  const downloadPdf = async () => {
    if (!activeTemplate) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // jsPDF doesn't support Cyrillic by default — use UTF-8 encoded font trick
    doc.setFont("helvetica");
    doc.setFontSize(11);
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const lines = doc.splitTextToSize(preview, pageWidth);
    let y = margin;
    lines.forEach((line: string) => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 6;
    });

    doc.save(`${activeTemplate.key}_${Date.now()}.pdf`);

    // Track usage
    await supabase.from("lawyer_template_uses").insert({ lawyer_id: user!.id, template_key: activeTemplate.key });
    toast({ title: "PDF скачан" });
  };

  const filtered = TEMPLATES.filter((t) => activeCategory === "Все" || t.category === activeCategory);

  if (profileLoading) return <div className="min-h-screen bg-background"><Header /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild><Link to="/lawyer"><ArrowLeft className="h-4 w-4 mr-1" />Кабинет</Link></Button>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />Шаблоны документов</h1>
        </div>

        {!isPro && (
          <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 flex items-center gap-3">
            <Crown className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-sm">Pro-шаблоны доступны после перехода на тариф <strong>Pro</strong>. Базовые шаблоны доступны бесплатно.</p>
            <Button size="sm" className="ml-auto bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0">Upgrade</Button>
          </div>
        )}

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-6">
          {CATEGORIES.map((cat) => (
            <Button key={cat} variant={activeCategory === cat ? "default" : "outline"} size="sm" onClick={() => setActiveCategory(cat)}>{cat}</Button>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tpl) => (
            <Card key={tpl.key} className={`relative ${tpl.isPro && !isPro ? "opacity-70" : "hover:shadow-md cursor-pointer"} transition-shadow`}
              onClick={() => (!tpl.isPro || isPro) && openTemplate(tpl)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className="text-xs">{tpl.category}</Badge>
                  {tpl.isPro && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200"><Crown className="h-3 w-3 mr-1" />Pro</Badge>}
                </div>
                <CardTitle className="text-base leading-snug mt-2">{tpl.title}</CardTitle>
                <CardDescription className="text-xs">{tpl.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button size="sm" disabled={tpl.isPro && !isPro} className="w-full">
                  {tpl.isPro && !isPro ? "Требуется Pro" : "Открыть шаблон"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Template editor dialog */}
        {activeTemplate && (
          <Dialog open={!!activeTemplate} onOpenChange={() => setActiveTemplate(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{activeTemplate.title}</DialogTitle></DialogHeader>
              <div className="grid md:grid-cols-2 gap-4 mt-2">
                {/* Fields */}
                <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-1">
                  <p className="text-sm font-medium text-muted-foreground">Заполните поля</p>
                  {activeTemplate.fields.map((f) => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      {f.multiline
                        ? <Textarea value={fields[f.key] || ""} onChange={(e) => updateField(f.key, e.target.value)} placeholder={f.placeholder} rows={3} className="text-sm" />
                        : <Input value={fields[f.key] || ""} onChange={(e) => updateField(f.key, e.target.value)} placeholder={f.placeholder} className="text-sm" />}
                    </div>
                  ))}
                </div>
                {/* Preview */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Предпросмотр</p>
                  <div className="border rounded-lg p-4 bg-muted/30 overflow-y-auto max-h-[50vh]">
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans">{preview}</pre>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copyText} className="flex-1">
                      {copied ? <><Check className="h-4 w-4 mr-1" />Скопировано</> : <><Copy className="h-4 w-4 mr-1" />Копировать</>}
                    </Button>
                    <Button size="sm" onClick={downloadPdf} className="flex-1">
                      <Download className="h-4 w-4 mr-1" />Скачать PDF
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default LawyerTemplatesPage;
