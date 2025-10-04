import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";

const formSchema = z.object({
  military_commissariat: z.string().optional(),
  military_commissariat_address: z.string().optional(),
  superior_military_commissariat: z.string().optional(),
  superior_military_commissariat_address: z.string().optional(),
  court_by_military: z.string().optional(),
  court_by_registration: z.string().optional(),
  prosecutor_office: z.string().optional(),
});

interface MilitaryFormProps {
  profile: any;
  onUpdate: (userId: string) => void;
}

const MilitaryForm = ({ profile, onUpdate }: MilitaryFormProps) => {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      military_commissariat: profile?.military_commissariat || "",
      military_commissariat_address: profile?.military_commissariat_address || "",
      superior_military_commissariat: profile?.superior_military_commissariat || "",
      superior_military_commissariat_address: profile?.superior_military_commissariat_address || "",
      court_by_military: profile?.court_by_military || "",
      court_by_registration: profile?.court_by_registration || "",
      prosecutor_office: profile?.prosecutor_office || "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", profile.id);

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Данные о военкомате сохранены",
      });

      onUpdate(profile.id);
    } catch (error) {
      console.error("Error updating military data:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить данные",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAIAssist = async () => {
    if (!profile?.city || !profile?.registration_address) {
      toast({
        title: "Заполните данные",
        description: "Сначала укажите город и адрес регистрации в разделе 'Личные данные'",
        variant: "destructive",
      });
      return;
    }

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("find-government-structures", {
        body: {
          city: profile.city,
          address: profile.registration_address,
          region: profile.region,
        },
      });

      if (error) throw error;

      if (data?.suggestions) {
        form.setValue("military_commissariat", data.suggestions.military_commissariat || "");
        form.setValue("military_commissariat_address", data.suggestions.military_commissariat_address || "");
        form.setValue("superior_military_commissariat", data.suggestions.superior_military_commissariat || "");
        form.setValue("superior_military_commissariat_address", data.suggestions.superior_military_commissariat_address || "");
        form.setValue("court_by_military", data.suggestions.court_by_military || "");
        form.setValue("court_by_registration", data.suggestions.court_by_registration || "");
        form.setValue("prosecutor_office", data.suggestions.prosecutor_office || "");

        toast({
          title: "AI заполнил поля",
          description: "Проверьте и отредактируйте данные при необходимости",
        });
      }
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось получить подсказки от AI",
        variant: "destructive",
      });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Военкомат и госструктуры</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAIAssist}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI Помощник
          </Button>
        </CardTitle>
        <CardDescription>
          Укажите данные военкомата и связанных госструктур. Используйте AI помощника для автозаполнения
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="military_commissariat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Военкомат по месту регистрации</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Московский районный военкомат" 
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="military_commissariat_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес военкомата</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="г. Москва, ул. Ленина, д. 15" 
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="superior_military_commissariat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Вышестоящий военкомат</FormLabel>
                    <FormControl>
                      <Input placeholder="Военный комиссариат Московской области" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="superior_military_commissariat_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес вышестоящего военкомата</FormLabel>
                    <FormControl>
                      <Input placeholder="г. Москва, ул. Пушкина, д. 20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="court_by_military"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Суд по адресу военкомата</FormLabel>
                    <FormControl>
                      <Input placeholder="Московский районный суд" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="court_by_registration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Суд по месту регистрации</FormLabel>
                    <FormControl>
                      <Input placeholder="Ленинский районный суд" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="prosecutor_office"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Прокуратура</FormLabel>
                    <FormControl>
                      <Input placeholder="Прокуратура Московской области" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default MilitaryForm;
