import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, XCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ForumPost {
  id: string;
  title: string;
  content: string;
  topic_type: string;
  status: string;
  created_at: string;
  user_id: string;
  author_name?: string;
}

const AdminForumPage = () => {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdmin();
    loadPosts();
    setupRealtimeSubscription();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some(r => r.role === "admin");
    if (!isAdmin) {
      toast({
        title: "Доступ запрещён",
        description: "У вас нет прав администратора",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("forum-admin-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "forum_posts",
        },
        (payload) => {
          toast({
            title: "Новая тема на форуме",
            description: `Пользователь создал новую тему: ${payload.new.title}`,
          });
          loadPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadPosts = async () => {
    setLoading(true);
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
      setLoading(false);
      return;
    }

    // Fetch profile names separately
    const postsWithNames = await Promise.all(
      (data || []).map(async (post) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", post.user_id)
          .single();
        
        return {
          ...post,
          author_name: profile?.full_name || "Неизвестен",
        };
      })
    );

    setPosts(postsWithNames);
    setLoading(false);
  };

  const updatePostStatus = async (postId: string, status: string) => {
    const { error } = await supabase
      .from("forum_posts")
      .update({ status })
      .eq("id", postId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось обновить статус",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: `Тема ${status === "approved" ? "одобрена" : "отклонена"}`,
      });
      loadPosts();
      setSelectedPost(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "Ожидает",
      approved: "Одобрено",
      rejected: "Отклонено",
    };
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

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
              <h1 className="text-3xl font-bold mb-2">Управление форумом</h1>
              <p className="text-muted-foreground">
                Модерация тем и сообщений
              </p>
            </div>
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад
            </Button>
          </div>

          <div className="grid gap-4">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Автор: {post.author_name}</span>
                        <span>Категория: {post.topic_type}</span>
                        <span>{new Date(post.created_at).toLocaleString("ru")}</span>
                      </div>
                    </div>
                    {getStatusBadge(post.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4 line-clamp-2">{post.content}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedPost(post)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Просмотр
                    </Button>
                    {post.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => updatePostStatus(post.id, "approved")}
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Одобрить
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updatePostStatus(post.id, "rejected")}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Отклонить
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedPost?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Автор: {selectedPost?.author_name}</span>
              <span>Категория: {selectedPost?.topic_type}</span>
              {selectedPost && getStatusBadge(selectedPost.status)}
            </div>
            <p className="whitespace-pre-wrap">{selectedPost?.content}</p>
            {selectedPost?.status === "pending" && (
              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={() => updatePostStatus(selectedPost.id, "approved")}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Одобрить
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => updatePostStatus(selectedPost.id, "rejected")}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Отклонить
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminForumPage;
