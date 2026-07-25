import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { sectionNumber } from "@/lib/sectionNumbers";

const PrivacyPolicyPage = () => {
  return (
    <>
      <SEOHead
        title="Политика конфиденциальности — nepriziv.ru"
        description="Политика обработки персональных данных на nepriziv.ru. Цели сбора, сроки хранения, права субъекта по 152-ФЗ."
        noindex={false}
      />
      <Header />
      <main className="bg-paper text-ink py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("privacy")}</span>
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
              152-ФЗ
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-6">
            Политика конфиденциальности
          </h1>
          <p className="text-sm text-ink/55 font-mono mb-10">
            Редакция от 27.05.2026
          </p>

          <div className="prose prose-ink max-w-none space-y-6 text-ink-soft leading-relaxed">
            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">1. Общие положения</h2>
              <p>
                Настоящая Политика определяет порядок обработки персональных данных
                (далее — ПДн) Оператором, действующим в качестве физического лица /
                индивидуального предпринимателя — Важаниной Александры Евгеньевны
                (далее — Оператор), при использовании посетителями сайта
                <strong> nepriziv.ru</strong> (далее — Сайт).
              </p>
              <p>
                Политика разработана в соответствии с Федеральным законом от 27.07.2006
                № 152-ФЗ «О персональных данных».
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">2. Какие данные мы собираем</h2>
              <p>Оператор обрабатывает следующие категории ПДн:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>имя (фамилия, имя, отчество — по желанию);</li>
                <li>контактный телефон;</li>
                <li>email;</li>
                <li>возраст призывника и стадия призывного процесса (квалификационные данные);</li>
                <li>содержание сообщения, описывающего ситуацию;</li>
                <li>медицинские документы — только при добровольной загрузке в личный кабинет;</li>
                <li>технические данные: IP-адрес, тип устройства, браузер, источник перехода.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">3. Цели обработки</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>оказание юридической помощи и консультаций по призывному и медицинскому праву;</li>
                <li>обратная связь по заявкам с Сайта;</li>
                <li>исполнение договорных обязательств;</li>
                <li>информирование о новых материалах (только при явном согласии);</li>
                <li>анализ посещаемости и улучшение качества Сайта.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">4. Правовые основания</h2>
              <p>
                Обработка ПДн осуществляется на основании ст. 6 Закона № 152-ФЗ:
                согласия субъекта ПДн, исполнения договора, законных интересов
                Оператора в осуществлении профессиональной деятельности.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">5. Передача третьим лицам</h2>
              <p>
                ПДн не передаются третьим лицам, за исключением случаев, прямо
                предусмотренных законом, либо при наличии явно выраженного согласия
                субъекта. Технические подрядчики (хостинг, рассылки, аналитика)
                обрабатывают данные исключительно по поручению Оператора в рамках
                заключённых договоров.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">6. Сроки хранения</h2>
              <p>
                Заявки с контактной формы — 3 года с момента последнего обращения.
                Документы, переданные в рамках исполнения договора — в соответствии
                с условиями договора и сроками исковой давности.
                По требованию субъекта — удаление в течение 24 часов с момента запроса
                на email <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">dompc9@gmail.com</a>.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">7. Права субъекта ПДн</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>получать сведения об обработке своих ПДн;</li>
                <li>требовать уточнения, блокирования или удаления ПДн;</li>
                <li>отозвать согласие на обработку;</li>
                <li>обжаловать действия Оператора в Роскомнадзоре или суде.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">8. Меры защиты</h2>
              <p>
                Данные передаются по защищённому каналу HTTPS/TLS. Хранятся в
                зашифрованных базах данных с разграниченным доступом. Доступ к ПДн
                имеют только сам Оператор и подключённые субъектом доверенные лица.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">9. Cookies и аналитика</h2>
              <p>
                Сайт использует технические и аналитические cookies для корректной
                работы, измерения посещаемости и улучшения пользовательского опыта.
                Сбор анонимной статистики осуществляется через Yandex.Metrica и Google
                Analytics. Вы можете отключить cookies в настройках вашего браузера.
              </p>
            </section>

            <section>
              <h2 className="font-serif text-2xl text-ink mb-3">10. Контакты Оператора</h2>
              <p>
                Email: <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">dompc9@gmail.com</a><br />
                Телефон: <a href="tel:+79253500533" className="text-gold hover:underline">+7 (925) 350-05-33</a><br />
                Полные реквизиты см. в разделе <a href="/requisites" className="text-gold hover:underline">«Реквизиты»</a>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default PrivacyPolicyPage;
