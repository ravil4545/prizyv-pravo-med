import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Phone, Loader2 } from "lucide-react";
import { z } from "zod";
import { Provider } from "@supabase/supabase-js";

const emailLoginSchema = z.object({
  email: z.string().trim().email({ message: "Введите корректный email" }),
  password: z.string().min(1, { message: "Введите пароль" })
});

const phoneSchema = z.object({
  phone: z.string()
    .regex(/^\+7\d{10}$/, { message: "Формат: +7XXXXXXXXXX" })
});

// OAuth providers configuration
const oauthProviders: { id: Provider; name: string; icon: React.ReactNode; color: string }[] = [
  { 
    id: "google", 
    name: "Google", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    color: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
  },
  { 
    id: "apple", 
    name: "Apple", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    ),
    color: "bg-black hover:bg-gray-900 text-white"
  },
  { 
    id: "azure", 
    name: "Microsoft", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#f25022" d="M1 1h10v10H1z"/>
        <path fill="#00a4ef" d="M1 13h10v10H1z"/>
        <path fill="#7fba00" d="M13 1h10v10H13z"/>
        <path fill="#ffb900" d="M13 13h10v10H13z"/>
      </svg>
    ),
    color: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"
  },
  { 
    id: "facebook", 
    name: "Facebook", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    color: "bg-[#1877F2] hover:bg-[#166FE5] text-white"
  },
  { 
    id: "discord", 
    name: "Discord", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
      </svg>
    ),
    color: "bg-[#5865F2] hover:bg-[#4752C4] text-white"
  },
  { 
    id: "twitch", 
    name: "Twitch", 
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
      </svg>
    ),
    color: "bg-[#9146FF] hover:bg-[#772CE8] text-white"
  },
];

// Unsupported providers info
const unsupportedProviders = [
  { name: "ВКонтакте", reason: "Не поддерживается Supabase" },
  { name: "Telegram", reason: "Не поддерживается Supabase" },
  { name: "WhatsApp", reason: "Не поддерживается Supabase" },
  { name: "Instagram", reason: "API устарел" },
  { name: "Steam", reason: "Не поддерживается Supabase" },
];

const LoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"email" | "phone" | "social">("email");

  // Email form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Phone form
  const [phone, setPhone] = useState("+7");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

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

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const validation = emailLoginSchema.safeParse({ email, password });
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            variant: "destructive",
            title: "Ошибка входа",
            description: "Неверный email или пароль",
          });
        } else if (error.message.includes("Email not confirmed")) {
          toast({
            variant: "destructive",
            title: "Email не подтвержден",
            description: "Проверьте почту и подтвердите аккаунт",
          });
        } else {
          toast({ variant: "destructive", title: "Ошибка", description: error.message });
        }
      } else {
        toast({ title: "Вход выполнен", description: "Добро пожаловать!" });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrors({ email: "Введите email для восстановления пароля" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        toast({ variant: "destructive", title: "Ошибка", description: error.message });
      } else {
        toast({
          title: "Письмо отправлено",
          description: "Проверьте почту для восстановления пароля",
        });
        setShowForgotPassword(false);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: Provider) => {
    setLoadingProvider(provider);
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
      setLoadingProvider(null);
    }
  };

  const handleSendOtp = async () => {
    setErrors({});
    const validation = phoneSchema.safeParse({ phone });
    if (!validation.success) {
      setErrors({ phone: validation.error.errors[0].message });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: validation.data.phone,
        options: {
          channel: "sms"
        }
      });

      if (error) {
        toast({ variant: "destructive", title: "Ошибка", description: error.message });
      } else {
        setOtpSent(true);
        setCountdown(60);
        toast({ title: "Код отправлен", description: "Проверьте SMS на вашем телефоне." });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setErrors({ otp: "Введите 6-значный код" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otpCode,
        type: "sms"
      });

      if (error) {
        toast({ variant: "destructive", title: "Ошибка", description: error.message });
      } else {
        toast({ title: "Вход выполнен", description: "Добро пожаловать!" });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneInput = (value: string) => {
    let formatted = value.replace(/[^\d+]/g, "");
    if (!formatted.startsWith("+7")) {
      formatted = "+7" + formatted.replace(/\+/g, "").replace(/^7/, "");
    }
    if (formatted.length > 12) {
      formatted = formatted.slice(0, 12);
    }
    return formatted;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 flex items-center justify-center py-8 sm:py-20 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl sm:text-2xl">Вход в аккаунт</CardTitle>
            <CardDescription>
              Выберите удобный способ входа
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tab selector */}
            <div className="flex rounded-lg bg-muted p-1 gap-1">
              <button
                onClick={() => setActiveTab("email")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  activeTab === "email" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Email</span>
              </button>
              <button
                onClick={() => setActiveTab("phone")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  activeTab === "phone" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Phone className="w-4 h-4" />
                <span>Телефон</span>
              </button>
              <button
                onClick={() => setActiveTab("social")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  activeTab === "social" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span>Соцсети</span>
              </button>
            </div>

            {/* Email Login */}
            {activeTab === "email" && (
              <>
                {!showForgotPassword ? (
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@mail.ru"
                        maxLength={255}
                        required
                      />
                      {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Пароль</Label>
                      <Input
                        id="password"
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
                    <Button
                      type="button"
                      variant="link"
                      className="w-full"
                      onClick={() => setShowForgotPassword(true)}
                    >
                      Забыли пароль?
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-reset">Email для восстановления</Label>
                      <Input
                        id="email-reset"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@mail.ru"
                        maxLength={255}
                        required
                      />
                      {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Отправить ссылку
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setShowForgotPassword(false)}
                    >
                      Назад к входу
                    </Button>
                  </form>
                )}
              </>
            )}

            {/* Phone Login */}
            {activeTab === "phone" && (
              <>
                {!otpSent ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Номер телефона</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                        placeholder="+7XXXXXXXXXX"
                        maxLength={12}
                      />
                      {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                    </div>
                    <Button onClick={handleSendOtp} className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Отправить код
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp">Код из SMS</Label>
                      <Input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="XXXXXX"
                        maxLength={6}
                        className="text-center text-2xl tracking-widest"
                      />
                      {errors.otp && <p className="text-sm text-destructive">{errors.otp}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Войти
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={handleSendOtp}
                      disabled={countdown > 0 || loading}
                    >
                      {countdown > 0 ? `Повторить через ${countdown}с` : "Отправить код повторно"}
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="w-full"
                      onClick={() => { setOtpSent(false); setOtpCode(""); }}
                    >
                      Изменить номер
                    </Button>
                  </form>
                )}
              </>
            )}

            {/* Social Login */}
            {activeTab === "social" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Войдите через социальную сеть или сервис
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  {oauthProviders.map((provider) => (
                    <Button
                      key={provider.id}
                      onClick={() => handleOAuthLogin(provider.id)}
                      className={`w-full ${provider.color} flex items-center justify-center gap-2`}
                      variant="outline"
                      disabled={loadingProvider !== null}
                    >
                      {loadingProvider === provider.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        provider.icon
                      )}
                      <span className="text-xs sm:text-sm">{provider.name}</span>
                    </Button>
                  ))}
                </div>

                {/* Unsupported providers notice */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground text-center mb-2">
                    Временно недоступны:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {unsupportedProviders.map((provider) => (
                      <span
                        key={provider.name}
                        className="text-xs px-2 py-1 bg-muted rounded-md text-muted-foreground cursor-help"
                        title={provider.reason}
                      >
                        {provider.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-border text-center text-sm">
              <span className="text-muted-foreground">Нет аккаунта? </span>
              <Link to="/register" className="text-primary hover:underline font-medium">
                Зарегистрироваться
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default LoginPage;
