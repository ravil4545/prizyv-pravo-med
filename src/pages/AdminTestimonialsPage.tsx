import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, X, Trash2, Star } from "lucide-react";

interface Testimonial {
  id: string;
  author_name: string;
  content: string;
  rating: number;
  status: string;
  created_at: string;
}

const AdminTestimonialsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadTestimonials();
    }
  }, [user]);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const isAdmin = roles?.some(r => r.role === "admin");
      
      if (!isAdmin) {
        navigate("/dashboard");
        return;
      }

      setUser(session.user);
    } catch (error) {
      console.error("Error checking user:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTestimonials = async () => {
    const { data, error } = await supabase
      .from("testimonials")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTestimonials(data);
    }
  };

  const approveTestimonial = async (id: string) => {
    const { error } = await supabase
      .from("testimonials")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось одобрить отзыв",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Одобрено",
        description: "Отзыв успешно одобрен",
      });
      loadTestimonials();
    }
  };

  const rejectTestimonial = async (id: string) => {
    const { error } = await supabase
      .from("testimonials")
      .update({ status: "rejected" })
      .eq("id", id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отклонить отзыв",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Отклонено",
        description: "Отзыв отклонен",
      });
      loadTestimonials();
    }
  };

  const deleteTestimonial = async (id: string) => {
    const { error } = await supabase
      .from("testimonials")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить отзыв",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Удалено",
        description: "Отзыв удален",
      });
      loadTestimonials();
    }
  };

  const pendingCount = testimonials.filter(t => t.status === "pending").length;
  const approvedCount = testimonials.filter(t => t.status === "approved").length;
  const rejectedCount = testimonials.filter(t => t.status === "rejected").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-12">
          <div className="text-center">Загрузка...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад в личный кабинет
              </Button>
              <h1 className="text-3xl font-bold mt-4">Управление отзывами</h1>
            </div>
          </div>

          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">
                На модерации
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">
                Одобренные ({approvedCount})
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Отклоненные ({rejectedCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4 mt-6">
              {testimonials.filter(t => t.status === "pending").map((testimonial) => (
                <Card key={testimonial.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{testimonial.author_name}</CardTitle>
                        <div className="flex gap-1 mt-2">
                          {Array.from({ length: testimonial.rating }).map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                          ))}
                        </div>
                      </div>
                      <Badge variant="secondary">На модерации</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {new Date(testimonial.created_at).toLocaleString("ru")}
                    </p>
                    <p className="whitespace-pre-wrap mb-4">{testimonial.content}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveTestimonial(testimonial.id)}>
                        <Check className="mr-2 h-4 w-4" />
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectTestimonial(testimonial.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Отклонить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteTestimonial(testimonial.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pendingCount === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Нет отзывов на модерации</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4 mt-6">
              {testimonials.filter(t => t.status === "approved").map((testimonial) => (
                <Card key={testimonial.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{testimonial.author_name}</CardTitle>
                        <div className="flex gap-1 mt-2">
                          {Array.from({ length: testimonial.rating }).map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                          ))}
                        </div>
                      </div>
                      <Badge>Одобрен</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {new Date(testimonial.created_at).toLocaleString("ru")}
                    </p>
                    <p className="whitespace-pre-wrap mb-4">{testimonial.content}</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteTestimonial(testimonial.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {approvedCount === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Нет одобренных отзывов</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="rejected" className="space-y-4 mt-6">
              {testimonials.filter(t => t.status === "rejected").map((testimonial) => (
                <Card key={testimonial.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{testimonial.author_name}</CardTitle>
                        <div className="flex gap-1 mt-2">
                          {Array.from({ length: testimonial.rating }).map((_, i) => (
                            <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                          ))}
                        </div>
                      </div>
                      <Badge variant="destructive">Отклонен</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {new Date(testimonial.created_at).toLocaleString("ru")}
                    </p>
                    <p className="whitespace-pre-wrap mb-4">{testimonial.content}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveTestimonial(testimonial.id)}>
                        <Check className="mr-2 h-4 w-4" />
                        Одобрить
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteTestimonial(testimonial.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {rejectedCount === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Нет отклоненных отзывов</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AdminTestimonialsPage;
