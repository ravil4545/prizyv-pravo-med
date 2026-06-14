/**
 * Улучшает типографику текста, заменяя обычные символы на правильные
 */
export function enhanceTypography(text: string): string {
  if (!text) return text;

  return text
    // Кавычки
    .replace(/"([^"]+)"/g, '«$1»')
    
    // Тире и дефисы
    .replace(/([ \t])--([ \t])/g, '$1—$2') // двойной дефис в тире
    .replace(/([ \t])-([ \t])/g, '$1—$2') // одиночный дефис между словами в тире
    .replace(/(\d+)-(\d+)/g, '$1–$2') // дефис между числами в короткое тире
    
    // Многоточие
    .replace(/\.\.\./g, '…')
    
    // Неразрывные пробелы. Не трогаем \n: Markdown-разметка статей держится на переносах строк.
    .replace(/(\d+)[ \t]+(год|года|лет|руб|₽|%)/g, '$1\u00A0$2')
    .replace(/\b([а-яА-ЯёЁ]{1,2})[ \t]+(?=[а-яА-ЯёЁ])/g, '$1\u00A0')
    
    // Номера и параграфы
    .replace(/№[ \t]*(\d+)/g, '№\u00A0$1')
    .replace(/§[ \t]*(\d+)/g, '§\u00A0$1')
    
    // Множественные пробелы внутри строк
    .replace(/[ \t]{2,}/g, ' ');
}

/**
 * Преобразует ссылки на статьи Расписания болезней № 565 из формата [Ст. NN]
 * (который ИИ возвращает в ответе) в markdown-ссылки на /medical-history.
 * UI рендерит их как кликабельные.
 *
 * Поддерживает: [Ст. 24], [Ст. 26.б], [Ст. 66.а], [Ст. 5.1] и т.п.
 */
export function linkifyDiseaseArticles(text: string): string {
  if (!text) return text;
  return text.replace(
    /\[Ст\.\s*(\d+(?:\.[а-яёa-z0-9]+)?)\]/gi,
    (_, num) => `[Ст. ${num}](/medical-history?article=${encodeURIComponent(num)})`,
  );
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
  let inImplicitList = false;

  const shouldStopImplicitList = (line: string): boolean =>
    /^\d+\.\s+/.test(line) ||
    /^(Важно|Внимание|Примечание|Вывод|Итог):/i.test(line) ||
    line.length > 280;

  const looksLikeImplicitListItem = (line: string): boolean => {
    if (!line || shouldStopImplicitList(line)) return false;
    if (line.endsWith(':')) return false;
    if (/^[•\-\*\–\—]\s+/.test(line) || /^\d+[\.)]\s+/.test(line)) return false;
    return line.length <= 280;
  };

  const countImplicitListItems = (startIndex: number): number => {
    let count = 0;
    for (let j = startIndex; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (!candidate) continue;
      if (!looksLikeImplicitListItem(candidate)) break;
      count++;
      if (count >= 2) return count;
    }
    return count;
  };
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Пустая строка - добавляем разрыв абзаца
    if (!line) {
      if (inImplicitList) {
        continue;
      }
      if (inList) {
        inList = false;
      }
      result.push('');
      continue;
    }

    if (inImplicitList) {
      if (shouldStopImplicitList(line)) {
        inImplicitList = false;
        inList = false;
        if (result.length > 0 && result[result.length - 1] !== '') {
          result.push('');
        }
      } else {
        result.push(`- ${line}`);
        inList = true;
        continue;
      }
    }

    const opensImplicitList = line.endsWith(':') && countImplicitListItems(i + 1) >= 2;
    
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
    if (line.match(/^[А-ЯЁA-Z][а-яёА-ЯЁa-zA-Z\s]+:/)) {
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

    if (opensImplicitList) {
      inImplicitList = true;
      inList = true;
    }
  }
  
  return result.join('\n');
}
