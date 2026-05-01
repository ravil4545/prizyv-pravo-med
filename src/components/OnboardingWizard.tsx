import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { User, FileText, MessageSquare, CheckCircle2, ChevronRight, ArrowLeft } from "lucide-react";

const ONBOARDING_KEY = "nepriziv_onboarding_done";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

const steps = [
  { id: 1, title: "Добро пожаловать!", icon: User },
  { id: 2, title: "Ваше имя", icon: User },
  { id: 3, title: "Что вы хотите сделать?", icon: MessageSquare },
  { id: 4, title: "Всё готово!", icon: CheckCircle2 },
];

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

export default function OnboardingWizard({ open, onClose, userId }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const total = steps.length;

  const handleNext = async () => {
    if (step === 2 && fullName.trim()) {
      setSaving(true);
      try {
        await supabase.from("profiles").upsert({ id: userId, full_name: fullName.trim() });
      } catch {}
      setSaving(false);
    }
    if (step < total) {
      setStep((s) => s + 1);
    }
  };

  const handleFinish = (path: string) => {
    markOnboardingDone();
    onClose();
    navigate(path);
  };

  const handleSkip = () => {
    markOnboardingDone();
    onClose();
  };

  const progress = ((step - 1) / (total - 1)) * 100;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden [&>button]:hidden">
        {/* Progress bar */}
        <Progress value={progress} className="h-1 rounded-none" />

        <div className="p-6 space-y-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Шаг {step} из {total}</span>
            <button onClick={handleSkip} className="hover:text-foreground transition-colors underline underline-offset-2">
              Пропустить
            </button>
          </div>

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto shadow-md">
                <User className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Добро пожаловать!</h2>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  Непризыв поможет разобраться в вашей медицинской и юридической ситуации по призыву. Давайте быстро настроим ваш аккаунт.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { icon: FileText, label: "Анализ документов" },
                  { icon: MessageSquare, label: "ИИ консультант" },
                  { icon: CheckCircle2, label: "Справочник диагнозов" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="bg-muted/50 rounded-xl p-3 text-center">
                    <Icon className="h-5 w-5 text-primary mx-auto mb-1.5" />
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <Button onClick={handleNext} className="w-full font-semibold">
                Начать
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 2: Name */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Как вас зовут?</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Имя нужно для персонализации документов
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboard-name">ФИО</Label>
                <Input
                  id="onboard-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  onClick={handleNext}
                  className="flex-1 font-semibold"
                  disabled={!fullName.trim() || saving}
                >
                  {saving ? "Сохраняем..." : "Продолжить"}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Goal selection */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">С чего начнём?</h2>
                <p className="text-muted-foreground text-sm mt-1">Выберите первое действие</p>
              </div>
              <div className="space-y-3">
                {[
                  { icon: FileText, label: "Загрузить медицинские документы", desc: "ИИ проанализирует их и определит категорию годности", path: "/dashboard/medical-documents" },
                  { icon: MessageSquare, label: "Спросить ИИ-помощника", desc: "Задайте любой вопрос по призыву, диагнозам или документам", path: "/dashboard/ai-chat" },
                  { icon: User, label: "Заполнить профиль", desc: "Укажите диагнозы и данные для генерации документов", path: "/profile" },
                ].map(({ icon: Icon, label, desc, path }) => (
                  <button
                    key={path}
                    onClick={() => handleFinish(path)}
                    className="w-full text-left p-4 border border-border/60 rounded-xl hover:border-primary/40 hover:bg-primary/3 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/8 rounded-lg group-hover:bg-primary/12 transition-colors">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary ml-auto mt-1 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
              <Button variant="ghost" onClick={handleSkip} className="w-full text-muted-foreground text-xs">
                Перейти в личный кабинет
              </Button>
            </div>
          )}

          {/* Step 4: Done (fallback if navigated without selecting) */}
          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Аккаунт настроен!</h2>
                <p className="text-muted-foreground text-sm mt-1">Теперь вы можете пользоваться всеми функциями</p>
              </div>
              <Button onClick={() => handleFinish("/dashboard")} className="w-full">
                Перейти в кабинет
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
