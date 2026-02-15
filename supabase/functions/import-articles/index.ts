import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the raw text from request body
    const { rawText } = await req.json();
    if (!rawText || typeof rawText !== "string") {
      return new Response(JSON.stringify({ error: "rawText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse articles from the text
    const articles = parseArticles(rawText);

    if (articles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No articles found in text", preview: rawText.slice(0, 500) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch existing articles from DB
    const { data: existingArticles, error: fetchErr } = await supabase
      .from("disease_articles_565")
      .select("id, article_number")
      .eq("is_active", true);

    if (fetchErr) {
      throw new Error(`Failed to fetch articles: ${fetchErr.message}`);
    }

    const articleMap = new Map<string, string>();
    for (const a of existingArticles || []) {
      articleMap.set(a.article_number, a.id);
    }

    let updated = 0;
    let notFound: string[] = [];

    for (const article of articles) {
      const id = articleMap.get(article.number);
      if (!id) {
        notFound.push(article.number);
        continue;
      }

      const { error: updateErr } = await supabase
        .from("disease_articles_565")
        .update({ body: article.body })
        .eq("id", id);

      if (!updateErr) {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalParsed: articles.length,
        updated,
        notFoundInDb: notFound,
        articleNumbers: articles.map((a) => a.number),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface ParsedArticle {
  number: string;
  body: string;
}

function parseArticles(text: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // mammoth extractRawText produces plain text from DOCX
  // Articles in the Schedule of Diseases typically appear as:
  // "Статья\n1\nНазвание..." or "1\tНазвание..." or inline "Статья 1" patterns
  
  // Strategy: Find all positions where a new article starts
  // Then extract body text between article boundaries
  
  // Collect all potential article start positions
  interface ArticleStart {
    number: number;
    charIndex: number;
  }

  const starts: ArticleStart[] = [];

  // Pattern: standalone article number in table-like structure
  // In raw DOCX text, table cells often become tab-separated or newline-separated
  // Look for patterns where article number appears near title text
  
  // Pattern 1: "Статья\nN\n" or "Статья N" 
  // This catches section headers but NOT inline references like "по статье 59"
  
  // Pattern 2: Article number at the start of a table row
  // In raw text from tables, we see: "\n1\tКишечные инфекции..." or "\n1\nКишечные инфекции..."
  
  // We'll use a regex that finds article numbers (1-89) that appear to be table row starts
  // followed by disease/condition names
  
  const lines = text.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Pattern: Just a number (1-89) on its own line, followed by a disease title on next line
    const numOnlyMatch = line.match(/^(\d{1,2})$/);
    if (numOnlyMatch) {
      const num = parseInt(numOnlyMatch[1]);
      if (num >= 1 && num <= 89) {
        // Check next non-empty line for disease-related content
        let nextLine = "";
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].trim()) {
            nextLine = lines[j].trim();
            break;
          }
        }
        // The next line should be a disease title (long enough, not just a category letter)
        if (nextLine.length > 20 && !nextLine.match(/^[АБВГД\s]+$/) && !nextLine.match(/^графа/i)) {
          // Check it's not a duplicate
          if (starts.length === 0 || starts[starts.length - 1].number !== num) {
            // Calculate char index
            let charIdx = 0;
            for (let k = 0; k < i; k++) charIdx += lines[k].length + 1;
            starts.push({ number: num, charIndex: charIdx });
          }
        }
      }
    }
    
    // Pattern: "N\tTitle..." (tab-separated table cell)
    const tabMatch = line.match(/^(\d{1,2})\t(.{20,})/);
    if (tabMatch) {
      const num = parseInt(tabMatch[1]);
      if (num >= 1 && num <= 89) {
        if (starts.length === 0 || starts[starts.length - 1].number !== num) {
          let charIdx = 0;
          for (let k = 0; k < i; k++) charIdx += lines[k].length + 1;
          starts.push({ number: num, charIndex: charIdx });
        }
      }
    }
  }

  // Sort by position in text  
  starts.sort((a, b) => a.charIndex - b.charIndex);

  // Remove duplicates (keep first occurrence of each number)
  const seen = new Set<number>();
  const uniqueStarts = starts.filter(s => {
    if (seen.has(s.number)) return false;
    seen.add(s.number);
    return true;
  });

  // Extract body text for each article
  for (let i = 0; i < uniqueStarts.length; i++) {
    const start = uniqueStarts[i];
    const endIndex = i + 1 < uniqueStarts.length 
      ? uniqueStarts[i + 1].charIndex 
      : text.length;
    
    let body = text.slice(start.charIndex, endIndex).trim();
    
    // Clean up: remove excessive whitespace but preserve paragraph breaks
    body = body
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    
    if (body.length > 30) {
      articles.push({ number: String(start.number), body });
    }
  }

  return articles;
}
