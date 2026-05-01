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
import { MessageCircle, AlertCircle, FileText, Award, Heart, Search } from "lucide-react";
import { forumPostSchema } from "@/lib/validations";
import ForumComments from "@/components/ForumComments";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sanitizeHtml } from "@/lib/sanitize";
import { enhanceTypography } from "@/lib/typography";
import RichTextEditor from "@/components/RichTextEditor";
import EmptyState from "@/components/EmptyState";
import MobileBottomNav from "@/components/MobileBottomNav";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [likes, setLikes] = useState<Record<string, number>>({});
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkUser();
    loadPosts();
  }, []);

  useEffect(() => {
    if (posts.length > 0) loadLikes();
  }, [posts, user]);

  const loadLikes = async () => {
    const postIds = posts.map(p => p.id);
    const { data: likeCounts } = await supabase
      .from("forum_post_likes")
      .select("post_id")
      .in("post_id", postIds);

    const counts: Record<string, number> = {};
    for (const row of likeCounts || []) {
      counts[row.post_id] = (counts[row.post_id] || 0) + 1;
    }
    setLikes(counts);

    if (user) {
      const { data: myLikes } = await supabase
        .from("forum_post_likes")
        .select("post_id")
        .in("post_id", postIds)
        .eq("user_id", user.id);
      setLikedPosts(new Set((myLikes || []).map(r => r.post_id)));
    }
  };

  const toggleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    if (!user) {
      toast({ title: "Требуется авторизация", description: "Войдите, чтобы ставить лайки", variant: "destructive" });
      return;
    }
    const isLiked = likedPosts.has(postId);
    if (isLiked) {
      await supabase.from("forum_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
      setLikedPosts(prev => { const s = new Set(prev); s.delete(postId); return s; });
      setLikes(prev => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }));
    } else {
      await supabase.from("forum_post_likes").insert({ post_id: postId, user_id: user.id });
      setLikedPosts(prev => new Set([...prev, postId]));
      setLikes(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    }
  };

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

  const filteredPosts = posts.filter((post) => {
    if (post.topic_type !== activeTopic) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return post.title.toLowerCase().includes(q) || post.content.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-8 sm:py-12 md:py-20 px-3 sm:px-4 pb-24 md:pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-3">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">Форум призывников</h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
              Делитесь опытом, получайте ответы от сообщества
            </p>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по темам форума..."
              className="pl-9"
            />
          </div>

          <Tabs value={activeTopic} onValueChange={(v: any) => setActiveTopic(v)} className="mb-6">
            <TabsList className="grid w-full grid-cols-3 h-auto p-1 gap-1">
              <TabsTrigger value="urgent" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Срочные</span>
              </TabsTrigger>
              <TabsTrigger value="diagnoses" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm">
                <FileText className="w-4 h-4" />
                <span>Диагнозы</span>
              </TabsTrigger>
              <TabsTrigger value="success_stories" className="flex-col sm:flex-row gap-1 sm:gap-2 py-2.5 sm:py-2 text-xs sm:text-sm">
                <Award className="w-4 h-4" />
                <span>Успехи</span>
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
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                    <button
                      onClick={(e) => toggleLike(e, post.id)}
                      className={`flex items-center gap-1.5 text-sm transition-colors ${
                        likedPosts.has(post.id) ? "text-red-500" : "text-muted-foreground hover:text-red-400"
                      }`}
                    >
                      <Heart className={`h-4 w-4 ${likedPosts.has(post.id) ? "fill-current" : ""}`} />
                      <span>{likes[post.id] || 0}</span>
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <EmptyState
              icon={searchQuery ? Search : MessageCircle}
              title={searchQuery ? "Ничего не найдено" : "Постов пока нет"}
              description={
                searchQuery
                  ? "Попробуйте другой поисковый запрос"
                  : user
                    ? "Будьте первым, кто создаст пост в этом разделе"
                    : "Войдите, чтобы создать пост"
              }
              action={
                !user && !searchQuery
                  ? { label: "Войти", onClick: () => { window.location.href = "/auth"; } }
                  : undefined
              }
            />
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
