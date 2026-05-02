import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode } from "react";
import MobileBottomNav from "./components/MobileBottomNav";
import QuickActionFAB from "./components/QuickActionFAB";
import RagChat from "./components/RagChat";
import { AuthProvider } from "./contexts/AuthContext";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";

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
const ForumPage = lazy(() => import("./pages/ForumPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
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
const SuccessCasesPage = lazy(() => import("./pages/SuccessCasesPage"));
const CommissariatDirectoryPage = lazy(() => import("./pages/CommissariatDirectoryPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LawyerDashboard = lazy(() => import("./pages/LawyerDashboard"));
const LawyerClientsPage = lazy(() => import("./pages/LawyerClientsPage"));
const LawyerClientDetail = lazy(() => import("./pages/LawyerClientDetail"));
const LawyerChatPage = lazy(() => import("./pages/LawyerChatPage"));
const LawyerTemplatesPage = lazy(() => import("./pages/LawyerTemplatesPage"));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const AnalyticsTracker = () => {
  useAnalyticsTracking();
  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AnalyticsTracker />
          <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/testimonials" element={<TestimonialsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/diagnoses" element={<DiagnosesPage />} />
              <Route path="/forum" element={<ForumPage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/templates" element={<UserTemplatesPage />} />
              <Route path="/dashboard/ai-chat" element={<AIChatDashboardPage />} />
              <Route path="/dashboard/medical-documents" element={<MedicalDocumentsPage />} />
              <Route path="/medical-documents" element={<Navigate to="/dashboard/medical-documents" replace />} />
              <Route path="/medical-history" element={<MedicalHistoryPage />} />
              <Route path="/medical-questionnaire" element={<MedicalQuestionnairePage />} />
              <Route path="/dashboard/case-tracking" element={<CaseTrackingPage />} />
              <Route path="/success-cases" element={<SuccessCasesPage />} />
              <Route path="/commissariats" element={<CommissariatDirectoryPage />} />
              <Route path="/admin/forum" element={<AdminForumPage />} />
              <Route path="/admin/blog" element={<AdminBlogPage />} />
              <Route path="/admin/testimonials" element={<AdminTestimonialsPage />} />
              <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="/admin/articles" element={<AdminArticlesPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/lawyer" element={<LawyerDashboard />} />
              <Route path="/lawyer/clients" element={<LawyerClientsPage />} />
              <Route path="/lawyer/clients/:clientId" element={<LawyerClientDetail />} />
              <Route path="/lawyer/chat/:clientId" element={<LawyerChatPage />} />
              <Route path="/lawyer/templates" element={<LawyerTemplatesPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
          <QuickActionFAB />
          <RagChat />
          <MobileBottomNav />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
