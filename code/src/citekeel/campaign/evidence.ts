import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { load } from 'cheerio';
import { fetchPublicWebText, validatePublicWebUrl } from '../../../vendor/niubigeo/src/utils/public-web-fetch.js';
import type { SourceRecord, SourceRequest } from './model.js';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
export function localFile(root: string, file: string): string {
  const path = resolve(root, file), rel = relative(resolve(root), path);
  if (isAbsolute(file) || rel.startsWith('..') || isAbsolute(rel) || !rel) throw new Error('证据路径必须位于案例目录内');
  return path;
}
export async function readEvidence(root: string, file: string): Promise<Buffer> {
  const path = await realpath(localFile(root, file)), base = await realpath(root);
  const rel = relative(base, path);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('证据符号链接离开案例目录');
  return readFile(path);
}
export function publicUrl(value: string): string {
  const url = validatePublicWebUrl(value);
  if ([...url.searchParams.keys()].some(key => /token|secret|password|authorization|api.?key/i.test(key))) throw new Error('来源 URL 不得携带凭据');
  return url.href;
}
export function readableText(raw: string, contentType: string): string {
  if (!/html/i.test(contentType)) return raw;
  const $ = load(raw);
  $('script,style,noscript,nav,header,footer,form').remove();
  const main = $('main,article,[role="main"]').first();
  return compact((main.text().trim() ? main : $('body')).text());
}
type Page = { url: string; text: string; contentType: string } | null;
/** Only explicit source URLs; no cookies, forms, browser profiles, model calls or broad crawling. */
export async function collectSources(root: string, requests: SourceRequest[], fetchPage: (url: string) => Promise<Page> = fetchPublicWebText): Promise<SourceRecord[]> {
  const records: SourceRecord[] = [];
  for (const request of requests) {
    if (!/^[a-zA-Z0-9_-]+$/.test(request.id)) throw new Error('来源 ID 无效');
    const record: SourceRecord = { ...request, status: 'failed', retrievedAt: new Date().toISOString(), captureMethod: 'http', coverage: 'page-text' };
    try {
      const page = await fetchPage(publicUrl(request.url));
      if (!page) throw new Error('公开页面未返回可读内容');
      publicUrl(page.url);
      if (!/(?:text\/html|text\/plain|xhtml)/i.test(page.contentType)) throw new Error('仅接受公开 HTML 或纯文本');
      const text = readableText(page.text, page.contentType);
      if (text.trim().length < 40) throw new Error('公开页面正文不足，保留失败状态');
      const textFile = `sources/${request.id}-${digest(text).slice(0, 16)}.txt`;
      const path = localFile(root, textFile);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text, { mode: 0o600, flag: 'wx' }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
      Object.assign(record, { status: 'collected', finalUrl: page.url, contentType: page.contentType, textFile, sha256: digest(text) });
    } catch (error) {
      // The error may contain transport details. Do not persist raw headers or exception dumps.
      record.error = error instanceof Error && /仅接受|正文不足|未返回|凭据|public HTTP/.test(error.message) ? error.message : '来源读取失败；未使用登录态或替代来源';
    }
    records.push(record);
  }
  return records;
}
