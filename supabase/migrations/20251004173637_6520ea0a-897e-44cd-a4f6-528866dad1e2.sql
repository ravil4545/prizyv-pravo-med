-- Создаем таблицу для хранения диалогов AI чата
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новый диалог',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Создаем таблицу для хранения сообщений диалогов
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Создаем таблицу для комментариев к блогу
CREATE TABLE IF NOT EXISTS public.blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Включаем RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

-- Политики для chat_conversations
CREATE POLICY "Users can view their own conversations"
ON public.chat_conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
ON public.chat_conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
ON public.chat_conversations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
ON public.chat_conversations FOR DELETE
USING (auth.uid() = user_id);

-- Политики для chat_messages
CREATE POLICY "Users can view messages from their conversations"
ON public.chat_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = conversation_id AND user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages in their conversations"
ON public.chat_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = conversation_id AND user_id = auth.uid()
  )
);

-- Политики для blog_comments
CREATE POLICY "Everyone can view approved comments"
ON public.blog_comments FOR SELECT
USING (status = 'approved' OR has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Authenticated users can create comments"
ON public.blog_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
ON public.blog_comments FOR UPDATE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all comments"
ON public.blog_comments FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Добавляем политики удаления для админов
CREATE POLICY "Admins can delete forum posts"
ON public.forum_posts FOR DELETE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete forum comments"
ON public.forum_comments FOR DELETE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blog posts"
ON public.blog_posts FOR DELETE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blog comments"
ON public.blog_comments FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- Создаем индексы для производительности
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations(user_id);
CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages(conversation_id);
CREATE INDEX idx_blog_comments_post_id ON public.blog_comments(post_id);
CREATE INDEX idx_forum_comments_post_id ON public.forum_comments(post_id);