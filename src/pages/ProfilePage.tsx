import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import PersonalDataForm from "@/components/profile/PersonalDataForm";
import EducationForm from "@/components/profile/EducationForm";
import WorkForm from "@/components/profile/WorkForm";
import MilitaryForm from "@/components/profile/MilitaryForm";
import DiagnosesForm from "@/components/profile/DiagnosesForm";
import DocumentsGenerator from "@/components/profile/DocumentsGenerator";
import MedicalTestsForm from "@/components/profile/MedicalTestsForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Loader2 } from "lucide-react";

const ProfilePage = () => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);
      await loadProfile(session.user.id);
    } catch (error) {
      console.error("Error checking user:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные профиля",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error loading profile:", error);
      return;
    }

    if (!data) {
      // Создаём профиль если его нет
      const { data: newProfile, error: insertError } = await supabase
        .from("profiles")
        .insert([{ id: userId }])
        .select()
        .single();

      if (insertError) {
        console.error("Error creating profile:", insertError);
        return;
      }
      setProfile(newProfile);
    } else {
      setProfile(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-4 sm:py-8 px-2 sm:px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Личный кабинет</h1>
            <p className="text-sm sm:text-base text-muted-foreground truncate">
              Email: {user?.email}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="w-full sm:w-auto">
            Выйти
          </Button>
        </div>

        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 mb-8 h-auto gap-1">
            <TabsTrigger value="personal" className="text-xs sm:text-sm">Личные данные</TabsTrigger>
            <TabsTrigger value="education" className="text-xs sm:text-sm">Образование</TabsTrigger>
            <TabsTrigger value="work" className="text-xs sm:text-sm">Работа</TabsTrigger>
            <TabsTrigger value="military" className="text-xs sm:text-sm">Военкомат</TabsTrigger>
            <TabsTrigger value="diagnoses" className="text-xs sm:text-sm">Диагнозы</TabsTrigger>
            <TabsTrigger value="medical-tests" className="text-xs sm:text-sm">Анализы</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs sm:text-sm">Шаблоны</TabsTrigger>
          </TabsList>

          <TabsContent value="personal">
            <PersonalDataForm profile={profile} onUpdate={loadProfile} />
          </TabsContent>

          <TabsContent value="education">
            <EducationForm profile={profile} onUpdate={loadProfile} />
          </TabsContent>

          <TabsContent value="work">
            <WorkForm profile={profile} onUpdate={loadProfile} />
          </TabsContent>

          <TabsContent value="military">
            <MilitaryForm profile={profile} onUpdate={loadProfile} />
          </TabsContent>

          <TabsContent value="diagnoses">
            <DiagnosesForm userId={user?.id} />
          </TabsContent>

          <TabsContent value="medical-tests">
            <MedicalTestsForm userId={user?.id} />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsGenerator profile={profile} userId={user?.id} />
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
};

export default ProfilePage;
