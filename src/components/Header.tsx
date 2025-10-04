import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Send, LogIn, LogOut, Menu } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);
  
  const handlePhoneCall = () => {
    window.location.href = "tel:+79253500533";
  };

  const handleWhatsApp = () => {
    const message = encodeURIComponent("Добрый день! Мне необходима консультация по поводу призыва на срочную службу...");
    window.open(`https://wa.me/79253500533?text=${message}`, "_blank");
  };

  const handleTelegram = () => {
    window.open("https://t.me/nepriziv2", "_blank");
  };

  const handleAuth = async () => {
    if (user) {
      await supabase.auth.signOut();
    } else {
      navigate("/auth");
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
              <span className="text-lg font-bold text-primary-foreground">ЮП</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">Юридическая помощь</h1>
              <p className="text-xs text-muted-foreground">призывникам</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              to="/" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Главная
            </Link>
            <Link 
              to="/services" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/services") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/services") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Услуги
            </Link>
            <Link 
              to="/testimonials" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/testimonials") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/testimonials") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Отзывы
            </Link>
            <Link 
              to="/templates" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/templates") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/templates") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Шаблоны
            </Link>
            <Link 
              to="/diagnoses" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/diagnoses") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/diagnoses") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Диагнозы
            </Link>
            <Link 
              to="/forum" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/forum") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/forum") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Форум
            </Link>
            <Link 
              to="/blog" 
              className={`text-sm font-medium transition-all duration-300 relative ${
                isActive("/blog") 
                  ? "text-primary font-semibold" 
                  : "text-foreground hover:text-primary"
              } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                isActive("/blog") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
              } after:transition-transform after:duration-300`}
            >
              Блог
            </Link>
            {user && (
              <Link 
                to="/dashboard" 
                className={`text-sm font-medium transition-all duration-300 relative ${
                  isActive("/dashboard") 
                    ? "text-primary font-semibold" 
                    : "text-foreground hover:text-primary"
                } after:content-[''] after:absolute after:w-full after:h-0.5 after:bg-gradient-primary after:bottom-[-4px] after:left-0 after:transform after:origin-center ${
                  isActive("/dashboard") ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100"
                } after:transition-transform after:duration-300`}
              >
                Кабинет
              </Link>
            )}
          </nav>

          <div className="flex items-center space-x-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden hover:bg-gradient-soft hover:text-primary"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px]">
                <SheetHeader>
                  <SheetTitle>Навигация</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col space-y-4 mt-8">
                  <Link 
                    to="/" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Главная
                  </Link>
                  <Link 
                    to="/services" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/services") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Услуги
                  </Link>
                  <Link 
                    to="/testimonials" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/testimonials") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Отзывы
                  </Link>
                  <Link 
                    to="/templates" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/templates") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Шаблоны
                  </Link>
                  <Link 
                    to="/diagnoses" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/diagnoses") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Диагнозы
                  </Link>
                  <Link 
                    to="/forum" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/forum") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Форум
                  </Link>
                  <Link 
                    to="/blog" 
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                      isActive("/blog") 
                        ? "bg-gradient-soft text-primary font-semibold" 
                        : "text-foreground hover:bg-gradient-soft hover:text-primary"
                    }`}
                  >
                    Блог
                  </Link>
                  {user && (
                    <Link 
                      to="/dashboard" 
                      onClick={() => setMobileMenuOpen(false)}
                      className={`text-base font-medium py-2 px-4 rounded-lg transition-all duration-300 ${
                        isActive("/dashboard") 
                          ? "bg-gradient-soft text-primary font-semibold" 
                          : "text-foreground hover:bg-gradient-soft hover:text-primary"
                      }`}
                    >
                      Личный кабинет
                    </Link>
                  )}
                </nav>
              </SheetContent>
            </Sheet>

            <Button
              variant="ghost"
              size="sm"
              onClick={handlePhoneCall}
              className="hidden sm:flex hover:bg-gradient-soft hover:text-primary hover:scale-105 transition-all duration-300"
            >
              <Phone className="h-4 w-4" />
              <span className="hidden lg:inline">Позвонить</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleWhatsApp}
              className="hover:bg-gradient-soft hover:text-accent hover:scale-105 transition-all duration-300"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden lg:inline">WhatsApp</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTelegram}
              className="hover:bg-gradient-soft hover:text-primary hover:scale-105 transition-all duration-300"
            >
              <Send className="h-4 w-4" />
              <span className="hidden lg:inline">Telegram</span>
            </Button>
            <Button
              variant={user ? "ghost" : "default"}
              size="sm"
              onClick={handleAuth}
              className="hover:scale-105 transition-all duration-300"
            >
              {user ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              <span className="hidden lg:inline">{user ? "Выйти" : "Войти"}</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;