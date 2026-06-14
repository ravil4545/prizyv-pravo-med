import DOMPurify from "dompurify";

export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "span",
      "div",
      "img",
      "hr",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class", "style"],
    ALLOW_DATA_ATTR: false,
  });
};

export const sanitizeBlogHtml = (html: string): string => {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "span",
      "div",
      "img",
      "hr",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
    ALLOW_DATA_ATTR: false,
  });

  if (typeof document === "undefined") return sanitized;

  const root = document.createElement("div");
  root.innerHTML = sanitized;

  root.querySelectorAll("p").forEach((paragraph) => {
    const text = paragraph.textContent?.trim() || "";
    if (!text) {
      paragraph.remove();
      return;
    }

    const heading = text.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(Math.max(heading[1].length, 2), 4);
      const el = document.createElement(`h${level}`);
      el.textContent = heading[2].trim();
      paragraph.replaceWith(el);
    }
  });

  const containers = [root, ...Array.from(root.querySelectorAll("*"))];
  containers.forEach((container) => {
    let child = container.firstElementChild;

    while (child) {
      const text = child.tagName.toLowerCase() === "p" ? child.textContent?.trim() || "" : "";
      const bullet = text.match(/^[-*]\s+(.+)$/);

      if (!bullet) {
        child = child.nextElementSibling;
        continue;
      }

      const list = document.createElement("ul");
      child.before(list);

      while (child && child.tagName.toLowerCase() === "p") {
        const item = (child.textContent?.trim() || "").match(/^[-*]\s+(.+)$/);
        if (!item) break;

        const listItem = document.createElement("li");
        listItem.textContent = item[1].trim();
        list.append(listItem);

        const next = child.nextElementSibling;
        child.remove();
        child = next;
      }
    }
  });

  return root.innerHTML;
};
