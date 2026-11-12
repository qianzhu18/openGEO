import { createHash, randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { fetchPublicWebText, validatePublicWebUrl } from '../../vendor/niubigeo/src/utils/public-web-fetch.js';
import { extractSameDomainLinks, extractSiteEvidencePage } from '../../vendor/niubigeo/src/keywords/site-evidence.js';
import { normalizeDomain } from '../../vendor/niubigeo/src/utils/domain.js';

export interface WebsiteResearch {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  submittedUrl: string;
  domain: string;
  language: string;
  country: string;
  market: 'international' | 'china';
  methodology: 'source-derived-templates/v1' | 'model-assisted/v1';
  profile: { brand: string; description: string; industry?: string } | null;
  sources: { id: string; title: string; url: string; text: string }[];
  claims: { id: string; label: string; value: string; status: 'unconfirmed'; sourceIds: string[] }[];
  topics: { id: string; name: string; sourceIds: string[]; origin: 'source-derived' | 'template' | 'model-assisted' }[];
  prompts: { id: string; text: string; intent: string; branded: boolean; status: 'suggested'; topicId: string; sourceIds: string[]; origin: 'template' | 'model-assisted' }[];
  competitors: { id: string; name: string; domain: string; sourceIds: string[] }[];
  attempts: { url: string; status: 'completed' | 'failed'; reason?: string }[];
  warnings: string[];
  createdAt: string;
}

type Page = { url: string; text: string; contentType: string };
export interface WebsiteResearchOptions {
  /** Dependency injection for offline tests. Production uses the DNS-pinned public web fetcher. */
  fetchPage?: (url: string) => Promise<Page | null>;
  /** Optional renderer for client-rendered pages (browser execution). */
  renderPage?: (url: string) => Promise<Page | null>;
  /** A caller may shorten, but cannot increase, the 25-second overall budget. */
  timeoutMs?: number;
}

const stableId = (kind: string, value: string) => `${kind}-${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
const compact = (value: string) => value.replace(/\s+/g, ' ').trim();

type FallbackEvidence = { title?: string; description?: string; text: string; headings: string[] };
function collectNextStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 8 || out.length > 600) return;
  if (typeof value === 'string') {
    const clean = compact(value);
    if (clean.length >= 12 && clean.length <= 400 && !/^https?:\/\//i.test(clean) && !/^[0-9a-f-]{20,}$/i.test(clean) && !clean.includes('@')) out.push(clean);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectNextStrings(item, out, depth + 1); return; }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/^(title|description|excerpt|subtitle|summary|content|text|name|quote|role)$/i.test(key) || typeof item === 'object') collectNextStrings(item, out, depth + 1);
    }
  }
}
/** Fallback for client-rendered pages: meta tags, __NEXT_DATA__ strings and noscript/body text. */
function fallbackEvidence(html: string): FallbackEvidence | null {
  const document = load(html);
  const title = compact(document('meta[property="og:title"]').attr('content') || document('title').first().text() || '');
  const description = compact(document('meta[property="og:description"]').attr('content') || document('meta[name="description"]').attr('content') || '');
  const scope = document('main, article, [role="main"]').first();
  const scopeText = compact(scope.text());
  const headings = (scopeText.length >= 80 ? scope.find('h1,h2,h3') : document('h1,h2,h3')).map((_, element) => compact(document(element).text())).get().filter(Boolean).slice(0, 10);
  const bodyCopy = load(html); bodyCopy('script,style').remove();
  const bodyText = scopeText.length >= 80 ? scopeText : compact(bodyCopy('body').text());
  const paragraph = compact(scope.find('p').first().text()) || compact(document('p').first().text());
  const derivedDescription = description || (paragraph.length >= 16 && paragraph.length <= 300 ? paragraph : '');
  const nextRaw = document('script').filter((_, element) => document(element).attr('id') === '__NEXT_DATA__').first().text();
  const strings: string[] = [];
  if (nextRaw) { try { collectNextStrings(JSON.parse(nextRaw), strings); } catch { /* ignore malformed payloads */ } }
  const text = compact([title, derivedDescription, ...new Set(strings).values() as unknown as string[], bodyText].filter(Boolean).join(' ')).slice(0, 12_000);
  return text.length >= 40 ? { ...(title ? { title } : {}), ...(derivedDescription ? { description: derivedDescription } : {}), text, headings } : null;
}
function attemptReason(error: unknown, deadline: number): string {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Research time budget exhausted.' || Date.now() >= deadline) return 'Research time budget exhausted.';
  if (/private or reserved addresses/i.test(message)) return 'DNS resolved to private or reserved addresses; public website access was blocked.';
  if (/Public DNS resolution failed/i.test(message)) return 'Public DNS resolution failed; check the local proxy or DNS configuration.';
  if (/No readable text/i.test(message)) return 'The page returned no readable text; client-rendered pages need browser rendering.';
  if (/No HTML/i.test(message)) return 'The URL did not return HTML.';
  if (/Redirect/i.test(message)) return 'The page redirected off the submitted domain.';
  return 'Could not obtain usable public HTML evidence.';
}

function entryUrl(input: string): URL {
  if (typeof input !== 'string' || !input.trim() || input.length > 2048) throw new Error('Enter a public website URL of up to 2048 characters.');
  const text = input.trim();
  const url = validatePublicWebUrl(text.includes('://') ? text : `https://${text}`);
  // Protocol-like input must not become an unintended hostname after adding HTTPS.
  if (!text.includes('://') && /^[a-z][a-z\d+.-]*:/i.test(text)) throw new Error('Enter a public HTTP(S) website URL.');
  url.hash = '';
  return url;
}

