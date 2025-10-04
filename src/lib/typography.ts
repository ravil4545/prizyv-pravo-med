/**
 * Улучшает типографику текста, заменяя обычные символы на правильные
 */
export function enhanceTypography(text: string): string {
  if (!text) return text;

  return text
    // Кавычки
    .replace(/"/g, '«')
    .replace(/"/g, '»')
    .replace(/"([^"]+)"/g, '«$1»')
    
    // Тире и дефисы
    .replace(/(\s)--(\s)/g, '$1—$2') // двойной дефис в тире
    .replace(/(\s)-(\s)/g, '$1—$2') // одиночный дефис между словами в тире
    .replace(/(\d+)-(\d+)/g, '$1–$2') // дефис между числами в короткое тире
    
    // Многоточие
    .replace(/\.\.\./g, '…')
    
    // Неразрывные пробелы
    .replace(/(\d+)\s+(год|года|лет|руб|₽|%)/g, '$1\u00A0$2')
    .replace(/([а-яА-Я]{1,2})\s+/g, '$1\u00A0')
    
    // Номера и параграфы
    .replace(/№\s*(\d+)/g, '№\u00A0$1')
    .replace(/§\s*(\d+)/g, '§\u00A0$1')
    
    // Множественные пробелы
    .replace(/\s{2,}/g, ' ');
}

/**
 * Преобразует обычный текст в Markdown, автоматически определяя структуру
 */
export function textToMarkdown(text: string): string {
  if (!text) return text;
  
  // Если текст уже содержит markdown-разметку, возвращаем как есть
  if (text.includes('#') || text.includes('**') || text.includes('##')) {
    return text;
  }
  
  let lines = text.split('\n');
  let result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (!line) {
      result.push('');
      continue;
    }
    
    // Определяем заголовки по паттернам
    // H2: строки, которые заканчиваются без точки и следующая строка - обычный текст
    if (
      line.length < 100 && 
      !line.endsWith('.') && 
      !line.endsWith(',') && 
      !line.endsWith(':') &&
      !line.match(/^\d+\./) && // не начинается с цифры и точки
      i + 1 < lines.length && 
      lines[i + 1].trim().length > 0
    ) {
      // Проверяем, не часть ли это списка
      const nextLine = lines[i + 1].trim();
      if (!nextLine.match(/^[•\-\*]/)) {
        result.push(`## ${line}`);
        continue;
      }
    }
    
    // H3: Подзаголовки (более короткие строки без точки)
    if (
      line.length < 50 && 
      !line.endsWith('.') && 
      !line.endsWith(',') &&
      !line.match(/^\d+\./) &&
      line.match(/^[А-ЯЁA-Z]/)
    ) {
      result.push(`### ${line}`);
      continue;
    }
    
    // Нумерованные списки
    if (line.match(/^\d+\./)) {
      result.push(line);
      continue;
    }
    
    // Маркированные списки
    if (line.match(/^[•\-\*]/)) {
      result.push(line.replace(/^[•]/, '-'));
      continue;
    }
    
    // Жирный текст для важных фраз (в скобках или с двоеточием в конце)
    if (line.match(/^[А-ЯЁ][а-яё\s]+:/)) {
      result.push(line.replace(/^([^:]+):/, '**$1:**'));
      continue;
    }
    
    // Обычный текст
    result.push(line);
  }
  
  return result.join('\n\n');
}
