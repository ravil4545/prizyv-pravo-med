import type { ReactNode } from "react";
import type { DiagnosisGuide } from "@/content/diagnosisGuides";
import { faqJsonLd } from "@/lib/seoMeta";
import { FileText, AlertTriangle, ShieldQuestion } from "lucide-react";

/**
 * Развёрнутые SEO-блоки для топовых статей Расписания болезней.
 * Контент берётся из src/content/diagnosisGuides.ts. FAQ — нативные <details>
 * (работают без JS, доступны, индексируются). FAQPage JSON-LD дублируется здесь
 * для клиентской навигации (в исходный HTML его впекает prerender).
 */
export default function DiagnosisGuideView({ guide }: { guide: DiagnosisGuide }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd(guide.faq)).replace(/</g, "\\u003c"),
        }}
      />

      <Section title={`Берут ли в армию с ${guide.conditionInstrumental} в 2026 году`}>
        <Prose text={guide.armyVerdict} />
      </Section>

      <Section title={`Какая категория годности по статье ${guide.articleNumber}`}>
        <Prose text={guide.categories} />
      </Section>

      <Section title="Какие документы нужны" icon={<FileText className="h-5 w-5 text-gold" />}>
        <ul className="space-y-2">
          {guide.documents.map((d, i) => (
            <li key={i} className="flex items-start gap-2.5 text-ink-soft leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gold" />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Ошибки на медкомиссии"
        icon={<AlertTriangle className="h-5 w-5 text-seal" />}
      >
        <ul className="space-y-2">
          {guide.mistakes.map((m, i) => (
            <li key={i} className="flex items-start gap-2.5 text-ink-soft leading-relaxed">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-seal" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Что делать, если военкомат не принимает диагноз"
        icon={<ShieldQuestion className="h-5 w-5 text-gold" />}
      >
        <Prose text={guide.ifRejected} />
      </Section>

      <Section title="Частые вопросы">
        <div className="space-y-2">
          {guide.faq.map((f) => (
            <details
              key={f.q}
              className="group border border-border panel-tint px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-ink">
                <span>{f.q}</span>
                <span className="flex-shrink-0 text-gold transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-ink-soft leading-relaxed whitespace-pre-line">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2.5 font-serif text-2xl sm:text-3xl text-ink leading-tight">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Многострочный текст (\n → абзацы). */
function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split("\n\n").map((para, i) => (
        <p key={i} className="text-base text-ink-soft leading-relaxed whitespace-pre-line">
          {para}
        </p>
      ))}
    </div>
  );
}
