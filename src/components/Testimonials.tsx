import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      name: "Дмитрий К.",
      age: 22,
      city: "Москва",
      content: "Благодаря профессиональной помощи смог получить военный билет по состоянию здоровья. Все документы были оформлены правильно, процедура прошла без проблем. Очень благодарен за поддержку!",
      rating: 5,
      category: "Медицинское освидетельствование"
    },
    {
      name: "Александр М.",
      age: 21,
      city: "Санкт-Петербург",
      content: "Отличная юридическая поддержка! Помогли правильно подготовить все документы и представили интересы в военкомате. Получил отсрочку для завершения образования.",
      rating: 5,
      category: "Юридическое сопровождение"
    },
    {
      name: "Максим В.",
      age: 20,
      city: "Екатеринбург",
      content: "Очень профессиональный подход к делу. Провели полный анализ медицинских документов, дали четкие рекомендации по дополнительным обследованиям. Результат превзошел ожидания!",
      rating: 5,
      category: "Медицинский анализ"
    }
  ];

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Отзывы наших клиентов
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Реальные истории успеха людей, которые получили профессиональную помощь
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="shadow-soft hover:shadow-medium transition-smooth border-0 bg-gradient-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <Quote className="h-8 w-8 text-muted-foreground/30" />
                </div>

                <p className="text-foreground mb-6 leading-relaxed italic">
                  "{testimonial.content}"
                </p>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">
                        {testimonial.name}, {testimonial.age} лет
                      </p>
                      <p className="text-sm text-muted-foreground">{testimonial.city}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                        {testimonial.category}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground mb-4">
            Присоединяйтесь к сотням довольных клиентов
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-8 text-sm text-muted-foreground">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-accent"></div>
              <span>500+ успешных случаев</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-accent"></div>
              <span>98% положительных отзывов</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-accent"></div>
              <span>10+ лет опыта</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;