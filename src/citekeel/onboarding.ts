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
  market: 'international';
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
  /** A caller may shorten, but cannot increase, the 25-second overall budget. */
  timeoutMs?: number;
}

const stableId = (kind: string, value: string) => `${kind}-${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
const compact = (value: string) => value.replace(/\s+/g, ' ').trim();

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

/** Local, source-derived preparation. No model calls, search-volume estimates, or inferred competitors. */
export async function researchWebsite(
  input: { url: string; language?: string; country?: string },
  options: WebsiteResearchOptions = {},
): Promise<WebsiteResearch> {
  const submitted = entryUrl(input.url);
  const language = (input.language || 'en').trim();
  const country = (input.country || 'US').trim().toUpperCase();
  if (!/^en(?:-[A-Za-z]{2})?$/.test(language)) throw new Error('The international MVP currently supports English research and prompt templates only.');
  if (!/^[A-Z]{2}$/.test(country) || country === 'CN') throw new Error('Select a two-letter international market country; China is outside this MVP.');
  const timeoutMs = options.timeoutMs ?? 25_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Research timeout must be positive.');
  const deadline = Date.now() + Math.min(timeoutMs, 25_000);
  const fetchPage = options.fetchPage || fetchPublicWebText;
  const result: WebsiteResearch = {
    id: `research-${randomUUID()}`, status: 'failed', submittedUrl: submitted.href,
    domain: normalizeDomain(submitted.href), language, country, market: 'international',
    methodology: 'source-derived-templates/v1', profile: null,
    sources: [], claims: [], topics: [], prompts: [], competitors: [], attempts: [],
    warnings: [
      'Website statements are source evidence, not independently verified brand facts.',
      'Suggested prompts use English templates grounded in collected pages; no LLM research or search-volume measurement was performed.',
      'Competitor discovery requires additional research; no competitors are inferred from the domain.',
    ], createdAt: new Date().toISOString(),
  };
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
      const finalUrl = validatePublicWebUrl(page.url);
      if (normalizeDomain(finalUrl.href) !== result.domain) throw new Error('Redirect left the submitted website.');
      finalUrl.hash = '';
      const html = page.text.slice(0, 260_000);
      const parsed = extractSiteEvidencePage({ url: finalUrl.href, html });
      if (!compact(parsed.textSnippet || parsed.description || parsed.title || '')) throw new Error('Empty website evidence.');
      const sourceId = stableId('source', finalUrl.href);
      if (!result.sources.some(source => source.id === sourceId)) {
        result.sources.push({ id: sourceId, title: parsed.title || finalUrl.hostname, url: finalUrl.href, text: compact(parsed.textSnippet || parsed.description || parsed.title || '').slice(0, 10_000) });
        if (index === 0) {
          const document = load(html);
          const siteName = document('meta[property="og:site_name"]').first().attr('content');
          const titleBrand = (parsed.title || '').split(/\s+[|–—-]\s+|\s*\|\s*/)[0];
          const brand = compact(siteName || titleBrand || parsed.headings?.[0] || '').slice(0, 100);
          const description = compact(parsed.description || parsed.ogDescription || parsed.jsonLdDescriptions?.[0] || '').slice(0, 1000);
          if (brand) result.profile = { brand, description };
          if (brand) result.claims.push({ id: stableId('claim', `${sourceId}:brand`), label: 'Website brand label', value: brand, status: 'unconfirmed', sourceIds: [sourceId] });
          if (description) result.claims.push({ id: stableId('claim', `${sourceId}:description`), label: 'Website description', value: description, status: 'unconfirmed', sourceIds: [sourceId] });
          const links = extractSameDomainLinks(html, finalUrl.href, result.domain).filter(link => {
            try { validatePublicWebUrl(link); return true; } catch { return false; }
          });
          queue.push(...links.slice(0, 2));
        }
        for (const heading of parsed.headings || []) {
          const name = compact(heading);
          if (name.length < 5 || name.length > 120 || /^(get started|contact us|sign up|log in|learn more|welcome|home)$/i.test(name)) continue;
          const id = stableId('topic', name.toLowerCase());
          const existing = result.topics.find(topic => topic.id === id);
          if (existing && !existing.sourceIds.includes(sourceId)) existing.sourceIds.push(sourceId);
          else if (!existing && result.topics.length < 4) result.topics.push({ id, name, sourceIds: [sourceId], origin: 'source-derived' });
        }
      }
      result.attempts.push({ url, status: 'completed' });
    } catch {
      // A transport may include sensitive response details in its error. Persist only a safe summary.
      result.attempts.push({ url, status: 'failed', reason: Date.now() >= deadline ? 'Research time budget exhausted.' : 'Could not obtain usable public HTML evidence.' });
      if (Date.now() >= deadline) break;
    }
  }
  if (!result.sources.length || !result.profile) {
    result.status = 'failed';
    result.warnings.push('No usable homepage brand profile was obtained. No diagnostic answers or metrics were created.');
    return result;
  }
  const homeSource = result.sources[0]!;
  if (!result.topics.length) result.topics.push({ id: stableId('topic', `${result.domain}:brand-evaluation`), name: 'Brand evaluation', sourceIds: [homeSource.id], origin: 'template' });
  const addPrompt = (text: string, intent: string, branded: boolean, topic: WebsiteResearch['topics'][number]) => {
    result.prompts.push({ id: stableId('prompt', `${result.domain}:${language}:${country}:${text}`), text, intent, branded, status: 'suggested', topicId: topic.id, sourceIds: [...topic.sourceIds], origin: 'template' });
  };
  addPrompt(`What does ${result.profile.brand} offer, and who is it for?`, 'brand_awareness', true, result.topics[0]!);
  addPrompt(`What should a buyer verify before choosing ${result.profile.brand}?`, 'commercial', true, result.topics[0]!);
  for (const topic of result.topics.filter(topic => topic.origin === 'source-derived')) {
    const mentionsBrand = topic.name.toLowerCase().includes(result.profile.brand.toLowerCase());
    addPrompt(`What should teams consider when evaluating solutions for ${topic.name}?`, 'informational', mentionsBrand, topic);
  }
  result.status = result.attempts.some(attempt => attempt.status === 'failed') || !result.profile.description ? 'partial' : 'completed';
  if (!result.profile.description) result.warnings.push('The homepage did not expose a usable description; it was left blank.');
  if (result.attempts.some(attempt => attempt.status === 'failed')) result.warnings.push('Some requested pages could not be collected. Available sources and suggestions have been retained.');
  return result;
}