async function boundedPage(fetchPage: (url: string) => Promise<Page | null>, url: string, deadline: number): Promise<Page | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Research time budget exhausted.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchPage(url),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Research time budget exhausted.')), remaining); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function readEvidence(html: string, url: string): { title?: string; description: string; text: string; headings: string[] } {
  const parsed = extractSiteEvidencePage({ url, html });
  let title = parsed.title;
  let description = compact(parsed.description || parsed.ogDescription || parsed.jsonLdDescriptions?.[0] || '');
  let text = compact(parsed.textSnippet || '');
  let headings = (parsed.headings || []).map(compact).filter(Boolean);
  // Prefer the richer candidate: rendered/SSR DOM text or structured payload text.
  const fallback = fallbackEvidence(html);
  if (fallback) {
    title ||= fallback.title;
    description ||= fallback.description || '';
    if (fallback.text.length > text.length) text = fallback.text;
    if (!headings.length) headings = fallback.headings;
  }
  if (!text) text = compact([title, description].filter(Boolean).join(' '));
  return { ...(title ? { title } : {}), description, text, headings };
}

/** Local, source-derived preparation. No model calls, search-volume estimates, or inferred competitors. */
export async function researchWebsite(
  input: { url: string; language?: string; country?: string },
  options: WebsiteResearchOptions = {},
): Promise<WebsiteResearch> {
  const submitted = entryUrl(input.url);
  const rawLanguage = (input.language || 'en').trim().toLowerCase();
  const language = rawLanguage.startsWith('zh') ? 'zh' : rawLanguage.startsWith('en') ? 'en' : rawLanguage;
  const country = (input.country || (language === 'zh' ? 'CN' : 'US')).trim().toUpperCase();
  if (!['en', 'zh'].includes(language)) throw new Error('Research supports English and Chinese prompt templates only.');
  if (!['US', 'GB', 'CA', 'AU', 'CN'].includes(country)) throw new Error('Select a supported market: US, GB, CA, AU or CN.');
  const market: 'international' | 'china' = country === 'CN' ? 'china' : 'international';
  const timeoutMs = options.timeoutMs ?? 25_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Research timeout must be positive.');
  const deadline = Date.now() + Math.min(timeoutMs, 25_000);
  const fetchPage = options.fetchPage || fetchPublicWebText;
  const result: WebsiteResearch = {
    id: `research-${randomUUID()}`, status: 'failed', submittedUrl: submitted.href,
    domain: normalizeDomain(submitted.href), language, country, market,
    methodology: 'source-derived-templates/v1', profile: null,
    sources: [], claims: [], topics: [], prompts: [], competitors: [], attempts: [],
    warnings: language === 'zh' ? [
      '网站陈述属于来源证据，不等于已独立核实的品牌事实。',
      '建议问题来自已采集页面的中文模板；未调用模型，也未做搜索量测量。',
      '竞品发现需要额外研究；不会仅凭域名推断竞品。',
    ] : [
      'Website statements are source evidence, not independently verified brand facts.',
      'Suggested prompts use English templates grounded in collected pages; no LLM research or search-volume measurement was performed.',
      'Competitor discovery requires additional research; no competitors are inferred from the domain.',
    ], createdAt: new Date().toISOString(),
  };
  const alternateHost = (() => {
    try { const variant = new URL(submitted.href); variant.hostname = variant.hostname.startsWith('www.') ? variant.hostname.slice(4) : `www.${variant.hostname}`; return variant.href; } catch { return null; }
  })();
  const queue = [submitted.href];
  const seen = new Set<string>();
  for (let index = 0; index < queue.length && result.attempts.length < 3; index++) {
    const url = queue[index]!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      validatePublicWebUrl(url);
      const page = await boundedPage(fetchPage, url, deadline);
      if (!page || !/text\/html|application\/xhtml/i.test(page.contentType)) throw new Error('No HTML evidence.');
      let finalUrl = validatePublicWebUrl(page.url);
      if (normalizeDomain(finalUrl.href) !== result.domain) throw new Error('Redirect left the submitted website.');
      finalUrl.hash = '';
      let html = page.text.slice(0, 260_000);
      let evidence = readEvidence(html, finalUrl.href);
      // A JS shell has no readable text: render once with a real browser, then re-read the DOM.
      if (evidence.text.length < 120 && options.renderPage) {
        const rendered = await boundedPage(options.renderPage, url, deadline).catch(() => null as Page | null);
        if (rendered && /text\/html|application\/xhtml/i.test(rendered.contentType)) {
          const renderedUrl = validatePublicWebUrl(rendered.url);
          if (normalizeDomain(renderedUrl.href) === result.domain) {
            renderedUrl.hash = '';
            finalUrl = renderedUrl;
            html = rendered.text.slice(0, 400_000);
            evidence = readEvidence(html, finalUrl.href);
          }
        }
      }
      const evidenceTitle = evidence.title;
      const evidenceDescription = evidence.description;
      const evidenceText = evidence.text;
      const evidenceHeadings = evidence.headings;
      if (!evidenceText) throw new Error('No readable text on this page.');
      const sourceId = stableId('source', finalUrl.href);
      if (!result.sources.some(source => source.id === sourceId)) {
        result.sources.push({ id: sourceId, title: evidenceTitle || finalUrl.hostname, url: finalUrl.href, text: evidenceText.slice(0, 10_000) });
        if (index === 0) {
          const document = load(html);
          const siteName = document('meta[property="og:site_name"]').first().attr('content');
          const titleBrand = (evidenceTitle || '').split(/\s+[|–—-]\s+|\s*\|\s*/)[0];
          const genericLabel = (value: string) => /^(home|homepage|personal blog|blog|welcome|index|untitled)$/i.test((value || '').trim());
          const genericTitle = genericLabel(titleBrand);
          const rawDomainLabel = finalUrl.hostname.replace(/^www\./, '').split('.')[0] || '';
          const domainLabel = rawDomainLabel ? rawDomainLabel.charAt(0).toUpperCase() + rawDomainLabel.slice(1) : '';
          const brand = compact((genericLabel(siteName || '') ? '' : siteName) || (genericTitle ? '' : titleBrand) || domainLabel || evidenceHeadings[0]).slice(0, 100);
          if (brand) result.profile = { brand, description: evidenceDescription.slice(0, 1000) };
          if (brand) result.claims.push({ id: stableId('claim', `${sourceId}:brand`), label: language === 'zh' ? '网站品牌名称' : 'Website brand label', value: brand, status: 'unconfirmed', sourceIds: [sourceId] });
          if (evidenceDescription) result.claims.push({ id: stableId('claim', `${sourceId}:description`), label: language === 'zh' ? '网站描述' : 'Website description', value: evidenceDescription.slice(0, 1000), status: 'unconfirmed', sourceIds: [sourceId] });
          const links = extractSameDomainLinks(html, finalUrl.href, result.domain).filter(link => {
            try { validatePublicWebUrl(link); return true; } catch { return false; }
          });
          queue.push(...links.slice(0, 2));
        }
        for (const heading of evidenceHeadings) {
          const name = compact(heading).replace(/^[A-Z]\s*(?=[\u4e00-\u9fa5])/, '').trim();
          if (name.length < 5 || name.length > 120 || /^(get started|contact us|sign up|log in|learn more|welcome|home)$/i.test(name)) continue;
          if (/(归档|搜索|分类|标签|导航|menu|search|archive|category|tag)/i.test(name)) continue;
          const id = stableId('topic', name.toLowerCase());
          const existing = result.topics.find(topic => topic.id === id);
          if (existing && !existing.sourceIds.includes(sourceId)) existing.sourceIds.push(sourceId);
          else if (!existing && result.topics.length < 4) result.topics.push({ id, name, sourceIds: [sourceId], origin: 'source-derived' });
        }
      }
      result.attempts.push({ url, status: 'completed' });
    } catch (error) {
      // A transport may include sensitive response details in its error. Persist only a safe summary.
      result.attempts.push({ url, status: 'failed', reason: attemptReason(error, deadline) });
      if (index === 0 && alternateHost && !seen.has(alternateHost)) queue.splice(index + 1, 0, alternateHost);
      if (Date.now() >= deadline) break;
    }
  }
  if (!result.sources.length || !result.profile) {
    result.status = 'failed';
    result.warnings.push(language === 'zh' ? '没有取得可用的首页品牌画像；未创建任何诊断回答或指标。' : 'No usable homepage brand profile was obtained. No diagnostic answers or metrics were created.');
    return result;
  }
  const homeSource = result.sources[0]!;
  if (!result.topics.length) result.topics.push({ id: stableId('topic', `${result.domain}:brand-evaluation`), name: language === 'zh' ? '品牌评估' : 'Brand evaluation', sourceIds: [homeSource.id], origin: 'template' });
  const addPrompt = (text: string, intent: string, branded: boolean, topic: WebsiteResearch['topics'][number]) => {
    result.prompts.push({ id: stableId('prompt', `${result.domain}:${language}:${country}:${text}`), text, intent, branded, status: 'suggested', topicId: topic.id, sourceIds: [...topic.sourceIds], origin: 'template' });
  };
  if (language === 'zh') {
    addPrompt(`${result.profile.brand} 是做什么的，适合谁？`, 'brand_awareness', true, result.topics[0]!);
    addPrompt(`选择 ${result.profile.brand} 之前，应该核实哪些信息？`, 'commercial', true, result.topics[0]!);
    for (const topic of result.topics.filter(topic => topic.origin === 'source-derived')) {
      const mentionsBrand = topic.name.toLowerCase().includes(result.profile.brand.toLowerCase());
      addPrompt(`评估「${topic.name}」相关方案时，团队应该考虑什么？`, 'informational', mentionsBrand, topic);
    }
  } else {
    addPrompt(`What does ${result.profile.brand} offer, and who is it for?`, 'brand_awareness', true, result.topics[0]!);
    addPrompt(`What should a buyer verify before choosing ${result.profile.brand}?`, 'commercial', true, result.topics[0]!);
    for (const topic of result.topics.filter(topic => topic.origin === 'source-derived')) {
      const mentionsBrand = topic.name.toLowerCase().includes(result.profile.brand.toLowerCase());
      addPrompt(`What should teams consider when evaluating solutions for ${topic.name}?`, 'informational', mentionsBrand, topic);
    }
  }
  result.status = result.attempts.some(attempt => attempt.status === 'failed') || !result.profile.description ? 'partial' : 'completed';
  if (!result.profile.description) result.warnings.push(language === 'zh' ? '首页没有可用的描述，已留空，不做补写。' : 'The homepage did not expose a usable description; it was left blank.');
  if (result.attempts.some(attempt => attempt.status === 'failed')) result.warnings.push(language === 'zh' ? '部分页面未能采集；已保留可用来源与建议问题。' : 'Some requested pages could not be collected. Available sources and suggestions have been retained.');
  return result;
}
