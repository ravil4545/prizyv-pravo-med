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

const emailRegisterSchema = z.object({
  email: z.string().trim().email({ message: "Введите корректный email" }).max(255),
  password: z.string()
    .min(8, { message: "Пароль должен содержать минимум 8 символов" })
    .max(72)
});

const phoneSchema = z.object({
  phone: z.string()
    .regex(/^\+7\d{10}$/, { message: "Формат: +7XXXXXXXXXX" })
});

const RegisterPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Email form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (password !== confirmPassword) {
      setErrors({ confirmPassword: "Пароли не совпадают" });
      toast({
        variant: "destructive",
        title: "Ошибка валидации",
        description: "Пароли не совпадают",
      });
      return;
    }

    const validation = emailRegisterSchema.safeParse({ email, password });
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
      const { error } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`
        }
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast({
            variant: "destructive",
            title: "Ошибка регистрации",
            description: "Этот email уже зарегистрирован. Попробуйте войти.",
          });
        } else {
          toast({ variant: "destructive", title: "Ошибка", description: error.message });
        }
      } else {
        toast({
          title: "Регистрация успешна!",
          description: "Проверьте почту для подтверждения аккаунта.",
        });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Ошибка", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthRegister = async (provider: "google" | "azure" | "facebook") => {
    setLoading(true);
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
            <CardTitle className="text-2xl">Регистрация</CardTitle>
            <CardDescription>
              Создайте аккаунт одним из способов
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                <TabsTrigger value="email" className="flex items-center gap-1 text-xs">
                  <Mail className="h-3.5 w-3.5" />
                  <span>Email</span>
                </TabsTrigger>
                <TabsTrigger value="phone" className="flex items-center gap-1 text-xs">
                  <Phone className="h-3.5 w-3.5" />
                  <span>Телефон</span>
                </TabsTrigger>
              </TabsList>
              
              {/* Email Registration */}
              <TabsContent value="email" className="mt-4">
                <form onSubmit={handleEmailRegister} className="space-y-4">
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
                    <Label htmlFor="password">Пароль (мин. 8 символов)</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      maxLength={72}
                      required
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      maxLength={72}
                      required
                    />
                    {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Зарегистрироваться
                  </Button>
                </form>
              </TabsContent>
              
              {/* Phone Registration */}
              <TabsContent value="phone" className="mt-4">
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
                      Подтвердить
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

            {/* OAuth Providers */}
            <div className="mt-6 space-y-3">
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
                  onClick={() => handleOAuthRegister("google")} 
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                >
                  <Chrome className="h-4 w-4 mr-2" />
                  Google
                </Button>

                <Button 
                  onClick={() => handleOAuthRegister("azure")} 
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 23 23" fill="none">
                    <path d="M11 0H0v11h11V0z" fill="#F25022"/>
                    <path d="M23 0H12v11h11V0z" fill="#7FBA00"/>
                    <path d="M11 12H0v11h11V12z" fill="#00A4EF"/>
                    <path d="M23 12H12v11h11V12z" fill="#FFB900"/>
                  </svg>
                  Microsoft
                </Button>

                <Button 
                  onClick={() => handleOAuthRegister("facebook")} 
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                >
                  <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </Button>
              </div>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Уже есть аккаунт? </span>
              <Link to="/login" className="text-primary hover:underline font-medium">
                Войти
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default RegisterPage;
