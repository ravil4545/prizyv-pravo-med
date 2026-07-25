import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { sectionNumber } from "@/lib/sectionNumbers";

const RequisitesPage = () => {
  return (
    <>
      <SEOHead
        title="Реквизиты — nepriziv.ru"
        description="Юридические и контактные реквизиты nepriziv.ru."
      />
      <Header />
      <main className="bg-paper text-ink py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-gold text-xs tracking-[0.3em]">{sectionNumber("requisites")}</span>
            <span className="font-mono text-ink/60 text-xs tracking-[0.25em] uppercase">
              Реквизиты
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink leading-tight mb-10">
            Реквизиты
          </h1>

          {/* TODO: подставить реальные данные ИП/самозанятого Важаниной А.Е. */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 border border-ink/15 p-6 sm:p-8 mb-10">
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                ФИО
              </dt>
              <dd className="text-base text-ink">Важанина Александра Евгеньевна</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Статус
              </dt>
              <dd className="text-base text-ink">Индивидуальный предприниматель / Самозанятый</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                ИНН
              </dt>
              <dd className="text-base text-ink font-mono">__________________</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                ОГРНИП / Регистрационный номер
              </dt>
              <dd className="text-base text-ink font-mono">__________________</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Юридический адрес
              </dt>
              <dd className="text-base text-ink">__________________________________</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Телефон
              </dt>
              <dd className="text-base text-ink">
                <a href="tel:+79253500533" className="text-gold hover:underline">
                  +7 (925) 350-05-33
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Email
              </dt>
              <dd className="text-base text-ink">
                <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">
                  dompc9@gmail.com
                </a>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Банковские реквизиты
              </dt>
              <dd className="text-sm text-ink-soft leading-relaxed">
                Наименование банка: ____________________________<br />
                Расчётный счёт: ____________________________<br />
                БИК: ____________________________<br />
                Корреспондентский счёт: ____________________________
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink/60 mb-1">
                Для претензий и жалоб
              </dt>
              <dd className="text-sm text-ink-soft leading-relaxed">
                Письменные обращения — на email{" "}
                <a href="mailto:dompc9@gmail.com" className="text-gold hover:underline">dompc9@gmail.com</a>{" "}
                с темой «Претензия». Срок рассмотрения — 10 рабочих дней.
              </dd>
            </div>
          </dl>

          <p className="text-sm text-ink/55 leading-relaxed">
            Подробные условия работы — см.{" "}
            <a href="/terms" className="text-gold hover:underline">Пользовательское соглашение</a>,{" "}
            <a href="/privacy" className="text-gold hover:underline">Политику конфиденциальности</a>,{" "}
            <a href="/offer" className="text-gold hover:underline">Публичную оферту</a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default RequisitesPage;
