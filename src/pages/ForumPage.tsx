import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, AlertCircle, FileText, Award } from "lucide-react";

interface ForumPost {
  id: string;
  topic_type: "urgent" | "diagnoses" | "success_stories";
  title: string;
  content: string;
  created_at: string;
  user_id: string;
}

const ForumPage = () => {
  const { toast } = useToast();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [user, setUser] = useState<any>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [activeTopic, setActiveTopic] = useState<"urgent" | "diagnoses" | "success_stories">("urgent");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkUser();
    loadPosts();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
  };

  const loadPosts = async () => {
    const { data, error } = await supabase
      .from("forum_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить посты",
        variant: "destructive",
      });
    } else {
      setPosts(data || []);
    }
  };

  const createPost = async () => {
    if (!user) {
      toast({
        title: "Требуется авторизация",
        description: "Войдите для создания постов",
        variant: "destructive",
      });
      return;
    }

    if (!newTitle.trim() || !newContent.trim()) return;

    setLoading(true);

    const { error } = await supabase
      .from("forum_posts")
      .insert({
        topic_type: activeTopic,
        title: newTitle,
        content: newContent,
        user_id: user.id,
      });

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Пост создан",
        description: "Ваш пост будет опубликован после модерации",
      });
      setNewTitle("");
      setNewContent("");
      loadPosts();
    }

    setLoading(false);
  };

  const getTopicIcon = (type: string) => {
    switch (type) {
      case "urgent":
        return <AlertCircle className="w-5 h-5" />;
      case "diagnoses":
        return <FileText className="w-5 h-5" />;
      case "success_stories":
        return <Award className="w-5 h-5" />;
      default:
        return <MessageCircle className="w-5 h-5" />;
    }
  };

  const getTopicLabel = (type: string) => {
    switch (type) {
      case "urgent":
        return "Срочные вопросы";
      case "diagnoses":
        return "Непризывные диагнозы";
      case "success_stories":
        return "Истории успеха";
      default:
        return type;
    }
  };

  const filteredPosts = posts.filter((post) => post.topic_type === activeTopic);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-12 gradient-text">
            Форум
          </h1>

          <Tabs value={activeTopic} onValueChange={(v: any) => setActiveTopic(v)} className="mb-8">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="urgent">
                <AlertCircle className="w-4 h-4 mr-2" />
                Срочные вопросы
              </TabsTrigger>
              <TabsTrigger value="diagnoses">
                <FileText className="w-4 h-4 mr-2" />
                Диагнозы
              </TabsTrigger>
              <TabsTrigger value="success_stories">
                <Award className="w-4 h-4 mr-2" />
                Истории успеха
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {user && (
            <Card className="mb-8 glass-card">
              <CardHeader>
                <CardTitle>Создать пост</CardTitle>
                <CardDescription>
                  Раздел: {getTopicLabel(activeTopic)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Заголовок..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <Textarea
                  placeholder="Содержание поста..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={5}
                />
                <Button onClick={createPost} disabled={loading}>
                  Опубликовать
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="glass-card hover-lift">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getTopicIcon(post.topic_type)}
                        <Badge variant="outline">
                          {getTopicLabel(post.topic_type)}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{post.title}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground/90 whitespace-pre-wrap">{post.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {user ? "Будьте первым, кто создаст пост в этом разделе" : "Войдите, чтобы создать пост"}
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ForumPage;