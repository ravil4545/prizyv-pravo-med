import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { enhanceTypography } from "@/lib/typography";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  category: string | null;
  published_at: string | null;
  image_url: string | null;
}

const BlogPreview = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(3);

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error loading posts:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || posts.length === 0) return null;

  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Последние статьи</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Актуальная информация о призыве и воинском учёте
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {posts.map((post) => (
            <Link to="/blog" key={post.id}>
              <Card className="h-full cursor-pointer hover:shadow-lg transition-all overflow-hidden group">
                {post.image_url && (
                  <div className="w-full h-48 overflow-hidden">
                    <img 
                      src={post.image_url} 
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    {post.category && (
                      <Badge variant="secondary">{post.category}</Badge>
                    )}
                    {post.published_at && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {format(new Date(post.published_at), "dd.MM.yyyy")}
                        </span>
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-xl line-clamp-2">{post.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3">
                    {enhanceTypography(post.excerpt || post.content.substring(0, 120) + "...")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="text-center">
          <Link to="/blog">
            <Button size="lg" className="group">
              Все статьи
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default BlogPreview;
