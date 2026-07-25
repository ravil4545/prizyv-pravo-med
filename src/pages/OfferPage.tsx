import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { sectionNumber } from "@/lib/sectionNumbers";

const OfferPage = () => {
  return (
    <>
      <SEOHead
        title="Публичная оферта ИИ-кабинета — nepriziv.ru"
        description="Условия подписки на ИИ-кабинет nepriziv.ru: тарифы, оплата, возврат, отмена."
      />
      <Header />
      <main className="bg-paper text-ink py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("offer")}</span>
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
              ИИ-кабинет
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-6">
            Публичная оферта
          </h1>
          <p className="text-sm text-ink/55 font-mono mb-10">Редакция от 27.05.2026</p>

          <div className="prose prose-ink max-w-none space-y-6 text-ink-soft leading-relaxed">
            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">1. Стороны</h2>
              <p>
                Настоящая Оферта является официальным предложением Оператора —
                Важаниной Александры Евгеньевны — заключить договор оказания услуг по
                предоставлению доступа к ИИ-кабинету сайта <strong>nepriziv.ru</strong>.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">2. Предмет договора</h2>
              <p>
                Оператор предоставляет доступ к программно-аппаратному комплексу
                ИИ-кабинета: загрузка медицинских документов, ИИ-консультации,
                привязка к статьям Постановления № 565, шаблоны заявлений,
                дорожная карта дела и календарь дедлайнов. Консультация и
                сопровождение юриста в подписку не входят и оплачиваются отдельно
                (от 9 000 ₽).
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">3. Тарифы и стоимость</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Месячная подписка — 4 990 ₽ / 30 дней.</li>
                <li>Годовая подписка — 49 900 ₽ / 365 дней.</li>
                <li>Пробный период — 3 дня без оплаты, включает до 9 загрузок
                  документов и 9 вопросов к ИИ. По окончании автоматически
                  списывается выбранный тариф, если подписка не отменена.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">4. Оплата</h2>
              <p>
                Оплата производится через сторонние платёжные сервисы (ЮKassa,
                CloudPayments или аналог) в безналичной форме. Подписка
                продлевается автоматически до момента её отмены Пользователем.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">5. Отмена и возврат</h2>
              <p>
                Отмена подписки доступна в один клик в личном кабинете. После отмены
                доступ сохраняется до конца оплаченного периода. Возврат за
                неиспользованную часть подписки возможен пропорционально оставшимся
                дням по письменному запросу на email{" "}
                <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">dompc9@gmail.com</a>{" "}
                в течение 10 рабочих дней.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">6. Ограничения</h2>
              <p>
                ИИ-кабинет является информационным инструментом и не заменяет очной
                юридической консультации. Ответы ИИ носят справочный характер.
                Оператор не гарантирует получение конкретной категории годности —
                решение принимается государственными органами.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">7. Акцепт</h2>
              <p>
                Акцептом Оферты считается нажатие кнопки оплаты подписки. С этого
                момента договор считается заключённым на условиях, изложенных выше.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">8. Реквизиты</h2>
              <p>
                Полные реквизиты Оператора и контактные данные — на странице{" "}
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

export default OfferPage;
