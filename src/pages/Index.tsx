import Header from "@/components/Header";
import Hero from "@/components/Hero";
import AIFeaturesSection from "@/components/AIFeaturesSection";
import DashboardPromo from "@/components/DashboardPromo";
import Services from "@/components/Services";
import BlogPreview from "@/components/BlogPreview";
import Testimonials from "@/components/Testimonials";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import SEOHead from "@/components/SEOHead";

const Index = () => {
  return (
    <>
      <SEOHead />
      <div className="min-h-screen bg-background pb-16 md:pb-0 overflow-x-hidden">
        <Header />
        <main>
          <Hero />
          <AIFeaturesSection />
          <DashboardPromo />
          <Services />
          <BlogPreview />
          <Testimonials />
          <ContactForm />
        </main>
        <Footer />
        <ChatWidget />
      </div>
    </>
  );
};

export default Index;