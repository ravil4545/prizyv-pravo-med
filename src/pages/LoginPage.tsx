import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Phone, Chrome, Loader2 } from "lucide-react";
import { z } from "zod";

const emailLoginSchema = z.object({
  email: z.string().trim().email({ message: "Введите корректный email" }),
  password: z.string().min(1, { message: "Введите пароль" })
});

const phoneSchema = z.object({
  phone: z.string()
    .regex(/^\+7\d{10}$/, { message: "Формат: +7XXXXXXXXXX" })
});

const LoginPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // Countdown timer for resend OTP
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
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
      setLoading(false);
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
      
      <main className="flex-1 flex items-center justify-center py-20 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Вход</CardTitle>
            <CardDescription>
              Войдите в личный кабинет
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span className="hidden sm:inline">Email</span>
                </TabsTrigger>
                <TabsTrigger value="google" className="flex items-center gap-2">
                  <Chrome className="h-4 w-4" />
                  <span className="hidden sm:inline">Google</span>
                </TabsTrigger>
                <TabsTrigger value="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline">Телефон</span>
                </TabsTrigger>
              </TabsList>
              
              {/* Email Login */}
              <TabsContent value="email" className="mt-6">
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
              </TabsContent>
              
              {/* Google Login */}
              <TabsContent value="google" className="mt-6">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Нажмите кнопку ниже, чтобы войти через ваш аккаунт Google.
                  </p>
                  <Button 
                    onClick={handleGoogleLogin} 
                    className="w-full" 
                    variant="outline"
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Chrome className="h-4 w-4 mr-2" />}
                    Войти через Google
                  </Button>
                </div>
              </TabsContent>
              
              {/* Phone Login */}
              <TabsContent value="phone" className="mt-6">
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
                  </form>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm">
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
