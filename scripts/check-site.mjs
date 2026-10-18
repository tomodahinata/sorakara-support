#!/usr/bin/env node
// @ts-check
// 公開の前の検査（依存なし。Node 22 以降）。page を足したり文や色を変えたりしたら走らせる:
//   node scripts/check-site.mjs [--canonical <sorakara の repo>]
//
// 確かめること:
//   1. どの page も lang="ja"・charset・viewport・空でない title・h1 を 1 つ持つ。
//   2. 外部の資源を読み込まない（script・img・iframe などは置かない。link は同じ site の stylesheet だけ。どの .css にも
//      @import と外の url() が無い）。訪問者の情報を第三者に送らないため。外の site への link は ALLOWED_EXTERNAL だけ。
//   3. site の中の link が実在の file を指し、#id もその page にある。
//   4. style.css の色の組が light と dark の両方で WCAG 2.2 AA（文字 4.5:1、focus の枠 3:1）を満たす。
//   5. どの page にも、下書きの印（【 と ［事業者）が無い。
//   6. --canonical を渡したとき:
//      a. 法務の 4 page の本文が、正本（sorakara の docs/legal/*.md の ```text の中身）と行ごとに同じで、同じ順に並ぶ
//         （h1 は正本の 1 行目、h2 は正本の見出しの行。公開の文と正本の文のずれを見つける）。
//      b. どの page の文にも、sorakara の scripts/lib/banned-words.txt（SPEC §11.2 の写し）の語が無い（allow: の例外を除く）。
// 失敗が 1 つでもあれば一覧を出して exit 1。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** GitHub Pages の公開の URL（絶対の href はこの下だけを site の中として扱う）。 */
const SITE_URL = 'https://tomodahinata.github.io/sorakara-support/';
/** 外の site への link で許すもの。Apple の標準 EULA は利用規約の第 2 条が指し、App Review 3.1.2 が link を求める。 */
const ALLOWED_EXTERNAL = new Set(['https://www.apple.com/legal/internet-services/itunes/dev/stdeula/']);
/** 下書きの印。正本の md の注記には残るが、公開の文には出さない。 */
const DRAFT_MARKS = ['【', '［事業者'];

/**
 * 法務の page と正本の対応。h2 は正本の行のうち見出しにする行の形（null は見出しなし）。
 * @type {{ page: string, source: string, h2: RegExp | null }[]}
 */
const DOCUMENTS = [
  { page: 'privacy/index.html', source: 'docs/legal/privacy-policy.md', h2: /^\d+\. / },
  { page: 'terms/index.html', source: 'docs/legal/terms.md', h2: /^第\d+条（/ },
  { page: 'tokushoho/index.html', source: 'docs/legal/tokushoho.md', h2: null },
  { page: 'external-transmission/index.html', source: 'docs/legal/external-transmission.md', h2: /^\d+\. / },
];
/** 使わない語の表（sorakara の repo の中の場所）。 */
const BANNED_WORDS = 'scripts/lib/banned-words.txt';

/** @type {string[]} */
const problems = [];

/** @param {string} dir @param {string} extension @returns {string[]} root からの相対 path */
function filesWithExtension(dir, extension) {
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'node_modules' || name === 'scripts') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesWithExtension(path, extension);
    return name.endsWith(extension) ? [relative(root, path)] : [];
  });
}

/** @param {string} tag @param {string} name @returns {string | null} */
function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1] ?? null;
}

/** @param {string} html @param {string} name @returns {string[]} 開きの tag の全文 */
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0]);
}

/** @param {string} html @returns {Set<string>} */
function idsOf(html) {
  return new Set([...html.matchAll(/\sid\s*=\s*"([^"]+)"/gi)].map((match) => match[1] ?? ''));
}

/** @param {string} text @returns {string} 文字参照を戻す（tag を除いた後に呼ぶ）。 */
function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** @param {string} line @returns {string} ASCII の空白の並びを 1 つにして端を落とす（全角の空白は本文の一部として残す）。 */
function normalize(line) {
  return line.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '');
}

