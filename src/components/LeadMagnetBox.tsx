import { useState } from "react";
import { FileDown, ArrowRight, CheckCircle2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";

export interface LeadMagnetConfig {
  id: string;
  title: string;
  description: string;
  /** Кнопка-CTA */
  ctaLabel: string;
  /** Краткий промо-текст под кнопкой */
  promoText?: string;
  /** Прямая ссылка на PDF в public/leadmagnets/ — выдаётся сразу после email */
  fileUrl?: string;
}

interface Props {
  magnet: LeadMagnetConfig;
  variant?: "card" | "inline";
}

const LeadMagnetBox = ({ magnet, variant = "card" }: Props) => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      toast({
        variant: "destructive",
        title: "Введите email",
        description: "Нужен email, чтобы отправить материал.",
      });
      return;
    }
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("submit-contact", {
        body: {
          name: `Запрос материала: ${magnet.id}`,
          phone: "+70000000000",
          email: email.trim(),
          message: `Запрос лид-магнита «${magnet.title}» (id=${magnet.id}).`,
          source: `lead_magnet:${magnet.id}`,
        },
      });

      if (error) throw new Error(error.message || "Ошибка отправки");
      if (!data?.success) throw new Error(data?.message || "Ошибка обработки");

      trackEvent("lead_magnet_submit", { ref: magnet.id });
      setDone(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Попробуйте ещё раз";
      toast({
        variant: "destructive",
        title: "Не удалось отправить",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const containerClass =
    variant === "inline"
      ? "border-2 border-gold bg-gold/5 p-5 sm:p-6"
      : "border border-gold/40 bg-ink text-paper p-6 sm:p-8";

  const textColor = variant === "inline" ? "text-ink" : "text-paper";
  const subColor = variant === "inline" ? "text-ink-soft" : "text-paper/75";

  if (done) {
    return (
      <div className={containerClass}>
        <div className="flex items-start gap-4 mb-4">
          <div className={`flex h-10 w-10 items-center justify-center flex-shrink-0 ${variant === "inline" ? "bg-ink text-paper" : "bg-gold text-ink"}`}>
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-serif text-xl ${textColor} leading-tight`}>
              Готово.
            </p>
            <p className={`text-sm ${subColor} mt-2 leading-relaxed`}>
              Копия отправлена на <span className="font-semibold">{email}</span>.
              {magnet.fileUrl && " Файл можно открыть прямо сейчас:"}
            </p>
          </div>
        </div>

        {magnet.fileUrl && (
          <a
            href={magnet.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className={`group inline-flex items-center justify-between w-full gap-3 px-5 py-3.5 font-semibold text-sm transition-colors ${
              variant === "inline"
                ? "bg-ink text-paper hover:bg-gold hover:text-ink"
                : "bg-gold text-ink hover:bg-paper"
            }`}
          >
            <span className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Скачать PDF — {magnet.title}
            </span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className={`flex items-center gap-3 mb-3 font-mono text-[10px] tracking-[0.25em] uppercase ${variant === "inline" ? "text-gold-deep" : "text-gold"}`}>
        <FileDown className="h-4 w-4" />
        Бесплатный материал
      </div>
      <h3 className={`font-serif text-xl sm:text-2xl ${textColor} leading-tight mb-2`}>
        {magnet.title}
      </h3>
      <p className={`text-sm ${subColor} leading-relaxed mb-4`}>
        {magnet.description}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          maxLength={255}
          required
          className={`w-full px-4 py-3 text-sm focus:outline-none transition-colors ${
            variant === "inline"
              ? "bg-paper border border-ink/20 text-ink placeholder:text-ink/35 focus:border-gold"
              : "bg-paper/5 border border-paper/25 text-paper placeholder:text-paper/35 focus:border-gold"
          }`}
        />

        <button
          type="submit"
          disabled={submitting}
          className={`group inline-flex items-center justify-between w-full gap-3 px-5 py-3.5 font-semibold text-sm transition-colors disabled:opacity-60 ${
            variant === "inline"
              ? "bg-ink text-paper hover:bg-gold hover:text-ink"
              : "bg-gold text-ink hover:bg-paper"
          }`}
        >
          <span className="flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            {submitting ? "Отправляем..." : magnet.ctaLabel}
          </span>
          {!submitting && (
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          )}
        </button>

        <p className={`text-[10px] leading-relaxed ${variant === "inline" ? "text-ink/50" : "text-paper/50"}`}>
          Нажимая кнопку, вы соглашаетесь на обработку персональных данных —{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            политика конфиденциальности
          </a>.
        </p>

        {magnet.promoText && (
          <p className={`text-[11px] leading-relaxed ${variant === "inline" ? "text-ink/55" : "text-paper/55"}`}>
            {magnet.promoText}
          </p>
        )}
      </form>
    </div>
  );
};

// Готовые магниты — реальные PDF лежат в public/leadmagnets/, генерируются
// скриптом scripts/generate_leadmagnets.py.
export const LEAD_MAGNETS: Record<string, LeadMagnetConfig> = {
  checklist_medcomission: {
    id: "checklist_medcomission",
    title: "Чек-лист подготовки к медкомиссии",
    description:
      "9 пунктов: какие документы собрать, в каком порядке проходить врачей, как фиксировать действия комиссии.",
    ctaLabel: "Получить чек-лист",
    promoText: "Без спама. Ссылка на PDF откроется сразу после ввода email.",
    fileUrl: "/leadmagnets/checklist-medcomission.pdf",
  },
  guide_povestka: {
    id: "guide_povestka",
    title: "Что делать в день получения повестки",
    description:
      "Пошаговый план на ближайшие 72 часа: что подписывать, что не подписывать, кому звонить, какие документы готовить.",
    ctaLabel: "Получить план",
    promoText: "PDF. Откроется сразу после отправки email.",
    fileUrl: "/leadmagnets/guide-povestka.pdf",
  },
  matrix_565: {
    id: "matrix_565",
    title: "Матрица «Диагноз → статья 565»",
    description:
      "Таблица с 40 самыми частыми диагнозами и их привязкой к статьям Расписания болезней. Какая категория и при каких критериях.",
    ctaLabel: "Получить матрицу",
    promoText: "Обновляется ежеквартально по практике.",
    fileUrl: "/leadmagnets/matrix-565.pdf",
  },
  template_appeal: {
    id: "template_appeal",
    title: "Шаблон апелляции в призывную комиссию субъекта",
    description:
      "Готовый юридически выверенный шаблон обжалования с примечаниями: что подставлять, какие статьи закона цитировать.",
    ctaLabel: "Скачать шаблон",
    promoText: "PDF. Подставьте свои данные в курсивные поля.",
    fileUrl: "/leadmagnets/template-apellyaciya.pdf",
  },
};

export default LeadMagnetBox;
