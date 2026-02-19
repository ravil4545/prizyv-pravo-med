import { useNavigate } from "react-router-dom";
import { BookOpen, FileHeart, MessageSquare, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

const features = [
  {
    icon: BookOpen,
    title: "ИИ история болезни призывника",
    description:
      "Автоматический анализ 88 статей Расписания болезней (Постановление №565). ИИ оценивает вероятность получения категории «В» на основе загруженных медицинских документов, выстраивает рекомендации и помогает выявить недостающие обследования.",
    path: "/medical-history",
  },
  {
    icon: FileHeart,
    title: "ИИ анализ загруженных документов",
    description:
      "Загрузите медицинские документы (PDF, фото, DOCX) — ИИ извлечёт текст, определит тип документа, привяжет к соответствующим статьям Расписания болезней и даст рекомендации по дальнейшим действиям.",
    path: "/dashboard/medical-documents",
  },
  {
    icon: MessageSquare,
    title: "ИИ помощник призывника",
    description:
      "Интеллектуальный чат-бот, который учитывает ваши медицинские документы и диагнозы. Задавайте вопросы о правах призывника, процедуре обжалования, необходимых обследованиях — получайте персонализированные ответы.",
    path: "/dashboard/ai-chat",
  },
];

const AIFeaturesSection = () => {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-8 px-4">
      <div className="container mx-auto max-w-4xl space-y-3">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          const isOpen = openIndex === index;

          return (
            <Collapsible
              key={index}
              open={isOpen}
              onOpenChange={(open) => setOpenIndex(open ? index : null)}
            >
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-4 text-left cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-semibold text-foreground text-sm sm:text-base">
                      {feature.title}
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-0">
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                      {feature.description}
                    </p>
                    <button
                      onClick={() => navigate(feature.path)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Перейти →
                    </button>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </section>
  );
};

export default AIFeaturesSection;
