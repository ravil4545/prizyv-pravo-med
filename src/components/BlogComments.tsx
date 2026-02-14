import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { enhanceTypography } from "@/lib/typography";
import { sanitizeHtml } from "@/lib/sanitize";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  status: string;
  profiles?: {
    full_name: string | null;
  };
}

interface BlogCommentsProps {
  postId: string;
}

const BlogComments = ({ postId }: BlogCommentsProps) => {
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkUser();
    loadComments();
  }, [postId]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      setIsAdmin(roles?.some(r => r.role === "admin") || false);
    }
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("blog_comments")
      .select("*")
      .eq("post_id", postId)
      .eq("status", "approved")
      .order("created_at", { ascending: true });

    if (!error && data) {
      // Fetch profile names separately
      const commentsWithNames = await Promise.all(
        data.map(async (comment) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", comment.user_id)
            .single();
          
          return {
            ...comment,
            profiles: { full_name: profile?.full_name || null },
          };
        })
      );
      setComments(commentsWithNames);
    }
  };

  const createComment = async () => {
    if (!user || !newComment.trim()) return;

    setLoading(true);
    const { error } = await supabase
      .from("blog_comments")
      .insert({
        post_id: postId,
        user_id: user.id,
        content: newComment,
      });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось добавить комментарий",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Комментарий добавлен",
        description: "Ваш комментарий будет опубликован после модерации",
      });
      setNewComment("");
      loadComments();
    }
    setLoading(false);
  };

  const deleteComment = async (commentId: string) => {
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
        title: "Удалено",
        description: "Комментарий удален",
      });
      loadComments();
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-2xl font-semibold">Комментарии</h3>

      {user && (
        <Card>
          <CardContent className="pt-6">
            <Textarea
              placeholder="Написать комментарий..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
              className="mb-4"
            />
            <Button onClick={createComment} disabled={loading || !newComment.trim()}>
              Отправить
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {comments.map((comment) => (
          <Card key={comment.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {comment.profiles?.full_name || "Пользователь"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(comment.created_at).toLocaleString("ru")}
                  </p>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteComment(comment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-slate dark:prose-invert max-w-none prose-sm
                prose-p:text-foreground prose-strong:text-foreground">
                {comment.content.includes('<p>') || comment.content.includes('<h') ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.content) }} />
                ) : (
                  <p className="whitespace-pre-wrap">{enhanceTypography(comment.content)}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {comments.length === 0 && (
          <p className="text-center text-muted-foreground py-4">
            Пока нет комментариев
          </p>
        )}
      </div>
    </div>
  );
};

export default BlogComments;