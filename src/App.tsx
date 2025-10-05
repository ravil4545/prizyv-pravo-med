import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ServicesPage from "./pages/ServicesPage";
import TemplatesPage from "./pages/TemplatesPage";
import AuthPage from "./pages/AuthPage";
import TestimonialsPage from "./pages/TestimonialsPage";
import DiagnosesPage from "./pages/DiagnosesPage";
import ForumPage from "./pages/ForumPage";
import BlogPage from "./pages/BlogPage";
import DashboardPage from "./pages/DashboardPage";
import UserTemplatesPage from "./pages/UserTemplatesPage";
import AIChatDashboardPage from "./pages/AIChatDashboardPage";
import AdminForumPage from "./pages/AdminForumPage";
import AdminBlogPage from "./pages/AdminBlogPage";
import AdminTestimonialsPage from "./pages/AdminTestimonialsPage";
import AdminAnalyticsPage from "./pages/AdminAnalyticsPage";
import ProfilePage from "./pages/ProfilePage";
import MedicalDocumentsPage from "./pages/MedicalDocumentsPage";
import NotFound from "./pages/NotFound";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";

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
        <AnalyticsTracker />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
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
          <Route path="/admin/forum" element={<AdminForumPage />} />
          <Route path="/admin/blog" element={<AdminBlogPage />} />
          <Route path="/admin/testimonials" element={<AdminTestimonialsPage />} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
