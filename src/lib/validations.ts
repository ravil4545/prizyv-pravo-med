import { z } from "zod";

// Contact form validation
export const contactFormSchema = z.object({
  name: z.string()
    .trim()
    .min(2, { message: "Имя должно содержать минимум 2 символа" })
    .max(100, { message: "Имя не должно превышать 100 символов" })
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]+$/, { message: "Имя может содержать только буквы, пробелы и дефисы" }),
  
  phone: z.string()
    .trim()
    .min(10, { message: "Введите корректный номер телефона" })
    .max(18, { message: "Номер телефона слишком длинный" })
    .regex(/^[\d\s+()-]+$/, { message: "Некорректный формат телефона" }),
  
  email: z.string()
    .trim()
    .email({ message: "Введите корректный email" })
    .max(255, { message: "Email не должен превышать 255 символов" })
    .optional()
    .or(z.literal("")),
  
  message: z.string()
    .trim()
    .min(10, { message: "Сообщение должно содержать минимум 10 символов" })
    .max(2000, { message: "Сообщение не должно превышать 2000 символов" })
});

// Auth validation
export const signUpSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: "Введите корректный email" })
    .max(255, { message: "Email не должен превышать 255 символов" }),
  
  password: z.string()
    .min(8, { message: "Пароль должен содержать минимум 8 символов" })
    .max(72, { message: "Пароль не должен превышать 72 символа" })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { 
      message: "Пароль должен содержать заглавные и строчные буквы, и цифры" 
    }),
  
  fullName: z.string()
    .trim()
    .min(2, { message: "Имя должно содержать минимум 2 символа" })
    .max(100, { message: "Имя не должно превышать 100 символов" })
    .regex(/^[а-яА-ЯёЁa-zA-Z\s-]+$/, { message: "Имя может содержать только буквы, пробелы и дефисы" }),
  
  phone: z.string()
    .trim()
    .min(10, { message: "Введите корректный номер телефона" })
    .max(18, { message: "Номер телефона слишком длинный" })
    .regex(/^[\d\s+()-]+$/, { message: "Некорректный формат телефона" })
    .optional()
    .or(z.literal(""))
});

export const signInSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: "Введите корректный email" }),
  
  password: z.string()
    .min(1, { message: "Введите пароль" })
});

// Forum post validation
export const forumPostSchema = z.object({
  title: z.string()
    .trim()
    .min(5, { message: "Заголовок должен содержать минимум 5 символов" })
    .max(200, { message: "Заголовок не должен превышать 200 символов" }),
  
  content: z.string()
    .trim()
    .min(20, { message: "Содержание должно содержать минимум 20 символов" })
    .max(5000, { message: "Содержание не должно превышать 5000 символов" })
});

// Testimonial validation
export const testimonialSchema = z.object({
  content: z.string()
    .trim()
    .min(20, { message: "Отзыв должен содержать минимум 20 символов" })
    .max(1000, { message: "Отзыв не должен превышать 1000 символов" }),
  
  rating: z.number()
    .int()
    .min(1, { message: "Минимальная оценка - 1" })
    .max(5, { message: "Максимальная оценка - 5" })
});
