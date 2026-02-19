import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, FileText, Clock, Sparkles } from "lucide-react";

const DashboardPromo = () => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleClick = () => {
    navigate("/dashboard");
  };

  return (
    <section className="py-12 px-4 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
      <div className="container mx-auto">
        <div className="max-w-5xl mx-auto bg-card rounded-2xl shadow-lg p-6 sm:p-8 border border-border/50">
          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
            {/* Icon */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 text-center lg:text-left">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
                Личный кабинет с AI-ассистентом
              </h2>
              <p className="text-muted-foreground mb-4">
                Получите доступ к профессиональным инструментам после регистрации
              </p>
              <div className="grid sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  <Bot className="w-5 h-5 text-primary flex-shrink-0" />
                  <span>Продвинутый AI-ассистент</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <span>Анализ документов</span>
                </div>
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                  <span>Доступно 24/7</span>
                </div>
              </div>
            </div>

            {/* Button */}
            <div className="flex-shrink-0">
              <Button 
                onClick={handleClick}
                size="lg"
                className="min-w-[200px] shadow-lg hover:shadow-xl transition-all"
              >
                {isAuthenticated ? "Перейти в кабинет" : "Зарегистрироваться"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardPromo;
