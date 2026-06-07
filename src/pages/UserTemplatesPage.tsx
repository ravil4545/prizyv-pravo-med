/* eslint-disable @typescript-eslint/no-explicit-any -- профиль/документы из БД читаются динамически без сгенерированных типов */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import TemplatesWorkspace, { mapMedicalDocs, type DocItem } from "@/components/TemplatesWorkspace";

// Тонкая обёртка: грузит данные текущего пользователя и отдаёт их в общий
// движок шаблонов (TemplatesWorkspace). Та же страница в кабинете юриста —
// LawyerTemplatesPage с данными выбранного клиента.
const UserTemplatesPage = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && !session.user.is_anonymous) {
        setEmail(session.user.email ?? null);
        const [{ data: prof }, { data: md }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
          supabase.from("medical_documents_v2")
            .select("id, title, document_date, meta, document_types(name), document_subtypes(name)")
            .eq("user_id", session.user.id)
            .order("document_date", { ascending: false }),
        ]);
        setProfile((prof as any) || null);
        setDocs(mapMedicalDocs(md as any[]));
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {loading ? (
        <main className="container mx-auto px-4 py-12 text-center text-muted-foreground">Загрузка…</main>
      ) : (
        <TemplatesWorkspace
          profile={profile}
          docs={docs}
          email={email}
          storageKey="nepriziv_user_templates_v1"
          onBack={() => navigate("/dashboard")}
          subtitle="Выберите шаблон — поля заполнятся из вашего профиля, военкоматы и диспансеры найдём по адресу регистрации. Документ можно отредактировать и скачать в DOCX или распечатать."
        />
      )}
      <Footer />
    </div>
  );
};

export default UserTemplatesPage;
