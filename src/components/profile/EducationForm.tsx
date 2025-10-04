import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  education_institution: z.string().optional(),
  education_type: z.string().optional(),
  education_specialty: z.string().optional(),
  education_course: z.string().optional(),
});

interface EducationFormProps {
  profile: any;
  onUpdate: (userId: string) => void;
}

const EducationForm = ({ profile, onUpdate }: EducationFormProps) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      education_institution: profile?.education_institution || "",
      education_type: profile?.education_type || "",
      education_specialty: profile?.education_specialty || "",
      education_course: profile?.education_course || "",
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
        description: "Данные об образовании сохранены",
      });

      onUpdate(profile.id);
    } catch (error) {
      console.error("Error updating education:", error);
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
        <CardTitle>Данные об образовании</CardTitle>
        <CardDescription>
          Укажите информацию об учебном заведении
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="education_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип образования</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите тип" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="school">Среднее (школа)</SelectItem>
                        <SelectItem value="college">Среднее специальное (колледж)</SelectItem>
                        <SelectItem value="university">Высшее (университет)</SelectItem>
                        <SelectItem value="postgraduate">Аспирантура</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="education_course"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Курс / Класс</FormLabel>
                    <FormControl>
                      <Input placeholder="1 курс / 11 класс" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="education_institution"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Название учебного заведения</FormLabel>
                    <FormControl>
                      <Input placeholder="МГУ им. М.В. Ломоносова" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="education_specialty"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Специальность / Направление</FormLabel>
                    <FormControl>
                      <Input placeholder="Юриспруденция" {...field} />
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

export default EducationForm;
