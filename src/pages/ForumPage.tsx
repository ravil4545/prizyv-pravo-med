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
import { forumPostSchema } from "@/lib/validations";
import ForumComments from "@/components/ForumComments";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sanitizeHtml } from "@/lib/sanitize";
import { enhanceTypography } from "@/lib/typography";
import RichTextEditor from "@/components/RichTextEditor";

interface ForumPost {
  id: string;
  topic_type: "urgent" | "diagnoses" | "success_stories" | "legal" | "health" | "general";
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);

  useEffect(() => {
    checkUser();
    loadPosts();
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);
  };

  const loadPosts = async () => {
    const { data, error } = await supabase.from("forum_posts").select("*").order("created_at", { ascending: false });

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

    setErrors({});

    // Validate input
    const validation = forumPostSchema.safeParse({ title: newTitle, content: newContent });
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

    const { error } = await supabase.from("forum_posts").insert({
      topic_type: activeTopic,
      title: validation.data.title,
      content: validation.data.content,
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
      case "legal":
        return <FileText className="w-5 h-5" />;
      case "health":
        return <FileText className="w-5 h-5" />;
      case "general":
        return <MessageCircle className="w-5 h-5" />;
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
      case "legal":
        return "Юридические вопросы";
      case "health":
        return "Медицинские вопросы";
      case "general":
        return "Общие вопросы";
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
          <h1 className="text-4xl font-bold text-center mb-12 gradient-text">Форум</h1>

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
                <CardDescription>Раздел: {getTopicLabel(activeTopic)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Input
                    placeholder="Заголовок..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    maxLength={200}
                  />
                  {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
                </div>
                <div className="space-y-2">
                  <RichTextEditor
                    value={newContent}
                    onChange={setNewContent}
                    placeholder="Содержание поста с форматированием..."
                  />
                  {errors.content && <p className="text-sm text-destructive">{errors.content}</p>}
                </div>
                <Button onClick={createPost} disabled={loading}>
                  Опубликовать
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {filteredPosts.map((post) => (
              <Card
                key={post.id}
                className="glass-card hover-lift cursor-pointer"
                onClick={() => setSelectedPost(post)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getTopicIcon(post.topic_type)}
                        <Badge variant="outline">{getTopicLabel(post.topic_type)}</Badge>
                      </div>
                      <CardTitle className="text-xl">{post.title}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(post.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div
                    className="prose prose-slate dark:prose-invert max-w-none prose-sm
                    prose-p:text-foreground/90 prose-p:mb-2 prose-strong:text-foreground line-clamp-3"
                  >
                    {post.content.includes("<p>") || post.content.includes("<h") ? (
                      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />
                    ) : (
                      <p className="whitespace-pre-wrap">{enhanceTypography(post.content)}</p>
                    )}
                  </div>
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

      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPost?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {selectedPost && getTopicIcon(selectedPost.topic_type)}
              <Badge variant="outline">{selectedPost && getTopicLabel(selectedPost.topic_type)}</Badge>
              <span className="text-sm text-muted-foreground ml-auto">
                {selectedPost && new Date(selectedPost.created_at).toLocaleDateString("ru-RU")}
              </span>
            </div>
            <div
              className="prose prose-slate dark:prose-invert max-w-none 
              prose-headings:font-bold prose-headings:text-foreground prose-headings:mt-6 prose-headings:mb-3
              prose-h2:text-2xl prose-h3:text-xl prose-h4:text-lg
              prose-p:text-base prose-p:leading-relaxed prose-p:mb-4 prose-p:text-foreground
              prose-strong:font-semibold prose-strong:text-foreground
              prose-li:text-base prose-li:leading-relaxed prose-li:mb-2
              prose-ul:my-4 prose-ol:my-4
              prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-muted prose-pre:border prose-pre:p-4 prose-pre:rounded-lg
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-blockquote:border-l-primary prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground
              prose-img:rounded-lg prose-img:shadow-lg
              prose-hr:border-border prose-hr:my-6"
            >
              {selectedPost?.content.includes("<p>") || selectedPost?.content.includes("<h") ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedPost.content) }} />
              ) : (
                <p className="whitespace-pre-wrap">{selectedPost && enhanceTypography(selectedPost.content)}</p>
              )}
            </div>
            {selectedPost && <ForumComments postId={selectedPost.id} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForumPage;
