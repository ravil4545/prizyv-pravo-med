import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  work_place: z.string().optional(),
  work_position: z.string().optional(),
  work_address: z.string().optional(),
});

interface WorkFormProps {
  profile: any;
  onUpdate: (userId: string) => void;
}

const WorkForm = ({ profile, onUpdate }: WorkFormProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      work_place: profile?.work_place || "",
      work_position: profile?.work_position || "",
      work_address: profile?.work_address || "",
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
        description: "Данные о работе сохранены",
      });

      onUpdate(profile.id);
    } catch (error) {
      console.error("Error updating work data:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить данные",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Данные о работе</CardTitle>
        <CardDescription>
          Укажите информацию о месте работы
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="work_place"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Место работы</FormLabel>
                    <FormControl>
                      <Input placeholder='ООО "Рога и Копыта"' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="work_position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Должность</FormLabel>
                    <FormControl>
                      <Input placeholder="Менеджер" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="work_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Адрес работы</FormLabel>
                    <FormControl>
                      <Input placeholder="г. Москва, ул. Ленина, д. 10" {...field} />
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

export default WorkForm;
