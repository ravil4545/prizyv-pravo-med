import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

const TermsPage = () => {
  return (
    <>
      <SEOHead
        title="Пользовательское соглашение — nepriziv.ru"
        description="Условия использования сайта nepriziv.ru: правила работы, ограничения ответственности, авторские права."
      />
      <Header />
      <main className="bg-paper text-ink py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">№ 13</span>
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
              Правила сайта
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-6">
            Пользовательское соглашение
          </h1>
          <p className="text-sm text-ink/55 font-mono mb-10">Редакция от 27.05.2026</p>

          <div className="prose prose-ink max-w-none space-y-6 text-ink-soft leading-relaxed">
            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">1. Предмет соглашения</h2>
              <p>
                Настоящее Соглашение регулирует отношения между Оператором сайта
                <strong> nepriziv.ru</strong> (далее — Сайт) и его посетителями
                (далее — Пользователь). Использование Сайта означает безоговорочное
                принятие условий настоящего Соглашения.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">2. Услуги Сайта</h2>
              <p>
                Сайт предоставляет: информационные материалы по призывному и
                медицинскому праву, инструменты ИИ-кабинета по подписке, возможность
                связи с юристом, доступ к шаблонам документов, форум для общения
                между пользователями.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">3. Информационный характер</h2>
              <p>
                Информация на Сайте носит справочный характер и не является
                юридической консультацией по конкретному делу. Любая публикация — это
                ориентир, а не индивидуальная рекомендация. ИИ-помощник не является
                адвокатом и не несёт юридической ответственности за свои ответы —
                каждый ответ должен быть подтверждён юристом перед применением.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">4. Подписка ИИ-кабинета</h2>
              <p>
                Доступ к ИИ-кабинету предоставляется на условиях, описанных в{" "}
                <a href="/offer" className="text-gold hover:underline">Публичной оферте</a>.
                Оплата производится через сторонние платёжные сервисы.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">5. Запреты</h2>
              <p>Пользователю запрещается:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>загружать чужие медицинские документы без согласия владельца;</li>
                <li>публиковать на форуме материалы, нарушающие законодательство РФ;</li>
                <li>использовать Сайт для незаконных целей;</li>
                <li>пытаться обойти системы оплаты, лимиты или защиты Сайта.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">6. Ответственность</h2>
              <p>
                Оператор не несёт ответственности за решения, принятые Пользователем
                на основе информационных материалов без очной консультации юриста.
                Оператор не гарантирует получение конкретной категории годности — её
                присваивает только военно-врачебная комиссия.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">7. Авторские права</h2>
              <p>
                Все материалы Сайта (тексты, дизайн, графика, программный код)
                являются объектом авторских прав. Использование без письменного
                разрешения Оператора запрещено.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">8. Контакты</h2>
              <p>
                Email: <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">dompc9@gmail.com</a><br />
                Подробные реквизиты см. в разделе{" "}
                <a href="/requisites" className="text-gold hover:underline">«Реквизиты»</a>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default TermsPage;
