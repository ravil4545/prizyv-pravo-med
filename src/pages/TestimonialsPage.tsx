import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { testimonialSchema } from "@/lib/validations";

interface Testimonial {
  id: string;
  author_name: string;
  content: string;
  rating: number;
  created_at: string;
}

const TestimonialsPage = () => {
  const { toast } = useToast();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [newTestimonial, setNewTestimonial] = useState("");
  const [rating, setRating] = useState(5);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authorName, setAuthorName] = useState("");

  useEffect(() => {
    loadTestimonials();
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    
    // Fetch user's full name from profiles if available
    if (session?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();
      
      if (profile?.full_name) {
        setAuthorName(profile.full_name);
      } else {
        setAuthorName("Аноним");
      }
    }
  };

  const loadTestimonials = async () => {
    const { data, error } = await supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить отзывы",
        variant: "destructive",
      });
    } else {
      setTestimonials(data || []);
    }
  };

  const submitTestimonial = async () => {
    if (!user) {
      toast({
        title: "Требуется авторизация",
        description: "Войдите для добавления отзыва",
        variant: "destructive",
      });
      return;
    }

    setErrors({});

    // Validate input
    const validation = testimonialSchema.safeParse({ content: newTestimonial, rating });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        variant: "destructive",
        title: "Ошибка валидации",
        description: "Проверьте правильность заполнения полей",
      });
      return;
    }

    setLoading(true);

    const { error } = await supabase
      .from("testimonials")
      .insert({
        author_name: authorName || "Аноним",
        content: validation.data.content,
        rating: validation.data.rating,
      });

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Отзыв отправлен",
        description: "Ваш отзыв будет опубликован после модерации",
      });
      setNewTestimonial("");
      setRating(5);
      loadTestimonials();
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-12 gradient-text">
            Отзывы клиентов
          </h1>

          {user && (
            <Card className="mb-8 glass-card">
              <CardHeader>
                <CardTitle>Оставить отзыв</CardTitle>
                <CardDescription>Поделитесь своим опытом</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-8 h-8 cursor-pointer transition-colors ${
                        star <= rating ? "fill-primary text-primary" : "text-muted"
                      }`}
                      onClick={() => setRating(star)}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <Textarea
                    placeholder="Ваш отзыв..."
                    value={newTestimonial}
                    onChange={(e) => setNewTestimonial(e.target.value)}
                    rows={4}
                    maxLength={1000}
                  />
                  {errors.content && <p className="text-sm text-destructive">{errors.content}</p>}
                </div>
                <Button onClick={submitTestimonial} disabled={loading}>
                  Отправить отзыв
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.id} className="glass-card hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold">{testimonial.author_name}</p>
                      <div className="flex gap-1 mt-1">
                        {Array.from({ length: testimonial.rating }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(testimonial.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <p className="text-foreground/90">{testimonial.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default TestimonialsPage;