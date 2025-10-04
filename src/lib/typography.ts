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
  if (text.includes('##') && text.includes('**')) {
    return text;
  }
  
  let lines = text.split('\n');
  let result: string[] = [];
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Пустая строка - добавляем разрыв абзаца
    if (!line) {
      if (inList) {
        inList = false;
      }
      result.push('');
      continue;
    }
    
    // H2: Основные заголовки (начинаются с цифры и точки, например "1. Заголовок")
    if (line.match(/^\d+\.\s+[А-ЯЁA-Z]/)) {
      result.push('');
      result.push(`## ${line}`);
      result.push('');
      inList = false;
      continue;
    }
    
    // H3: Подзаголовки (короткие строки с заглавной буквы без точки в конце)
    if (
      line.length < 80 && 
      line.match(/^[А-ЯЁA-Z]/) &&
      !line.endsWith('.') && 
      !line.endsWith(',') && 
      !line.endsWith(':') &&
      !line.match(/^\d+\)/) &&
      !line.match(/^[•\-\*\–\—]/) &&
      i + 1 < lines.length && 
      lines[i + 1].trim().length > 0
    ) {
      const nextLine = lines[i + 1].trim();
      // Проверяем, что следующая строка не список
      if (!nextLine.match(/^[•\-\*\–\—]/) && !nextLine.match(/^\d+\)/)) {
        result.push('');
        result.push(`### ${line}`);
        result.push('');
        inList = false;
        continue;
      }
    }
    
    // Нумерованные подсписки с круглой скобкой (1) 2) 3))
    if (line.match(/^\d+\)\s+/)) {
      if (!inList) {
        result.push('');
      }
      result.push(line.replace(/^(\d+)\)\s+/, '$1. '));
      inList = true;
      continue;
    }
    
    // Маркированные списки (•, -, *, –, —)
    if (line.match(/^[•\-\*\–\—]\s+/)) {
      if (!inList) {
        result.push('');
      }
      result.push(line.replace(/^[•\–\—]/, '-'));
      inList = true;
      continue;
    }
    
    // Жирный текст для важных терминов и фраз
    // 1. Фразы с двоеточием (Важно: текст)
    if (line.match(/^[А-ЯЁA-Z][а-яёa-zA-Z\s]+:/)) {
      line = line.replace(/^([^:]+):/, '**$1:**');
    }
    
    // 2. Текст в кавычках делаем жирным
    line = line.replace(/«([^»]+)»/g, '**«$1»**');
    
    // 3. Критерии, правила и другие ключевые фразы
    line = line.replace(/\b(Критерии для освобождения|Как подтвердить|Важно|Внимание|Примечание|Обратите внимание)\b/g, '**$1**');
    
    // Добавляем обычный текст
    if (inList) {
      result.push(line);
    } else {
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      result.push(line);
    }
  }
  
  return result.join('\n');
}