/** @param {string} html @returns {string} tag を除いた 1 行の文 */
function inlineText(html) {
  return normalize(decode(html.replace(/<[^>]+>/g, '')));
}

/** @param {string} html @param {string} level @returns {string[]} */
function headings(html, level) {
  return [...html.matchAll(new RegExp(`<${level}\\b[^>]*>([\\s\\S]*?)<\\/${level}>`, 'gi'))].map((match) => inlineText(match[1] ?? ''));
}

/**
 * page の本文（<main> の中、<footer> の前）を、正本と比べる行に分ける。
 * - block の要素（見出し・段落・箇条など）が 1 行。箇条の項目は正本の書き方に合わせて「・」から始める。
 * - 表の行は「見出し：値」。値が段落か箇条で始まるときは、正本の「見出し：」の行と、その下の行に分ける。
 * @param {string} html @returns {string[]}
 */
function documentLines(html) {
  const main = /<main\b[^>]*>([\s\S]*?)(?:<footer\b|<\/main>)/i.exec(html)?.[1] ?? '';
  const rows = main.replace(
    /<tr\b[^>]*>\s*<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
    (_, th, td) => {
      const label = `${inlineText(String(th))}：`;
      return /^\s*<(?:p|ul)\b/i.test(String(td)) ? `\n${label}\n${String(td)}\n` : `\n${label}${String(td)}\n`;
    },
  );
  const text = rows
    .replace(/<li\b[^>]*>/gi, '\n・')
    .replace(/<\/?(?:p|li|ul|ol|table|tbody|thead|tr|td|th|caption|h[1-6]|div|section|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(text).split('\n').map(normalize).filter((line) => line !== '');
}

/** @param {string} markdown @returns {string[] | null} ```text の中身の行（空の行を除く）。```text が 1 つでなければ null。 */
function canonicalLines(markdown) {
  const blocks = [...markdown.matchAll(/^```text\n([\s\S]*?)^```$/gm)];
  if (blocks.length !== 1) return null;
  return (blocks[0]?.[1] ?? '').split('\n').map(normalize).filter((line) => line !== '');
}

/**
 * site の中の href を、root からの相対の file と #id に解く。外（mailto・別の host）は null。
 * @param {string} page root からの相対 path
 * @param {string} href
 * @returns {{ file: string, hash: string | null } | null}
 */
function resolveInternal(page, href) {
  let path = href;
  if (path.startsWith(SITE_URL)) path = `/${path.slice(SITE_URL.length)}`;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  const [beforeHash, hash = null] = path.split('#', 2);
  const target = beforeHash === undefined || beforeHash === '' ? page : resolveFile(page, beforeHash);
  return { file: target, hash };
}

/** @param {string} page @param {string} path @returns {string} */
function resolveFile(page, path) {
  const absolute = path.startsWith('/')
    ? join(root, path)
    : resolve(join(root, dirname(page)), path);
  const file = path.endsWith('/') || (existsSync(absolute) && statSync(absolute).isDirectory())
    ? join(absolute, 'index.html')
    : absolute;
  return relative(root, file);
}

const pages = filesWithExtension(root, '.html').sort();
/** @type {Map<string, string>} */
const sources = new Map(pages.map((page) => [page, readFileSync(join(root, page), 'utf8')]));

// 1–3・5: page ごとの検査。
for (const [page, html] of sources) {
  const lang = /<html\b[^>]*\slang="([^"]+)"/i.exec(html)?.[1];
  if (lang !== 'ja') problems.push(`${page}: <html lang> が ja でない（${String(lang)}）`);
  if (!/<meta\s+charset="utf-8">/i.test(html)) problems.push(`${page}: <meta charset="utf-8"> が無い`);
  if (!tags(html, 'meta').some((tag) => attribute(tag, 'name') === 'viewport' && (attribute(tag, 'content') ?? '').includes('width=device-width'))) {
    problems.push(`${page}: viewport の meta が無い`);
  }
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  if (title === '') problems.push(`${page}: title が空`);
  if (tags(html, 'h1').length !== 1) problems.push(`${page}: h1 が 1 つでない`);
  for (const mark of DRAFT_MARKS) {
    if (html.includes(mark)) problems.push(`${page}: 下書きの印「${mark}」が残っている`);
  }

  for (const name of ['script', 'img', 'iframe', 'object', 'embed', 'video', 'audio', 'source', 'base', 'form']) {
    if (tags(html, name).length > 0) problems.push(`${page}: <${name}> を置かない（外部の資源と通信を持たない site）`);
  }
  if (/\sstyle\s*=|@import|url\(/i.test(html)) problems.push(`${page}: inline の style・@import・url() を置かない`);
  if (/target\s*=\s*"_blank"/i.test(html)) problems.push(`${page}: target="_blank" を使わない`);

  for (const tag of tags(html, 'link')) {
    const rel = attribute(tag, 'rel');
    const href = attribute(tag, 'href') ?? '';
    if (rel !== 'stylesheet') problems.push(`${page}: 許していない link（rel=${String(rel)}）`);
    else if (href.includes(':') || href.startsWith('//')) problems.push(`${page}: 外部の stylesheet ${href}`);
  }

  const hrefs = [...tags(html, 'a'), ...tags(html, 'link')]
    .map((tag) => attribute(tag, 'href'))
    .filter((href) => href !== null);
  for (const href of hrefs) {
    if (href.startsWith('mailto:') || ALLOWED_EXTERNAL.has(href)) continue;
    if (/^https?:/i.test(href) && !href.startsWith(SITE_URL)) {
      problems.push(`${page}: 外の site への link ${href}（必要なら ALLOWED_EXTERNAL に理由と一緒に足す）`);
      continue;
    }
    const target = resolveInternal(page, href);
    if (target === null) continue;
    const targetHtml = sources.get(target.file) ?? (existsSync(join(root, target.file)) ? readFileSync(join(root, target.file), 'utf8') : null);
    if (targetHtml === null) {
      problems.push(`${page}: ${href} の先 ${target.file} が無い`);
    } else if (target.hash !== null && target.file.endsWith('.html') && !idsOf(targetHtml).has(target.hash)) {
      problems.push(`${page}: ${href} の #${target.hash} が ${target.file} に無い`);
    }
  }
}

// 2 の続き: stylesheet も外の資源を読まない（@import と、scheme か // で始まる url()）。
for (const sheet of filesWithExtension(root, '.css').sort()) {
  if (/@import|url\(\s*['"]?(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(readFileSync(join(root, sheet), 'utf8'))) {
    problems.push(`${sheet}: @import と外の url() を置かない（外部の資源と通信を持たない site）`);
  }
}

// 4: 色のコントラスト（WCAG 2.2 の相対輝度）。
/** @param {string} hex @returns {number} */
function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b @returns {number} */
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}
/** @param {string} block @returns {Map<string, string>} */
function tokens(block) {
  return new Map([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1] ?? '', match[2] ?? '']));
}
const css = readFileSync(join(root, 'style.css'), 'utf8');
const lightBlock = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
const darkBlock = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';
/** 前景・背景・必要な比（文字は 4.5、focus の枠は 3: WCAG 1.4.3・1.4.11）。 */
const PAIRS = [
  ['ink', 'ground', 4.5],
  ['ink-soft', 'ground', 4.5],
  ['accent', 'ground', 4.5],
  ['ink', 'surface', 4.5],
  ['ink-soft', 'surface', 4.5],
  ['accent', 'surface', 4.5],
  ['focus', 'ground', 3],
];
/** @type {string[]} */
const ratios = [];
for (const [mode, block] of /** @type {const} */ ([['light', lightBlock], ['dark', darkBlock]])) {
  const palette = tokens(block);
  for (const [fg, bg, minimum] of PAIRS) {
    const a = palette.get(String(fg));
    const b = palette.get(String(bg));
    if (a === undefined || b === undefined) {
      problems.push(`style.css（${mode}）: --${String(fg)} か --${String(bg)} が 16 進の 6 桁で無い`);
      continue;
    }
    const ratio = contrast(a, b);
    ratios.push(`${mode} ${String(fg)}/${String(bg)} ${ratio.toFixed(2)}`);
    if (ratio < Number(minimum)) problems.push(`style.css（${mode}）: --${String(fg)} と --${String(bg)} の比 ${ratio.toFixed(2)} < ${String(minimum)}`);
  }
}

