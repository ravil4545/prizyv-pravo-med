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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Edit, Trash, MessageSquare, CheckCircle, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { enhanceTypography } from "@/lib/typography";
import RichTextEditor from "@/components/RichTextEditor";
import { autoSlugFromTitle, autoExcerpt, calcReadingTimeMin, readingTimeLabel } from "@/lib/blogUtils";
import { slugifyRu } from "@/lib/slug";

interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  slug: string;
  status: string;
  created_at: string;
  image_url: string | null;
}

interface BlogComment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  post_id: string;
  status: string;
  author_name?: string;
  post_title?: string;
}

const AdminBlogPage = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [activeTab, setActiveTab] = useState("posts");
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    excerpt: "",
    category: "",
    slug: "",
    image_url: "",
    status: "published",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerptTouched, setExcerptTouched] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Авто-заполнение slug пока пользователь его не редактировал
  useEffect(() => {
    if (!slugTouched && formData.title) {
      setFormData((prev) => ({ ...prev, slug: autoSlugFromTitle(formData.title) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.title, slugTouched]);

  // Авто-заполнение excerpt из content
  useEffect(() => {
    if (!excerptTouched && formData.content) {
      setFormData((prev) => ({ ...prev, excerpt: autoExcerpt(formData.content) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.content, excerptTouched]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAdmin();
    loadPosts();
    loadComments();
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
        description: "Не удалось загрузить посты",
        variant: "destructive",
      });
    } else {
      setPosts(data || []);
    }
    setLoading(false);
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("blog_comments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading comments:", error);
      return;
    }

    // Fetch author names and post titles
    const commentsWithDetails = await Promise.all(
      (data || []).map(async (comment) => {
        const [profileResult, postResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("full_name")
            .eq("id", comment.user_id)
            .single(),
          supabase
            .from("blog_posts")
            .select("title")
            .eq("id", comment.post_id)
            .single()
        ]);
        
        return {
          ...comment,
          author_name: profileResult.data?.full_name || "Неизвестный",
          post_title: postResult.data?.title || "Удалённая статья",
        };
      })
    );
    setComments(commentsWithDetails);
  };

  const openCreateDialog = () => {
    setEditingPost(null);
    setFormData({
      title: "",
      content: "",
      excerpt: "",
      category: "",
      slug: "",
      image_url: "",
      status: "published",
    });
    setSlugTouched(false);
    setExcerptTouched(false);
    setImageFile(null);
    setShowDialog(true);
  };

  const openEditDialog = (post: BlogPost) => {
    setEditingPost(post);
    setFormData({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      category: post.category,
      slug: post.slug,
      image_url: post.image_url || "",
      status: post.status || "published",
    });
    // Уже существующая запись — slug и excerpt считаем редактируемыми вручную
    setSlugTouched(true);
    setExcerptTouched(true);
    setImageFile(null);
    setShowDialog(true);
  };

  const handleImageUpload = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('blog-images')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('blog-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить изображение",
        variant: "destructive",
      });
      return null;
    }
  };

  const removeCurrentImage = async () => {
    if (formData.image_url && editingPost) {
      // Extract filename from URL
      const fileName = formData.image_url.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('blog-images')
          .remove([fileName]);
      }
    }
    setFormData({ ...formData, image_url: "" });
    setImageFile(null);
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.content || !formData.slug) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля",
        variant: "destructive",
      });
      return;
    }

    let imageUrl = formData.image_url;

    // Upload new image if selected
    if (imageFile) {
      setUploadingImage(true);
      imageUrl = await handleImageUpload(imageFile);
      setUploadingImage(false);
      
      if (!imageUrl) {
        return;
      }
    }

    // Защита от «URL вместо слага» (ломало 4 поста: /blog/https://… = 404).
    // Вставленный URL заменяем слагом из заголовка, ручной ввод нормализуем.
    const rawSlug = formData.slug.trim();
    const finalSlug = /^https?:\/\//i.test(rawSlug)
      ? autoSlugFromTitle(formData.title)
      : slugifyRu(rawSlug) || autoSlugFromTitle(formData.title);
    const finalExcerpt = formData.excerpt || autoExcerpt(formData.content);
    const isPublishing = formData.status === "published";
    const wasPublished = editingPost?.status === "published";
    const postData: Record<string, any> = {
      ...formData,
      slug: finalSlug,
      excerpt: finalExcerpt,
      image_url: imageUrl,
    };
    // published_at: при первой публикации — сейчас, для черновика — null, для уже опубликованного — не трогаем
    if (isPublishing && !wasPublished) {
      postData.published_at = new Date().toISOString();
    } else if (!isPublishing) {
      postData.published_at = null;
    }

    if (editingPost) {
      const { error } = await supabase
        .from("blog_posts")
        .update(postData)
        .eq("id", editingPost.id);

      if (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось обновить пост",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Пост обновлён",
        });
        setShowDialog(false);
        loadPosts();
      }
    } else {
      const { error } = await supabase
        .from("blog_posts")
        .insert(postData as any);

      if (error) {
        toast({
          title: "Ошибка",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Пост создан",
        });
        setShowDialog(false);
        loadPosts();
      }
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Вы уверены, что хотите удалить эту статью? Все комментарии к ней также будут удалены.")) {
      return;
    }

    // First delete all comments for this post
    const { error: commentsError } = await supabase
      .from("blog_comments")
      .delete()
      .eq("post_id", postId);

    if (commentsError) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить комментарии статьи",
        variant: "destructive",
      });
      return;
    }

    // Then delete the post
    const { error } = await supabase
      .from("blog_posts")
      .delete()
      .eq("id", postId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить пост",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Пост и его комментарии удалены",
      });
      loadPosts();
      loadComments();
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот комментарий?")) {
      return;
    }

    const { error } = await supabase
      .from("blog_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить комментарий",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Комментарий удален",
      });
      loadComments();
    }
  };

  const approveComment = async (commentId: string) => {
    const { error } = await supabase
      .from("blog_comments")
      .update({ status: "approved" })
      .eq("id", commentId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось одобрить комментарий",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Комментарий одобрен",
      });
      loadComments();
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
                Новая статья
              </Button>
              <Button variant="ghost" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="posts">
                Статьи ({posts.length})
              </TabsTrigger>
              <TabsTrigger value="comments">
                <MessageSquare className="mr-2 h-4 w-4" />
                Комментарии
                {comments.filter(c => c.status === 'pending').length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {comments.filter(c => c.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="posts">
            <div className="grid gap-4">
              {posts.map((post) => (
                <Card key={post.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-2">{post.title}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Категория: {post.category || "Без категории"}</span>
                          <span>{new Date(post.created_at).toLocaleString("ru")}</span>
                        </div>
                      </div>
                      <Badge variant={post.status === "published" ? "default" : "secondary"}>
                        {post.status === "published" ? "Опубликован" : "Черновик"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-4 line-clamp-2">{enhanceTypography(post.excerpt || post.content)}</p>
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
              {posts.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">Нет статей</p>
                  </CardContent>
                </Card>
              )}
            </div>
            </TabsContent>

            <TabsContent value="comments">
            <div className="space-y-4">
              {comments.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Нет комментариев</p>
                  </CardContent>
                </Card>
              ) : (
                comments.map((comment) => (
                  <Card key={comment.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={comment.status === "approved" ? "default" : "secondary"}>
                              {comment.status === "approved" ? "Одобрен" : "На модерации"}
                            </Badge>
                            <p className="text-sm text-muted-foreground">
                              {comment.author_name}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            К статье: {comment.post_title}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {comment.status !== "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => approveComment(comment.id)}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Одобрить
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteComment(comment.id)}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Удалить
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap">{comment.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(comment.created_at).toLocaleString("ru-RU")}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
            </TabsContent>
          </Tabs>
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
                placeholder="Заголовок статьи"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="slug">URL (slug)</Label>
                {!slugTouched && formData.title && (
                  <span className="text-[10px] text-muted-foreground font-mono">авто из заголовка</span>
                )}
              </div>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => { setSlugTouched(true); setFormData({ ...formData, slug: e.target.value }); }}
                placeholder="url-statii"
              />
              {formData.slug && (
                <p className="mt-1 text-[11px] text-muted-foreground font-mono break-all">
                  /blog/{formData.slug}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="category">Категория</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Категория"
              />
            </div>
            <div>
              <Label htmlFor="image">Изображение</Label>
              <div className="space-y-2">
                {formData.image_url && (
                  <div className="relative">
                    <img 
                      src={formData.image_url} 
                      alt="Preview" 
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2"
                      onClick={removeCurrentImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {!formData.image_url && (
                  <div className="flex items-center gap-2">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setImageFile(file);
                        }
                      }}
                    />
                    {imageFile && (
                      <Badge variant="secondary">
                        <Upload className="h-3 w-3 mr-1" />
                        {imageFile.name}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="excerpt">Краткое описание</Label>
                {!excerptTouched && formData.content && (
                  <span className="text-[10px] text-muted-foreground font-mono">авто из текста</span>
                )}
              </div>
              <Textarea
                id="excerpt"
                value={formData.excerpt}
                onChange={(e) => { setExcerptTouched(true); setFormData({ ...formData, excerpt: e.target.value }); }}
                placeholder="Краткое описание для превью"
                rows={3}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="content">Содержание</Label>
                {formData.content && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {readingTimeLabel(calcReadingTimeMin(formData.content))}
                  </span>
                )}
              </div>
              <RichTextEditor
                value={formData.content}
                onChange={(value) => setFormData({ ...formData, content: value })}
                placeholder="Полный текст статьи с форматированием"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
              <div>
                <Label className="text-sm font-medium block mb-0.5">
                  Статус: {formData.status === "published" ? "Опубликовано" : "Черновик"}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {formData.status === "published" ? "Видно всем посетителям сайта" : "Сохранится, но не появится в публичном списке"}
                </p>
              </div>
              <div className="inline-flex border rounded-md overflow-hidden">
                <Button
                  type="button"
                  variant={formData.status === "draft" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8"
                  onClick={() => setFormData({ ...formData, status: "draft" })}
                >
                  Черновик
                </Button>
                <Button
                  type="button"
                  variant={formData.status === "published" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-8"
                  onClick={() => setFormData({ ...formData, status: "published" })}
                >
                  Опубликовать
                </Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Отмена
              </Button>
              <Button onClick={handleSubmit} disabled={uploadingImage}>
                {uploadingImage ? "Загрузка..." : editingPost ? "Сохранить" : (formData.status === "published" ? "Создать и опубликовать" : "Создать черновик")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminBlogPage;