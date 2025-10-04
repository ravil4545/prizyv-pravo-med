import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Services from "@/components/Services";
import BlogPreview from "@/components/BlogPreview";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Services />
        <BlogPreview />
        <Testimonials />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
};

export default Index;