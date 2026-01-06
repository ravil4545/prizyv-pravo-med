import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { signUpSchema, signInSchema } from "@/lib/validations";
import { Chrome, Loader2 } from "lucide-react";

const AuthPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleOAuth = async (provider: "google" | "azure" | "facebook") => {
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) {
        toast({ variant: "destructive", title: "Ошибка", description: error.message });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setOauthLoading(null);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = signUpSchema.safeParse({ email, password, fullName, phone });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        variant: "destructive",
        title: "Ошибка валидации",
        description: "Проверьте правильность заполнения полей",
      });
      return;
    }

    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/dashboard`;
      
      const { error } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: validation.data.fullName,
            phone: validation.data.phone || ""
          }
        }
      });

      if (error) {
        toast({
          title: "Ошибка регистрации",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Регистрация успешна!",
          description: "Проверьте почту для подтверждения аккаунта.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = signInSchema.safeParse({ email, password });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        variant: "destructive",
        title: "Ошибка валидации",
        description: "Проверьте правильность заполнения полей",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        toast({
          title: "Ошибка входа",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Вход выполнен",
          description: "Добро пожаловать!",
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const OAuthButtons = () => (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Или войти через</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Button 
          onClick={() => handleOAuth("google")} 
          variant="outline"
          className="w-full"
          disabled={oauthLoading !== null}
        >
          {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Chrome className="h-4 w-4 mr-2" />}
          Google
        </Button>

        <Button 
          onClick={() => handleOAuth("azure")} 
          variant="outline"
          className="w-full"
          disabled={oauthLoading !== null}
        >
          {oauthLoading === "azure" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <svg className="h-4 w-4 mr-2" viewBox="0 0 23 23" fill="none">
              <path d="M11 0H0v11h11V0z" fill="#F25022"/>
              <path d="M23 0H12v11h11V0z" fill="#7FBA00"/>
              <path d="M11 12H0v11h11V12z" fill="#00A4EF"/>
              <path d="M23 12H12v11h11V12z" fill="#FFB900"/>
            </svg>
          )}
          Microsoft
        </Button>

        <Button 
          onClick={() => handleOAuth("facebook")} 
          variant="outline"
          className="w-full"
          disabled={oauthLoading !== null}
        >
          {oauthLoading === "facebook" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          )}
          Facebook
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex items-center justify-center py-20 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Добро пожаловать</CardTitle>
            <CardDescription>Войдите или создайте аккаунт</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Вход</TabsTrigger>
                <TabsTrigger value="signup">Регистрация</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-signin">Email</Label>
                    <Input
                      id="email-signin"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={255}
                      required
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signin">Пароль</Label>
                    <Input
                      id="password-signin"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Войти
                  </Button>
                </form>
                
                <div className="mt-4">
                  <OAuthButtons />
                </div>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullname">Полное имя</Label>
                    <Input
                      id="fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      maxLength={100}
                      required
                    />
                    {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Телефон</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+7"
                      maxLength={18}
                    />
                    {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-signup">Email</Label>
                    <Input
                      id="email-signup"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={255}
                      required
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-signup">Пароль (мин. 8 символов)</Label>
                    <Input
                      id="password-signup"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={72}
                      required
                      minLength={8}
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Зарегистрироваться
                  </Button>
                </form>
                
                <div className="mt-4">
                  <OAuthButtons />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default AuthPage;