import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardList, Save, FileDown, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

interface QuestionSection {
  id: string;
  title: string;
  questions: { id: string; label: string; hint?: string }[];
}

const questionnaireSections: QuestionSection[] = [
  {
    id: "1",
    title: "Общий и инфекционный анамнез",
    questions: [
      { id: "1.1", label: "Переносили ли вы тяжёлые инфекционные заболевания (пневмония, менингит, гепатиты, COVID-19 с осложнениями, туберкулёз и др.)?", hint: "Укажите возраст, длительность, была ли госпитализация, осложнения." },
      { id: "1.2", label: "Были ли частые ОРВИ (более 4–5 раз в год), затяжные инфекции, длительное восстановление после болезней?" },
      { id: "1.3", label: "Есть ли хронические очаги инфекции (тонзиллит, синусит, кариес)?" },
    ],
  },
  {
    id: "2",
    title: "Онкологический и дерматологический статус",
    questions: [
      { id: "2.1", label: "Есть ли невусы (крупные, выступающие, травмируемые, изменяющиеся в размере/цвете)?" },
      { id: "2.2", label: "Имеются ли доброкачественные новообразования (липомы, фибромы, гемангиомы и др.)?" },
      { id: "2.3", label: "Наблюдались ли у дерматолога или онколога? Проводилась ли дерматоскопия, удаление образований?" },
    ],
  },
  {
    id: "3",
    title: "Система крови и гемостаз",
    questions: [
      { id: "3.1", label: "Бывает ли кровоточивость дёсен, носовые кровотечения?", hint: "Как часто, спонтанно или после нагрузки?" },
      { id: "3.2", label: "Бывают ли синяки без причины, длительное заживление ран?" },
      { id: "3.3", label: "Диагностировались ли анемия, нарушения свертываемости крови?" },
    ],
  },
  {
    id: "4",
    title: "Эндокринная система и обмен веществ",
    questions: [
      { id: "4.1", label: "Ваш рост и вес (указать текущие и колебания за последние годы)." },
      { id: "4.2", label: "Наблюдались ли у эндокринолога? По какому поводу?" },
      { id: "4.3", label: "Есть ли сахарный диабет, нарушение толерантности к глюкозе, заболевания щитовидной железы?" },
      { id: "4.4", label: "Отмечали ли: хроническую усталость, снижение умственной или физической работоспособности, резкие перепады веса, потливость, тремор, сердцебиение?" },
    ],
  },
  {
    id: "5",
    title: "Психоэмоциональное состояние",
    questions: [
      { id: "5.1", label: "Бывали ли эпизоды депрессии, тревоги, апатии, панических атак?", hint: "Длительность, частота, обращались ли к врачу?" },
      { id: "5.2", label: "Насколько быстро и резко меняется настроение?" },
      { id: "5.3", label: "Есть ли: нарушения сна, повышенная утомляемость, раздражительность, трудности концентрации внимания?" },
      { id: "5.4", label: "Назначалась ли когда-либо психотерапия или медикаментозное лечение?" },
    ],
  },
  {
    id: "6",
    title: "Неврологический анамнез",
    questions: [
      { id: "6.1", label: "Наблюдались ли у невролога? Диагнозы?" },
      { id: "6.2", label: "Головные боли: как часто, характер (давящие, пульсирующие), длительность, связь с нагрузкой, стрессом, погодой?" },
      { id: "6.3", label: "Сопровождаются ли головные боли тошнотой, рвотой, светобоязнью?" },
      { id: "6.4", label: "Бывали ли обмороки, головокружения, онемение конечностей?" },
      { id: "6.5", label: "Как протекали роды (со слов матери): гипоксия, родовая травма, асфиксия?" },
    ],
  },
  {
    id: "7",
    title: "Органы зрения",
    questions: [
      { id: "7.1", label: "Есть ли нарушения зрения (близорукость, дальнозоркость, астигматизм)?" },
      { id: "7.2", label: "Пользуетесь ли очками или контактными линзами?" },
      { id: "7.3", label: "Есть ли: быстрая утомляемость глаз, головные боли при зрительной нагрузке, двоение, «мушки»?" },
      { id: "7.4", label: "Дата последнего осмотра офтальмолога, данные (если есть)." },
    ],
  },
  {
    id: "8",
    title: "ЛОР-органы и слух",
    questions: [
      { id: "8.1", label: "Были ли отиты (острые, хронические)?", hint: "Госпитализация или амбулаторное лечение?" },
      { id: "8.2", label: "Есть ли снижение слуха, шум, звон в ушах?" },
      { id: "8.3", label: "Часто ли бывают насморки, синуситы, заложенность носа?" },
      { id: "8.4", label: "Проводились ли КТ/рентген околоносовых пазух, аудиометрия?" },
    ],
  },
  {
    id: "9",
    title: "Сердечно-сосудистая система",
    questions: [
      { id: "9.1", label: "Есть ли заболевания сердца или сосудов?" },
      { id: "9.2", label: "Бывают ли: перебои в работе сердца, ощущение «замирания», учащённое сердцебиение?" },
      { id: "9.3", label: "Появляются ли боли или покалывания в груди при физической нагрузке?" },
      { id: "9.4", label: "Бывает ли: одышка, мелькание «мушек», шум в ушах, головокружение?" },
      { id: "9.5", label: "Часто ли болели ангинами в детстве?" },
      { id: "9.6", label: "Есть ли наследственные сердечно-сосудистые заболевания у родственников (уточнить какие)?" },
      { id: "9.7", label: "Когда последний раз выполняли ЭКГ, ЭхоКГ, Холтер?" },
    ],
  },
  {
    id: "10",
    title: "Дыхательная система и аллергия",
    questions: [
      { id: "10.1", label: "Есть ли аллергия (пищевая, лекарственная, сезонная)?" },
      { id: "10.2", label: "Бывает ли заложенность носа, слезотечение, чихание весной/летом?" },
      { id: "10.3", label: "Курите ли (стаж, количество)?" },
      { id: "10.4", label: "Отмечали ли нехватку воздуха, давление в грудной клетке, кашель после курения или физической нагрузки?" },
      { id: "10.5", label: "Диагностировалась ли бронхиальная астма, обструктивный бронхит?" },
    ],
  },
  {
    id: "11",
    title: "Пищеварительная система и челюстно-лицевой аппарат",
    questions: [
      { id: "11.1", label: "Есть ли нарушения прикуса?" },
      { id: "11.2", label: "Бывают ли щелчки, боли в височно-нижнечелюстном суставе?" },
      { id: "11.3", label: "Есть ли симптомы со стороны ЖКТ: жжение за грудиной, изжога, отрыжка, боли в животе?" },
      { id: "11.4", label: "Связаны ли боли с приёмом пищи, временем суток, сезоном?" },
      { id: "11.5", label: "Диагностировались ли гастрит, язвенная болезнь, ГЭРБ?" },
    ],
  },
  {
    id: "12",
    title: "Кожа и подкожные структуры",
    questions: [
      { id: "12.1", label: "Есть ли высыпания, пятна, шелушение, изменения цвета кожи?" },
      { id: "12.2", label: "Меняются ли они со временем, зудят, воспаляются?" },
      { id: "12.3", label: "Обращались ли к дерматологу, проводилось ли лечение?" },
    ],
  },
  {
    id: "13",
    title: "Опорно-двигательный аппарат",
    questions: [
      { id: "13.1", label: "Отмечали ли плоскостопие (быстро стаптывается обувь)?" },
      { id: "13.2", label: "Есть ли: боли в спине, усталость при длительном стоянии или сидении, ограничение подвижности?" },
      { id: "13.3", label: "Бывают ли боли, отёки, воспаление суставов (крупных, мелких)?" },
      { id: "13.4", label: "Диагностировались ли сколиоз, остеохондроз, артриты?" },
    ],
  },
  {
    id: "14",
    title: "Мочевыделительная система",
    questions: [
      { id: "14.1", label: "Проводилось ли УЗИ почек и мочевого пузыря?" },
      { id: "14.2", label: "Есть ли: боли в пояснице, учащённое или болезненное мочеиспускание, задержка или затруднение оттока мочи?" },
      { id: "14.3", label: "Были ли инфекции мочевых путей, изменения в анализах мочи?" },
    ],
  },
  {
    id: "15",
    title: "Хирургический и травматологический анамнез",
    questions: [
      { id: "15.1", label: "Были ли операции (какие, когда, осложнения)?" },
      { id: "15.2", label: "Переносили ли травмы, переломы, ЧМТ, вывихи?" },
      { id: "15.3", label: "Есть ли последствия травм (боли, ограничения, неврологические симптомы)?" },
      { id: "15.4", label: "Есть ли пищевая или медикаментозная аллергия?" },
    ],
  },
];