// 6: 正本（sorakara の repo）との照合。
const canonicalAt = process.argv.indexOf('--canonical');
const canonicalRepo = canonicalAt === -1 ? null : process.argv[canonicalAt + 1];
if (canonicalAt !== -1) {
  if (canonicalRepo === undefined || canonicalRepo === null || !existsSync(join(canonicalRepo, 'docs/legal'))) {
    problems.push(`--canonical に sorakara の repo（docs/legal がある directory）を渡す（${String(canonicalRepo)}）`);
  } else {
    // 6a: 法務の page の本文と見出し。
    for (const { page, source, h2 } of DOCUMENTS) {
      const html = sources.get(page);
      const sourcePath = join(canonicalRepo, source);
      if (html === undefined) {
        problems.push(`${page}: page が無い（正本は ${source}）`);
        continue;
      }
      if (!existsSync(sourcePath)) {
        problems.push(`${page}: 正本 ${source} が無い`);
        continue;
      }
      const expected = canonicalLines(readFileSync(sourcePath, 'utf8'));
      if (expected === null) {
        problems.push(`${source}: \`\`\`text の本文が 1 つでない`);
        continue;
      }
      const h1 = headings(html, 'h1')[0] ?? '';
      if (h1 !== expected[0]) problems.push(`${page}: h1 が正本の 1 行目と違う（公開: ${h1} / 正本: ${String(expected[0])}）`);
      const publishedH2 = headings(html, 'h2');
      const expectedH2 = h2 === null ? [] : expected.filter((line) => h2.test(line));
      if (publishedH2.join('\n') !== expectedH2.join('\n')) {
        problems.push(`${page}: h2 が ${source} の見出しと違う\n  公開: ${publishedH2.join(' | ')}\n  正本: ${expectedH2.join(' | ')}`);
      }
      const published = documentLines(html);
      const length = Math.max(published.length, expected.length);
      for (let index = 0; index < length; index += 1) {
        if (published[index] !== expected[index]) {
          problems.push(`${page}: ${String(index + 1)} 行目から ${source} と違う\n  公開: ${String(published[index])}\n  正本: ${String(expected[index])}`);
          break; // 1 か所ずれると後ろは全部ずれるので、最初の 1 か所だけ出す
        }
      }
    }

    // 6b: 使わない語（SPEC §11.2）。title・description・本文を見る。
    const bannedPath = join(canonicalRepo, BANNED_WORDS);
    if (!existsSync(bannedPath)) {
      problems.push(`${BANNED_WORDS} が無い（${bannedPath}）`);
    } else {
      const rules = readFileSync(bannedPath, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
      const allows = rules.filter((line) => line.startsWith('allow: ')).map((line) => new RegExp(line.slice('allow: '.length), 'gu'));
      const bans = rules.filter((line) => !line.startsWith('allow: ')).map((line) => new RegExp(line, 'u'));
      for (const [page, html] of sources) {
        const description = tags(html, 'meta').map((tag) => attribute(tag, 'content') ?? '').join('\n');
        const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
        let text = [title, description, documentLines(html).join('\n')].join('\n');
        for (const allow of allows) text = text.replace(allow, '');
        for (const ban of bans) {
          const hit = ban.exec(text);
          if (hit !== null) problems.push(`${page}: 使わない語「${hit[0]}」（SPEC §11.2）: …${text.slice(Math.max(0, hit.index - 20), hit.index + 20).replace(/\n/g, ' ')}…`);
        }
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`check-site: ${String(problems.length)} 件\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  process.exit(1);
}
const scope = canonicalRepo ? '正本と使わない語も照合' : '正本との照合なし（--canonical を渡すと照合する）';
console.log(`check-site: OK（${String(pages.length)} pages。${scope}。${ratios.join('、')}）`);
