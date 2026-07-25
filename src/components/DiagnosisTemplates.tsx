import { Link } from "react-router-dom";
import { FileText, ArrowRight, Stethoscope } from "lucide-react";
import { DOC_TEMPLATES } from "@/lib/docTemplates";
import {
  medicalSourceLabel,
  QUALITY_ESCALATION,
  templatesForArticle,
  type SuggestedTemplate,
} from "@/lib/templatesForArticle";

// ════════════════════════════════════════════════════════════════════════
//  «Документы для этой статьи» на странице диагноза (§5).
//
//  Замыкает контур: человек понял, что статья его, — и тут же видит, какие
//  бумаги её подтверждают и где их взять. Раньше со страницы диагноза он попадал
//  в общий каталог из 21 шаблона и угадывал сам.
// ════════════════════════════════════════════════════════════════════════

interface Props {
  articleNumber: string;
  /** Медицинский профиль из disease_articles_565.category (mental, skin, …). */
  category: string | null;
  /** Авторизован ли пользователь — от этого зависит адрес ссылки. */
  isAuthed: boolean;
  /** Брендовый префикс маршрута для white-label /u/:slug. */
  routePrefix: string;
}

const titleOf = (key: string): string =>
  DOC_TEMPLATES.find((t) => t.key === key)?.title ?? key;

const DiagnosisTemplates = ({ articleNumber, category, isAuthed, routePrefix }: Props) => {
  const primary = templatesForArticle(category);

  // Редактор шаблонов живёт в кабинете. Аноним идёт на регистрацию с
  // сохранённым next — после входа откроется нужный документ, а не каталог.
  const linkFor = (key: string): string =>
    isAuthed
      ? `${routePrefix}/dashboard/templates?template=${encodeURIComponent(key)}`
      : `/auth?mode=signup&next=${encodeURIComponent(`/dashboard/templates?template=${key}`)}`;

  const renderItem = (item: SuggestedTemplate) => (
    <li key={item.key} className="border-b border-ink/10 last:border-0 py-3.5">
      <Link
        to={linkFor(item.key)}
        className="group flex items-start justify-between gap-3 hover:text-gold-deep transition-colors"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink group-hover:text-gold-deep">
            {titleOf(item.key)}
          </span>
          <span className="block text-sm text-ink-soft mt-0.5">{item.reason}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 mt-0.5 text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
      </Link>
    </li>
  );

  return (
    <section className="my-10">
      <h2 className="font-serif text-2xl text-ink mb-1">
        Документы для статьи {articleNumber}
      </h2>
      <p className="text-sm text-ink-soft mb-5 inline-flex items-center gap-1.5">
        <Stethoscope className="h-4 w-4 text-gold shrink-0" />
        Выписку по этому профилю выдаёт {medicalSourceLabel(category)}.
      </p>

      <ul className="border-y border-ink/15">{primary.map(renderItem)}</ul>

      <details className="mt-4 border border-ink/15 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Если диагноз в документах оформлен небрежно
        </summary>
        <p className="mt-2 text-sm text-ink-soft">
          Частая причина отказа — не отсутствие болезни, а формулировка в выписке: диагноз указан
          без степени, без кода МКБ или вовсе не вынесен в заключение.
        </p>
        <ul className="mt-2 border-t border-ink/10">{QUALITY_ESCALATION.map(renderItem)}</ul>
      </details>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] font-mono tracking-[0.15em] uppercase text-ink/45">
        <FileText className="h-3 w-3" />
        Поля заполнятся из профиля, военкомат и диспансер найдём по адресу
      </p>
    </section>
  );
};

export default DiagnosisTemplates;
