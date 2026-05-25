import Header from "@/components/Header";
import Hero from "@/components/Hero";
import AboutLawyer from "@/components/AboutLawyer";
import ConscriptionMap from "@/components/ConscriptionMap";
import ComplexCases from "@/components/ComplexCases";
import Services from "@/components/Services";
import Pricing from "@/components/Pricing";
import AIFeaturesSection from "@/components/AIFeaturesSection";
import DashboardPromo from "@/components/DashboardPromo";
import BlogPreview from "@/components/BlogPreview";
import Testimonials from "@/components/Testimonials";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";

const Index = () => {
  return (
    <>
      <SEOHead />
      <div className="min-h-screen bg-background pb-16 md:pb-0 overflow-x-hidden">
        <Header />
        <main>
          <Hero />
          <AboutLawyer />
          <ConscriptionMap />
          <ComplexCases />
          <Services />
          <Pricing />
          <AIFeaturesSection />
          <DashboardPromo />
          <Testimonials />
          <BlogPreview />
          <ContactForm />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
