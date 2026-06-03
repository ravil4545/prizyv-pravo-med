import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { User, GraduationCap, Briefcase, Shield } from "lucide-react";
import { FormSkeleton } from "@/components/LoadingSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import PersonalDataForm from "@/components/profile/PersonalDataForm";
import EducationForm from "@/components/profile/EducationForm";
import WorkForm from "@/components/profile/WorkForm";
import MilitaryForm from "@/components/profile/MilitaryForm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Loader2 } from "lucide-react";
import DeleteAccountDialog from "@/components/DeleteAccountDialog";
import PrivacyBadge from "@/components/PrivacyBadge";

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
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-6 px-3 sm:px-4 md:pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-12 w-full" />
            <FormSkeleton fields={5} />
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { value: "personal", label: "Личные", longLabel: "Личные данные", icon: User },
    { value: "education", label: "Учёба", longLabel: "Образование", icon: GraduationCap },
    { value: "work", label: "Работа", longLabel: "Работа", icon: Briefcase },
    { value: "military", label: "Военкомат", longLabel: "Военкомат", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-4 sm:py-8 px-3 sm:px-4 md:pb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1">Профиль</h1>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="self-end sm:self-auto">
            Выйти
          </Button>
        </div>

        <PrivacyBadge className="mb-6" subject="паспортные и персональные" />

        <Tabs defaultValue="personal" className="w-full">
          {/* Mobile: scrollable horizontal tabs */}
          <div className="lg:hidden -mx-3 sm:-mx-4 mb-5 px-3 sm:px-4 overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex w-auto h-auto p-1 gap-1 bg-muted/50">
              {tabs.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="flex flex-col items-center gap-1 h-auto py-2.5 px-3 min-w-[72px] data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap"
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[11px] font-medium">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Desktop: grid tabs */}
          <TabsList className="hidden lg:grid w-full grid-cols-4 mb-8 h-auto gap-1 p-1">
            {tabs.map(({ value, longLabel, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5 py-2.5 text-sm">
                <Icon className="h-4 w-4" />
                {longLabel}
              </TabsTrigger>
            ))}
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
        </Tabs>

        {/* Danger zone — удаление аккаунта */}
        <div className="mt-12 border-t pt-8">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1">
              <p className="font-semibold text-sm text-destructive">Удаление аккаунта</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Безвозвратно удалит ваш профиль, медицинские документы, переписку и
                — если вы юрист — все CRM-карточки клиентов. Перед удалением попросим
                ввести подтверждающее слово.
              </p>
            </div>
            <DeleteAccountDialog />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProfilePage;
