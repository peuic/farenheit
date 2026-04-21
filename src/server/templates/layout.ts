export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: #f6f4ef;
  color: #111;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 18px;
  line-height: 1.4;
}
body { padding: 12px 14px 32px; max-width: 720px; margin: 0 auto; }
a { color: #111; text-decoration: underline; }
a:active { color: #555; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 18px 0 8px; border-bottom: 1px solid #888; padding-bottom: 4px; }
.sub { color: #555; font-size: 14px; margin: 0 0 10px; }
.categories { font-size: 15px; margin-bottom: 10px; }
.categories a { margin-right: 10px; display: inline-block; padding: 6px 0; }
.book-list { list-style: none; margin: 0; padding: 0; }
.book-list li { padding: 12px 0; border-bottom: 1px dotted #999; }
.book-list a {
  display: flex; align-items: center; gap: 12px;
  text-decoration: none; color: inherit;
  min-height: 70px;
}
.book-list .cover {
  width: 48px; height: 72px; flex-shrink: 0;
  background: #ccc;
  object-fit: cover;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}
.book-list .cover.placeholder {
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #666; text-align: center; padding: 4px;
}
.book-list .meta .title { font-weight: bold; }
.book-list .meta .author { color: #555; font-size: 14px; margin-top: 2px; }
.book-list li.downloaded { opacity: 0.45; }
.book-list li.downloaded .title::after { content: " ✓"; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; }
.search input[type="text"] {
  width: 100%; padding: 12px; font-size: 18px;
  border: 2px solid #222; border-radius: 3px; background: white;
}
.search button {
  margin-top: 8px; padding: 12px 16px; font-size: 16px;
  background: #111; color: white; border: none; border-radius: 3px;
}
.detail .cover-big {
  display: block; margin: 16px auto; max-width: 240px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.25);
  border-radius: 3px;
}
.detail .cover-big.placeholder {
  width: 200px; height: 300px;
  display: flex; align-items: center; justify-content: center;
  background: #ddd; color: #666;
}
.detail h1 { text-align: center; font-size: 22px; margin-top: 12px; }
.detail .author { text-align: center; font-style: italic; color: #444; margin: 4px 0 10px; }
.detail .filemeta { text-align: center; font-size: 13px; color: #666; padding-bottom: 12px; border-bottom: 1px dotted #999; }
.detail .description { margin: 16px 0; text-align: justify; font-size: 16px; line-height: 1.5; }
.download-btn {
  display: block; width: 100%; padding: 18px;
  background: #111; color: white;
  font-size: 17px; font-weight: bold; letter-spacing: 0.05em;
  text-align: center; text-decoration: none;
  border-radius: 3px;
  text-transform: uppercase;
}
.download-btn.done {
  background: transparent; color: #333; border: 2px solid #555;
  padding: 16px; font-weight: normal;
}
.empty { color: #666; text-align: center; padding: 40px 0; }
`;

export function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
