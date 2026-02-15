import { useSubscription } from "@/hooks/useSubscription";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, FileText, MessageSquare, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const YOOMONEY_PAYMENT_URL = "https://yoomoney.ru/bill/pay/1FUPNGI39FP.260215";

interface SubscriptionBannerProps {
  compact?: boolean;
}

export default function SubscriptionBanner({ compact = false }: SubscriptionBannerProps) {
  const { subscription, loading, isActive, remainingDocUploads, remainingAIQuestions } = useSubscription();

  if (loading || !subscription) return null;

  const active = isActive();

  if (active) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className={compact ? "p-3 flex items-center gap-3 flex-wrap" : "p-4"}>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">Платная подписка активна</span>
            {subscription.paid_until && (
              <Badge variant="outline" className="ml-2">
                до {new Date(subscription.paid_until).toLocaleDateString("ru-RU")}
              </Badge>
            )}
          </div>
          {!compact && (
            <p className="text-sm text-muted-foreground mt-1">
              Безлимитный доступ к загрузке документов и AI-чату
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const docsExhausted = remainingDocUploads === 0;
  const aiExhausted = remainingAIQuestions === 0;
  const allExhausted = docsExhausted && aiExhausted;

  return (
    <Card className={`relative z-10 ${allExhausted ? "border-destructive/50 bg-destructive/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {allExhausted ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <Crown className="h-5 w-5 text-amber-600" />
              )}
              <span className="font-semibold">
                {allExhausted ? "Лимиты исчерпаны" : "Бесплатный тариф"}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className={docsExhausted ? "text-destructive font-medium" : "text-foreground"}>
                  Документы: {remainingDocUploads} из {subscription.free_document_limit}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className={aiExhausted ? "text-destructive font-medium" : "text-foreground"}>
                  AI-вопросы: {remainingAIQuestions} из {subscription.free_ai_limit}
                </span>
              </div>
            </div>
          </div>

          <Button
            size={compact ? "sm" : "default"}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shrink-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // Open payment link immediately, don't wait for async
              window.open(YOOMONEY_PAYMENT_URL, "_blank");
              // Fire notification in background
              (async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  await supabase.functions.invoke('notify-payment-click', {
                    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
                  });
                } catch (err) {
                  console.error('Notification error:', err);
                }
              })();
            }}
          >
            <Crown className="h-4 w-4 mr-2" />
            Оформить подписку
          </Button>
        </div>

        {!compact && allExhausted && (
          <p className="text-sm text-muted-foreground mt-2">
            Для продолжения работы с документами и AI-чатом оформите ежемесячную подписку.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
