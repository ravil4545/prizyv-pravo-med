import { useEffect, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useDemoMode } from "@/hooks/useDemoMode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Crown, FileText, MessageSquare, AlertTriangle, UserPlus, Sparkles, Shield, Zap } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PaymentInstructionsDialog from "./PaymentInstructionsDialog";
import SubscriptionCancelDialog from "./SubscriptionCancelDialog";

interface SubscriptionStatusCardProps {
  compact?: boolean;
}

export default function SubscriptionStatusCard({ compact = false }: SubscriptionStatusCardProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const { subscription, loading: subLoading, isActive, remainingDocUploads, remainingAIQuestions } = useSubscription();
  const { isDemoMode, remainingDemoDocs, remainingDemoAI, demoDocLimit, demoAiLimit } = useDemoMode();

  // Авто-открытие диалога оплаты по ?pay=1 — поддержка перехода с лендинга Pricing
  useEffect(() => {
    if (searchParams.get("pay") === "1" && !isDemoMode) {
      setPaymentDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("pay");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isDemoMode]);

  if (subLoading && !isDemoMode) return null;

  const active = isActive();

  // Determine mode
  const mode: "demo" | "free" | "paid" = isDemoMode ? "demo" : active ? "paid" : "free";

  const docUsed = mode === "demo" ? (demoDocLimit - remainingDemoDocs) : (subscription?.document_uploads_used ?? 0);
  const docLimit = mode === "demo" ? demoDocLimit : mode === "paid" ? Infinity : (subscription?.free_document_limit ?? 3);
  const aiUsed = mode === "demo" ? (demoAiLimit - remainingDemoAI) : (subscription?.ai_questions_used ?? 0);
  const aiLimit = mode === "demo" ? demoAiLimit : mode === "paid" ? Infinity : (subscription?.free_ai_limit ?? 3);

  const docRemaining = mode === "demo" ? remainingDemoDocs : mode === "paid" ? Infinity : remainingDocUploads;
  const aiRemaining = mode === "demo" ? remainingDemoAI : mode === "paid" ? Infinity : remainingAIQuestions;

  const handlePayment = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPaymentDialogOpen(true);
  };

  // PAID MODE
  if (mode === "paid") {
    return (
      <>
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 shadow-soft overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <CardContent className={compact ? "p-3" : "p-5"}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-accent shadow-md">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground">Премиум подписка</span>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Активна</Badge>
                  {subscription?.paid_until && (
                    <Badge variant="outline" className="text-xs">
                      до {new Date(subscription.paid_until).toLocaleDateString("ru-RU")}
                    </Badge>
                  )}
                </div>
                {!compact && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Безлимитный доступ ко всем функциям
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">∞</span>
              </div>
            </div>
            {!compact && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCancelDialogOpen(true)}
                  className="text-xs text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
                >
                  Управление подпиской
                </button>
              </div>
            )}
          </CardContent>
        </Card>
        <PaymentInstructionsDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} />
        <SubscriptionCancelDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen} />
      </>
    );
  }

  // DEMO & FREE MODES
  const docsExhausted = docRemaining === 0;
  const aiExhausted = aiRemaining === 0;
  const allExhausted = docsExhausted && aiExhausted;

  const modeConfig = {
    demo: {
      title: "Демо-режим",
      subtitle: "Без регистрации",
      icon: Shield,
      borderClass: "border-muted-foreground/20",
      bgClass: "bg-gradient-to-r from-muted/50 to-muted/30",
      actionLabel: "Зарегистрироваться бесплатно",
      actionIcon: UserPlus,
      onAction: () => navigate("/auth"),
      upgradeNote: "Регистрация даёт 3 загрузки и 3 вопроса бесплатно",
    },
    free: {
      title: "Бесплатный тариф",
      subtitle: "Зарегистрированный",
      icon: Zap,
      borderClass: allExhausted ? "border-destructive/40" : "border-accent/30",
      bgClass: allExhausted ? "bg-gradient-to-r from-destructive/5 to-destructive/3" : "bg-gradient-to-r from-accent/5 to-primary/5",
      actionLabel: "Оформить подписку — 990 ₽/мес",
      actionIcon: Crown,
      onAction: handlePayment,
      upgradeNote: "Безлимитный доступ к документам и ИИ помощнику",
    },
  };

  const config = modeConfig[mode];
  const Icon = config.icon;

  return (
    <>
    <Card className={`${config.borderClass} ${config.bgClass} shadow-soft overflow-hidden relative`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/3 rounded-full -translate-y-1/2 translate-x-1/2" />
      <CardContent className={compact ? "p-3" : "p-5"}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shadow-sm ${allExhausted ? "bg-destructive/10" : "bg-gradient-to-br from-primary/10 to-accent/10"}`}>
                {allExhausted ? (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                ) : (
                  <Icon className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{config.title}</span>
                  <Badge variant="outline" className="text-xs">{config.subtitle}</Badge>
                </div>
                {!compact && (
                  <p className="text-xs text-muted-foreground mt-0.5">{config.upgradeNote}</p>
                )}
              </div>
            </div>
          </div>

          {/* Usage Counters */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-3 ${docsExhausted ? "bg-destructive/8 border border-destructive/20" : "bg-card/80 border border-border/50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className={`h-4 w-4 ${docsExhausted ? "text-destructive" : "text-primary"}`} />
                <span className="text-xs font-medium text-muted-foreground">Документы</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${docsExhausted ? "text-destructive" : "text-foreground"}`}>
                  {docRemaining}
                </span>
                <span className="text-xs text-muted-foreground">из {docLimit}</span>
              </div>
              <Progress 
                value={docLimit > 0 ? ((docLimit - docRemaining) / docLimit) * 100 : 100} 
                className="h-1.5 mt-2" 
              />
            </div>

            <div className={`rounded-xl p-3 ${aiExhausted ? "bg-destructive/8 border border-destructive/20" : "bg-card/80 border border-border/50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className={`h-4 w-4 ${aiExhausted ? "text-destructive" : "text-accent"}`} />
                <span className="text-xs font-medium text-muted-foreground">ИИ вопросы</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${aiExhausted ? "text-destructive" : "text-foreground"}`}>
                  {aiRemaining}
                </span>
                <span className="text-xs text-muted-foreground">из {aiLimit}</span>
              </div>
              <Progress 
                value={aiLimit > 0 ? ((aiLimit - aiRemaining) / aiLimit) * 100 : 100} 
                className="h-1.5 mt-2" 
              />
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={config.onAction}
            className={`w-full font-semibold ${
              mode === "demo" 
                ? "bg-primary hover:bg-primary/90" 
                : "bg-gradient-to-r from-accent to-primary hover:opacity-90"
            } text-white shadow-md`}
            size={compact ? "sm" : "default"}
          >
            <config.actionIcon className="h-4 w-4 mr-2" />
            {config.actionLabel}
          </Button>

          {/* Paid features preview */}
          {!compact && mode === "free" && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {["Безлимитные документы", "Безлимитный ИИ", "Приоритетная поддержка"].map((feature) => (
                <div key={feature} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-accent flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    <PaymentInstructionsDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} />
    </>
  );
}
