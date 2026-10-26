// Builds assets/search-index.json from the docs pages: one entry per h1/h2/h3 section.
// Run from sites/docs: node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const strip = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const out = [];
for (const file of readdirSync('.').filter((f) => f.endsWith('.html') && f !== '404.html').sort()) {
  const html = readFileSync(file, 'utf8');
  const article = html.match(/<article>([\s\S]*?)<div class="page-meta">/)?.[1] ?? '';
  const title = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? file);
  const url = file === 'index.html' ? '/' : '/' + file;
  const parts = article.split(/(?=<h[23] id=")/);
  parts.forEach((part, i) => {
    const m = part.match(/^<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/);
    const heading = m ? strip(m[3]) : title;
    const text = strip(m ? part.slice(m[0].length) : part.replace(/<h1[\s\S]*?<\/h1>/, '')).slice(0, 300);
    if (!m && i > 0) return;
    out.push({ title, heading, url: m ? `${url}#${m[2]}` : url, text });
  });
}
writeFileSync('assets/search-index.json', JSON.stringify(out));
console.log(`${out.length} entries`);
