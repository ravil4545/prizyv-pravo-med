import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import BlogPostImage from "@/components/BlogPostImage";
import { sectionNumber } from "@/lib/sectionNumbers";
import { blogExcerpt, normalizeBlogCategory, normalizeBlogTitle } from "@/lib/blogPresentation";

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

const BlogPostSkeleton = () => (
  <div className="flex flex-col space-y-3">
    <Skeleton className="h-48 w-full rounded-lg" />
    <div className="p-4 space-y-2">
      <div className="flex justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  </div>
);

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

  if (!loading && posts.length === 0) return null;

  return (
    <section className="py-20 bg-muted/30" aria-labelledby="blog-heading">
      <div className="container mx-auto px-4">
        <header className="text-center mb-12">
          {/* Секция шла без номера, из-за чего после «№ 11» у пользователя
              появлялся безымянный блок, а следом «№ 10». */}
          <div className="font-mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-gold mb-3">
            {sectionNumber("blog")} · Блог
          </div>
          <h2 id="blog-heading" className="text-3xl md:text-4xl font-bold mb-4">Последние статьи</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Актуальная информация о призыве и воинском учёте
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-6 mb-8" role="list" aria-label="Список последних статей блога">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} role="listitem">
                  <Card className="h-full overflow-hidden">
                    <BlogPostSkeleton />
                  </Card>
                </div>
              ))
            : posts.map((post) => {
                const title = normalizeBlogTitle(post.title);
                const category = normalizeBlogCategory(post.category);
                return (
                <article key={post.id} role="listitem">
                  <Link to={`/blog/${post.slug}`}>
                    <Card className="h-full cursor-pointer hover:shadow-lg transition-all overflow-hidden group">
                      <BlogPostImage
                        src={post.image_url}
                        alt={`Изображение к статье: ${title}`}
                        category={category}
                        aspect="video"
                      />
                      <CardHeader>
                        <div className="flex items-center justify-between mb-2">
                          {category && (
                            <Badge variant="secondary">{category}</Badge>
                          )}
                          {post.published_at && (
                            <time
                              className="flex items-center gap-1 text-sm text-muted-foreground"
                              dateTime={post.published_at}
                            >
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              <span>{format(new Date(post.published_at), "dd.MM.yyyy")}</span>
                            </time>
                          )}
                        </div>
                        <CardTitle className="text-xl line-clamp-2">{title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground line-clamp-3">
                          {blogExcerpt(post, 140)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </article>
                );
              })}
        </div>

        {!loading && (
          <nav className="text-center" aria-label="Переход к странице блога">
            <Link to="/blog">
              <Button size="lg" className="group" aria-label="Перейти ко всем статьям блога">
                Все статьи
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </Button>
            </Link>
          </nav>
        )}
      </div>
    </section>
  );
};

export default BlogPreview;
