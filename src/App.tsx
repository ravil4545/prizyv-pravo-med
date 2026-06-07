import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode, useEffect } from "react";
import MobileBottomNav from "./components/MobileBottomNav";
import QuickActionFAB from "./components/QuickActionFAB";
import ExitIntentDialog from "./components/ExitIntentDialog";
import { AuthProvider } from "./contexts/AuthContext";
import { BrandingProvider } from "./contexts/BrandingContext";
import { ChatPresenceProvider } from "./contexts/ChatPresenceContext";
import BrandedPWAMeta from "./components/BrandedPWAMeta";
import RoleGuard from "./components/RoleGuard";
import AdminGuard from "./components/AdminGuard";
import DashboardLayout from "./components/DashboardLayout";
import LawyerLayout from "./components/LawyerLayout";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";
import { captureUTM, initScrollDepth } from "./lib/analytics";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    // Auto-reload once on chunk load failures (stale cache after deploy)
    if (error.message?.includes("Failed to fetch dynamically imported module") ||
        error.message?.includes("Loading chunk") ||
        error.name === "ChunkLoadError") {
      if (!sessionStorage.getItem("chunk_reload")) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-semibold">Что-то пошло не так</p>
          <p className="text-sm text-gray-500">Попробуйте обновить страницу</p>
          <button
            onClick={() => { sessionStorage.removeItem("chunk_reload"); window.location.reload(); }}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm"
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────
const Index = lazy(() => import("./pages/Index"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage"));
const DiagnosesPage = lazy(() => import("./pages/DiagnosesPage"));
const DiagnosisDetailPage = lazy(() => import("./pages/DiagnosisDetailPage"));
const ForumPage = lazy(() => import("./pages/ForumPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const BlogDetailPage = lazy(() => import("./pages/BlogDetailPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const UserTemplatesPage = lazy(() => import("./pages/UserTemplatesPage"));
const AIChatDashboardPage = lazy(() => import("./pages/AIChatDashboardPage"));
const AdminForumPage = lazy(() => import("./pages/AdminForumPage"));
const AdminBlogPage = lazy(() => import("./pages/AdminBlogPage"));
const AdminTestimonialsPage = lazy(() => import("./pages/AdminTestimonialsPage"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const AdminArticlesPage = lazy(() => import("./pages/AdminArticlesPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const MedicalDocumentsPage = lazy(() => import("./pages/MedicalDocumentsPage"));
const MedicalHistoryPage = lazy(() => import("./pages/MedicalHistoryPage"));
const MedicalQuestionnairePage = lazy(() => import("./pages/MedicalQuestionnairePage"));
const CaseTrackingPage = lazy(() => import("./pages/CaseTrackingPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const SuccessCasesPage = lazy(() => import("./pages/SuccessCasesPage"));
const CommissariatDirectoryPage = lazy(() => import("./pages/CommissariatDirectoryPage"));
const CommissariatDetailPage = lazy(() => import("./pages/CommissariatDetailPage"));
const LawyersDirectoryPage = lazy(() => import("./pages/LawyersDirectoryPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const OfferPage = lazy(() => import("./pages/OfferPage"));
const RequisitesPage = lazy(() => import("./pages/RequisitesPage"));
const LawyerDashboard = lazy(() => import("./pages/LawyerDashboard"));
const LawyerClientsPage = lazy(() => import("./pages/LawyerClientsPage"));
const LawyerClientDetail = lazy(() => import("./pages/LawyerClientDetail"));
const LawyerAgendaPage = lazy(() => import("./pages/LawyerAgendaPage"));
const LawyerChatPage = lazy(() => import("./pages/LawyerChatPage"));
const LawyerTemplatesPage = lazy(() => import("./pages/LawyerTemplatesPage"));
const LawyerChatsPage = lazy(() => import("./pages/LawyerChatsPage"));
const LawyerAnalyticsPage = lazy(() => import("./pages/LawyerAnalyticsPage"));
const LawyerBrandingPage = lazy(() => import("./pages/LawyerBrandingPage"));
const LawyerLandingPage = lazy(() => import("./pages/LawyerLandingPage"));
const ClientMessagesPage = lazy(() => import("./pages/ClientMessagesPage"));
const ClientChatPage = lazy(() => import("./pages/ClientChatPage"));
const FamilyAccessPage = lazy(() => import("./pages/FamilyAccessPage"));
const FamilyAcceptPage = lazy(() => import("./pages/FamilyAcceptPage"));
// Lazy-load RagChat — keeps react-markdown out of the main bundle
const RagChat = lazy(() => import("./components/RagChat"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AnalyticsTracker = () => {
  useAnalyticsTracking();

  // First-touch UTM capture + scroll-depth tracking — раз на сессию.
  useEffect(() => {
    captureUTM(window.location.search);
    const cleanup = initScrollDepth();
    return cleanup;
  }, []);

  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,       // 1 min — reduces background refetches on slow mobile
      retry: 1,                    // only 1 retry (default 3 wastes mobile data on errors)
      refetchOnWindowFocus: false, // don't hammer API when user switches apps
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
          <ChatPresenceProvider>
          <BrandedPWAMeta />
          <ErrorBoundary>
            <AnalyticsTracker />
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* White-label маршруты юриста — точка входа клиента по ссылке/QR */}
                {/* /u/:slug — отдельный лендинг юриста (не копия основного сайта) */}
                <Route path="/u/:slug" element={<LawyerLandingPage />} />
                <Route path="/u/:slug/auth" element={<AuthPage />} />
                <Route path="/u/:slug/register" element={<RegisterPage />} />
                <Route path="/u/:slug/login" element={<LoginPage />} />
                {/* Брендовые зеркала клиентского кабинета. Те же RoleGuard role="client",
                    что и на неймспейсе /dashboard/*: у юриста клиентского кабинета НЕТ —
                    с собственной /u/:slug-ссылки юрист уходит в /lawyer, а не видит ИИ-чат
                    и предложения подписки (разделение сущностей клиент/юрист). */}
                <Route element={<DashboardLayout />}>
                  <Route path="/u/:slug/dashboard" element={<RoleGuard role="client"><DashboardPage /></RoleGuard>} />
                  <Route path="/u/:slug/dashboard/ai-chat" element={<RoleGuard role="client"><AIChatDashboardPage /></RoleGuard>} />
                  <Route path="/u/:slug/dashboard/medical-documents" element={<RoleGuard role="client"><MedicalDocumentsPage /></RoleGuard>} />
                  <Route path="/u/:slug/dashboard/templates" element={<RoleGuard role="client"><UserTemplatesPage /></RoleGuard>} />
                  <Route path="/u/:slug/dashboard/case-tracking" element={<RoleGuard role="client"><CaseTrackingPage /></RoleGuard>} />
                  <Route path="/u/:slug/dashboard/calendar" element={<RoleGuard role="client"><CalendarPage /></RoleGuard>} />
                  <Route path="/u/:slug/medical-history" element={<RoleGuard role="client"><MedicalHistoryPage /></RoleGuard>} />
                  <Route path="/u/:slug/medical-questionnaire" element={<RoleGuard role="client"><MedicalQuestionnairePage /></RoleGuard>} />
                  <Route path="/u/:slug/profile" element={<RoleGuard role="client"><ProfilePage /></RoleGuard>} />
                </Route>
                <Route path="/u/:slug/diagnoses" element={<DiagnosesPage />} />
                <Route path="/u/:slug/diagnoses/:diagnosisSlug" element={<DiagnosisDetailPage />} />
                {/* Клиент: инбокс, чат-тред, семья — внутри shell. У чат-треда на
                    десктопе сайдбар; мобильные бары прячет layout (isChatThread). */}
                <Route element={<DashboardLayout />}>
                  <Route path="/u/:slug/client/messages" element={<RoleGuard role="client"><ClientMessagesPage /></RoleGuard>} />
                  <Route path="/u/:slug/client/chat/:lawyerClientId" element={<RoleGuard role="client"><ClientChatPage /></RoleGuard>} />
                  <Route path="/u/:slug/family" element={<RoleGuard role="client"><FamilyAccessPage /></RoleGuard>} />
                </Route>
                {/* /u/:slug/profile теперь внутри DashboardLayout (см. блок выше) */}

                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/testimonials" element={<TestimonialsPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/diagnoses" element={<DiagnosesPage />} />
                <Route path="/diagnoses/:slug" element={<DiagnosisDetailPage />} />
                <Route path="/forum" element={<ForumPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/blog/:slug" element={<BlogDetailPage />} />
                {/* Клиентский кабинет — юристов отсюда редиректит на /lawyer.
                    Обёрнут в DashboardLayout — единое боковое меню (Sidebar). */}
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<RoleGuard role="client"><DashboardPage /></RoleGuard>} />
                  <Route path="/dashboard/templates" element={<RoleGuard role="client"><UserTemplatesPage /></RoleGuard>} />
                  <Route path="/dashboard/ai-chat" element={<RoleGuard role="client"><AIChatDashboardPage /></RoleGuard>} />
                  <Route path="/dashboard/medical-documents" element={<RoleGuard role="client"><MedicalDocumentsPage /></RoleGuard>} />
                  <Route path="/medical-history" element={<RoleGuard role="client"><MedicalHistoryPage /></RoleGuard>} />
                  <Route path="/medical-questionnaire" element={<RoleGuard role="client"><MedicalQuestionnairePage /></RoleGuard>} />
                  <Route path="/dashboard/case-tracking" element={<RoleGuard role="client"><CaseTrackingPage /></RoleGuard>} />
                  <Route path="/dashboard/calendar" element={<RoleGuard role="client"><CalendarPage /></RoleGuard>} />
                  <Route path="/profile" element={<RoleGuard role="client"><ProfilePage /></RoleGuard>} />
                </Route>
                <Route path="/medical-documents" element={<Navigate to="/dashboard/medical-documents" replace />} />
                <Route path="/success-cases" element={<SuccessCasesPage />} />
                <Route path="/commissariats" element={<CommissariatDirectoryPage />} />
                <Route path="/commissariats/:slug" element={<CommissariatDetailPage />} />
                {/* Каталог юристов — флоу подбора из кабинета: внутри shell (сайдбар) */}
                <Route element={<DashboardLayout />}>
                  <Route path="/lawyers" element={<LawyersDirectoryPage />} />
                </Route>
                {/* Compliance & legal pages — обязательно по 152-ФЗ и для приёма платежей */}
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/offer" element={<OfferPage />} />
                <Route path="/requisites" element={<RequisitesPage />} />
                <Route path="/admin/forum" element={<AdminGuard><AdminForumPage /></AdminGuard>} />
                <Route path="/admin/blog" element={<AdminGuard><AdminBlogPage /></AdminGuard>} />
                <Route path="/admin/testimonials" element={<AdminGuard><AdminTestimonialsPage /></AdminGuard>} />
                <Route path="/admin/analytics" element={<AdminGuard><AdminAnalyticsPage /></AdminGuard>} />
                <Route path="/admin/articles" element={<AdminGuard><AdminArticlesPage /></AdminGuard>} />
                <Route path="/admin/users" element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
                {/* /profile теперь внутри DashboardLayout (см. блок клиентского кабинета) */}
                {/* Юристский кабинет — клиентов отсюда редиректит на /dashboard.
                    Обёрнут в LawyerLayout — единое боковое меню + нижние табы. */}
                <Route element={<LawyerLayout />}>
                  <Route path="/lawyer" element={<RoleGuard role="lawyer"><LawyerDashboard /></RoleGuard>} />
                  <Route path="/lawyer/clients" element={<RoleGuard role="lawyer"><LawyerClientsPage /></RoleGuard>} />
                  <Route path="/lawyer/clients/:clientId" element={<RoleGuard role="lawyer"><LawyerClientDetail /></RoleGuard>} />
                  <Route path="/lawyer/agenda" element={<RoleGuard role="lawyer"><LawyerAgendaPage /></RoleGuard>} />
                  <Route path="/lawyer/templates" element={<RoleGuard role="lawyer"><LawyerTemplatesPage /></RoleGuard>} />
                  <Route path="/lawyer/chats" element={<RoleGuard role="lawyer"><LawyerChatsPage /></RoleGuard>} />
                  <Route path="/lawyer/analytics" element={<RoleGuard role="lawyer"><LawyerAnalyticsPage /></RoleGuard>} />
                  <Route path="/lawyer/branding" element={<RoleGuard role="lawyer"><LawyerBrandingPage /></RoleGuard>} />
                  {/* Чат-тред юриста: на десктопе сайдбар, мобильные бары прячет layout */}
                  <Route path="/lawyer/chat/:clientId" element={<RoleGuard role="lawyer"><LawyerChatPage /></RoleGuard>} />
                </Route>
                {/* Клиент: инбокс, чат-тред, семья — внутри shell кабинета. У чат-треда
                    на десктопе сайдбар; мобильные бары прячет layout (isChatThread). */}
                <Route element={<DashboardLayout />}>
                  <Route path="/client/messages" element={<RoleGuard role="client"><ClientMessagesPage /></RoleGuard>} />
                  <Route path="/client/chat/:lawyerClientId" element={<RoleGuard role="client"><ClientChatPage /></RoleGuard>} />
                  <Route path="/family" element={<RoleGuard role="client"><FamilyAccessPage /></RoleGuard>} />
                </Route>
                <Route path="/family/accept/:token" element={<FamilyAcceptPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <QuickActionFAB />
            <Suspense fallback={null}><RagChat /></Suspense>
            <MobileBottomNav />
            <ExitIntentDialog />
          </ErrorBoundary>
          </ChatPresenceProvider>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
