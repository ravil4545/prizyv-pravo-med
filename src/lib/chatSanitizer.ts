/**
 * Защита от обмена внешними контактами в чате клиент↔юрист.
 *
 * Сценарий: до подписания договора стороны должны общаться внутри платформы.
 * Это защищает клиента от мошенников, представляющихся юристом снаружи, и
 * защищает юриста от попыток клиента увести беседу из платёжного контура.
 *
 * Мы детектируем телефоны, email, @username, t.me/wa.me-ссылки и заменяем
 * на маркер. Список консервативный — false-positives возможны (например,
 * "+7" как часть предложения), но цена пропуска контакта выше.
 */

const REPLACEMENT = "[контакт скрыт администрацией]";

interface DetectionPattern {
  name: "phone" | "email" | "telegram" | "whatsapp" | "url-messenger";
  regex: RegExp;
}

const PATTERNS: DetectionPattern[] = [
  // Телефоны: +7XXXXXXXXXX, 8XXXXXXXXXX, +7 (XXX) XXX-XX-XX и вариации
  // 9+ подряд цифр (с возможными разделителями: пробел, дефис, скобка, точка)
  { name: "phone", regex: /(?:\+?\d[\s().-]?){9,15}\d/g },

  // Email
  { name: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/gi },

  // @username (Telegram-style) — минимум 5 символов после @
  { name: "telegram", regex: /(?:^|\s)@[a-zA-Z0-9_]{5,32}\b/g },

  // Ссылки на мессенджеры
  { name: "url-messenger", regex: /\b(?:t\.me|telegram\.me|wa\.me|whatsapp\.com|viber\.com|signal\.org|join\.skype\.com)\/[^\s)>"']*/gi },
];

export interface SanitizeResult {
  /** Текст с заменёнными контактами */
  sanitized: string;
  /** Какие типы контактов были найдены и заменены */
  detected: DetectionPattern["name"][];
  /** True если что-то заменили */
  hasReplacements: boolean;
}

export function sanitizeChatMessage(text: string): SanitizeResult {
  if (!text) return { sanitized: text, detected: [], hasReplacements: false };

  let sanitized = text;
  const detected = new Set<DetectionPattern["name"]>();

  for (const { name, regex } of PATTERNS) {
    // Сбрасываем lastIndex для глобальных regex — используем .test/.replace без сохранения
    if (regex.test(sanitized)) {
      detected.add(name);
      sanitized = sanitized.replace(regex, (match) => {
        // Для @username сохраняем ведущий пробел/начало строки
        if (name === "telegram") {
          const leading = match.match(/^(\s)/);
          return (leading?.[1] || "") + REPLACEMENT;
        }
        return REPLACEMENT;
      });
    }
  }

  return {
    sanitized,
    detected: Array.from(detected),
    hasReplacements: detected.size > 0,
  };
}

const TYPE_LABELS: Record<DetectionPattern["name"], string> = {
  phone: "телефон",
  email: "email",
  telegram: "Telegram-логин",
  whatsapp: "WhatsApp",
  "url-messenger": "ссылку на мессенджер",
};

export function describeDetected(types: DetectionPattern["name"][]): string {
  if (types.length === 0) return "";
  return types.map((t) => TYPE_LABELS[t]).join(", ");
}