export default function MedicalQuestionnairePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["1"]));
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Allow demo access — don't redirect
      setLoading(false);
      return;
    }
    setUser(session.user);
    setLoading(false);
  };

  const setAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // Check if a section has any filled answers
  const isSectionFilled = (section: QuestionSection) => {
    return section.questions.some(q => answers[q.id]?.trim());
  };

  // Update completed sections tracking
  useEffect(() => {
    const completed = new Set<string>();
    questionnaireSections.forEach(section => {
      if (isSectionFilled(section)) completed.add(section.id);
    });
    setCompletedSections(completed);
  }, [answers]);

  const filledCount = Object.values(answers).filter(v => v?.trim()).length;
  const totalQuestions = questionnaireSections.reduce((sum, s) => sum + s.questions.length, 0);

  const generateDocumentText = () => {
    const lines: string[] = [];
    lines.push("РАСШИРЕННЫЙ МЕДИЦИНСКИЙ ОПРОСНИК ПРИЗЫВНИКА");
    lines.push(`Дата заполнения: ${new Date().toLocaleDateString("ru-RU")}`);
    lines.push("");

    questionnaireSections.forEach(section => {
      lines.push(`${section.id}. ${section.title.toUpperCase()}`);
      lines.push("");
      section.questions.forEach(q => {
        lines.push(`${q.id}. ${q.label}`);
        const answer = answers[q.id]?.trim();
        lines.push(`Ответ: ${answer || "Не заполнено"}`);
        lines.push("");
      });
      lines.push("");
    });

    return lines.join("\n");
  };

  const handleSubmit = async () => {
    if (!user) return;

    if (filledCount === 0) {
      toast.error("Заполните хотя бы один вопрос");
      return;
    }

    setSubmitting(true);

    try {
      const documentText = generateDocumentText();

      // 1. Create PDF for storage
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      pdf.setFontSize(10);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let y = 20;

      const lines = documentText.split("\n");
      for (const line of lines) {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        const splitLines = pdf.splitTextToSize(line, maxWidth);
        for (const sl of splitLines) {
          if (y > 270) {
            pdf.addPage();
            y = 20;
          }
          pdf.text(sl, margin, y);
          y += 5;
        }
      }

      const pdfBlob = pdf.output("blob");
      const fileName = `${user.id}/questionnaire_${Date.now()}.pdf`;

      // 2. Upload PDF to storage
      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(fileName, pdfBlob, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      // 3. Create medical document record with questionnaire marker
      const { data: insertedDoc, error: insertError } = await supabase
        .from("medical_documents_v2")
        .insert({
          user_id: user.id,
          title: `Медицинский опросник от ${new Date().toLocaleDateString("ru-RU")}`,
          file_url: fileName,
          is_classified: false,
          raw_text: documentText,
          meta: { is_questionnaire: true, filled_count: filledCount, total_questions: totalQuestions },
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 4. Download DOCX for user (non-blocking)
      try {
        const response = await fetch(
          `https://kqbetheonxiclwgyatnm.supabase.co/functions/v1/generate-document`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({
              userId: user.id,
              docType: "questionnaire",
              format: "docx",
              customContent: documentText,
            }),
          }
        );

        if (response.ok) {
          const docxBlob = await response.blob();
          const docxUrl = URL.createObjectURL(docxBlob);
          const a = document.createElement("a");
          a.href = docxUrl;
          a.download = `medical_questionnaire_${new Date().toLocaleDateString("ru-RU").replace(/\./g, "-")}.docx`;
          a.click();
          URL.revokeObjectURL(docxUrl);
        } else {
          console.warn("DOCX generation failed, skipping download");
        }
      } catch (docxErr) {
        console.warn("DOCX download error (non-critical):", docxErr);
      }

      toast.success("Опросник сохранён! Запускаем AI-анализ...");

      // 5. Trigger AI analysis (non-blocking)
      if (insertedDoc) {
        supabase.functions.invoke("analyze-medical-document", {
          body: {
            manualText: documentText,
            documentId: insertedDoc.id,
            userId: user.id,
            isHandwritten: true,
          },
        }).then(({ data, error }) => {
          if (error) {
            console.error("AI analysis error:", error);
            toast.error("Ошибка AI-анализа опросника");
          } else {
            toast.success("AI-анализ опросника завершён");
          }
        });
      }

      navigate("/dashboard/medical-documents");
    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(error.message || "Ошибка сохранения опросника");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-3 sm:px-4 py-6 sm:py-12 pb-24 md:pb-12 max-w-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              Медицинский опросник
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Заполнено: {filledCount} из {totalQuestions} вопросов • {completedSections.size} из {questionnaireSections.length} разделов
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
              Назад
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full bg-muted rounded-full h-2 mb-6">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(filledCount / totalQuestions) * 100}%` }}
          />
        </div>

        <div className="space-y-3">
          {questionnaireSections.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const isCompleted = completedSections.has(section.id);

            return (
              <Card key={section.id} className={`transition-all ${isCompleted ? "border-emerald-500/50" : ""}`}>
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="px-4 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={isCompleted ? "default" : "secondary"} className="flex-shrink-0 text-xs">
                          {section.id}
                        </Badge>
                        <CardTitle className="text-sm sm:text-base font-medium truncate">
                          {section.title}
                        </CardTitle>
                        {isCompleted && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0 space-y-4">
                    {section.questions.map((q) => (
                      <div key={q.id} className="space-y-1.5">
                        <Label className="text-xs sm:text-sm leading-relaxed">
                          <span className="font-semibold text-primary">{q.id}.</span>{" "}
                          {q.label}
                        </Label>
                        {q.hint && (
                          <p className="text-xs text-muted-foreground italic">{q.hint}</p>
                        )}
                        <Textarea
                          value={answers[q.id] || ""}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder="Введите ваш ответ..."
                          className="min-h-[60px] text-sm resize-y"
                        />
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Submit buttons */}
        <div className="sticky bottom-20 md:bottom-4 mt-6 bg-background/95 backdrop-blur-sm border rounded-xl p-4 shadow-lg">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-muted-foreground">
              После отправки документ будет загружен в «Медицинские документы» и проанализирован ИИ
            </p>
            <Button
              onClick={handleSubmit}
              disabled={submitting || filledCount === 0}
              className="w-full sm:w-auto gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Сохранить и загрузить ({filledCount}/{totalQuestions})
                </>
              )}
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
