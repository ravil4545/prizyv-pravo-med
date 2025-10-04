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
  full_name: z.string().optional(),
  phone: z.string().optional(),
  passport_series: z.string().optional(),
  passport_number: z.string().optional(),
  passport_issued_by: z.string().optional(),
  passport_issue_date: z.string().optional(),
  passport_code: z.string().optional(),
  birth_date: z.string().optional(),
  birth_place: z.string().optional(),
  registration_address: z.string().optional(),
  actual_address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
});

interface PersonalDataFormProps {
  profile: any;
  onUpdate: (userId: string) => void;
}

const PersonalDataForm = ({ profile, onUpdate }: PersonalDataFormProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: profile?.full_name || "",
      phone: profile?.phone || "",
      passport_series: profile?.passport_series || "",
      passport_number: profile?.passport_number || "",
      passport_issued_by: profile?.passport_issued_by || "",
      passport_issue_date: profile?.passport_issue_date || "",
      passport_code: profile?.passport_code || "",
      birth_date: profile?.birth_date || "",
      birth_place: profile?.birth_place || "",
      registration_address: profile?.registration_address || "",
      actual_address: profile?.actual_address || "",
      city: profile?.city || "",
      region: profile?.region || "",
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
        description: "Данные сохранены",
      });

      onUpdate(profile.id);
    } catch (error) {
      console.error("Error updating profile:", error);
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
        <CardTitle>Личные и паспортные данные</CardTitle>
        <CardDescription>
          Заполните все поля для формирования документов
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ФИО полностью</FormLabel>
                    <FormControl>
                      <Input placeholder="Иванов Иван Иванович" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Телефон</FormLabel>
                    <FormControl>
                      <Input placeholder="+7 (999) 999-99-99" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="birth_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата рождения</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="birth_place"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Место рождения</FormLabel>
                    <FormControl>
                      <Input placeholder="г. Москва" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passport_series"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Серия паспорта</FormLabel>
                    <FormControl>
                      <Input placeholder="1234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passport_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер паспорта</FormLabel>
                    <FormControl>
                      <Input placeholder="567890" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passport_issue_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата выдачи</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passport_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Код подразделения</FormLabel>
                    <FormControl>
                      <Input placeholder="123-456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="passport_issued_by"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Кем выдан паспорт</FormLabel>
                    <FormControl>
                      <Input placeholder="Отделом УФМС России..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Город</FormLabel>
                    <FormControl>
                      <Input placeholder="Москва" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Регион</FormLabel>
                    <FormControl>
                      <Input placeholder="Московская область" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="registration_address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Адрес регистрации (прописка)</FormLabel>
                    <FormControl>
                      <Input placeholder="г. Москва, ул. Ленина, д. 1, кв. 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actual_address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Фактический адрес проживания</FormLabel>
                    <FormControl>
                      <Input placeholder="г. Москва, ул. Пушкина, д. 2, кв. 3" {...field} />
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

export default PersonalDataForm;
