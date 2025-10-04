import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Edit, Trash } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  slug: string;
  status: string;
  created_at: string;
}

const AdminBlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    excerpt: "",
    category: "",
    slug: "",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdmin();
    loadPosts();
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

  const loadPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить статьи",
        variant: "destructive",
      });
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  const openCreateDialog = () => {
    setEditingPost(null);
    setFormData({
      title: "",
      content: "",
      excerpt: "",
      category: "",
      slug: "",
    });
    setShowDialog(true);
  };

  const openEditDialog = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || "",
      category: post.category || "",
      slug: post.slug,
    });
    setShowDialog(true);
  };

  const handleSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingPost) {
      const { error } = await supabase
        .from("blog_posts")
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingPost.id);

      if (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось обновить статью",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Статья обновлена",
        });
        setShowDialog(false);
        loadPosts();
      }
    } else {
      const { error } = await supabase
        .from("blog_posts")
        .insert({
          ...formData,
          author_id: user.id,
          status: "published",
          published_at: new Date().toISOString(),
        });

      if (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось создать статью",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Статья создана",
        });
        setShowDialog(false);
        loadPosts();
      }
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Вы уверены, что хотите удалить эту статью?")) return;

    const { error } = await supabase
      .from("blog_posts")
      .delete()
      .eq("id", postId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить статью",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Статья удалена",
      });
      loadPosts();
    }
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
              <h1 className="text-3xl font-bold mb-2">Управление блогом</h1>
              <p className="text-muted-foreground">
                Создание и редактирование статей
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Создать статью
              </Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {posts.map((post) => (
              <Card key={post.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Категория: {post.category}</span>
                        <span>{new Date(post.created_at).toLocaleString("ru")}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4 line-clamp-2">{post.excerpt}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDialog(post)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Редактировать
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(post.id)}
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Удалить
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPost ? "Редактировать статью" : "Создать статью"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Заголовок</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="slug">URL (slug)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="my-article-url"
              />
            </div>
            <div>
              <Label htmlFor="category">Категория</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="excerpt">Краткое описание</Label>
              <Textarea
                id="excerpt"
                value={formData.excerpt}
                onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="content">Содержание</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={10}
              />
            </div>
            <Button onClick={handleSubmit}>
              {editingPost ? "Сохранить изменения" : "Создать статью"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBlogPage;
