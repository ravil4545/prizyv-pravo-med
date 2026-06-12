import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: несуществующий маршрут:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SEOHead
        title="Страница не найдена — nepriziv.ru"
        description="Такой страницы нет. Вернитесь на главную или откройте справочник диагнозов."
        noindex
      />
      <div className="max-w-md text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Ошибка 404
        </p>
        <h1 className="mb-3 font-serif text-4xl text-foreground">Страница не найдена</h1>
        <p className="mb-8 text-muted-foreground">
          Возможно, ссылка устарела или в адресе опечатка.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/diagnoses">Справочник диагнозов</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
