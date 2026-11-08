import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { researchWebsite } from './onboarding.js';
import { Store } from './storage.js';
import type { ClaimSource } from './types.js';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
function field(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}需要 1–${max} 字文本`);
  return value.trim();
}

/** Local source intake never sends brand documents to an observation model. */
export class BrandSourceService {
  constructor(private store: Store, private research = researchWebsite) {}
  async add(projectId: string, input: Record<string, unknown>) {
    if (!await this.store.get('projects', projectId)) throw new Error('项目不存在');
    const importedAt = new Date().toISOString();
    let sources: ClaimSource[];
    if (input.kind === 'website') {
      const result = await this.research({ url: field(input.url, '网址', 2048) });
      if (!result.sources.length) throw new Error('没有取得可读官网正文，请检查网址或改为粘贴原文');
      sources = result.sources.map(source => ({ ...source, id: `brand-web-${hash(source.url + source.text).slice(0, 24)}`,
        kind: 'website', sha256: hash(source.text), importedAt }));
    } else if (input.kind === 'pdf') {
      const fileName = field(input.fileName, '文件名', 200).split(/[\\/]/).pop()!;
      const base64 = field(input.base64, 'PDF', 1_400_000);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('PDF 编码无效');
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length > 1_000_000 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('请选择不超过 1MB 的 PDF');
      const sha256 = hash(bytes);
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
        useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
      try {
        const document = await task.promise;
        if (document.numPages > 40) throw new Error('PDF 超过 40 页，请按产品或章节拆分');
        sources = [];
        let total = 0;
        for (let page = 1; page <= document.numPages; page++) {
          const content = await (await document.getPage(page)).getTextContent();
          const text = content.items.map(item => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('').trim();
          total += text.length;
          if (total > 100_000) throw new Error('PDF 正文超过 10 万字，请拆分后导入');
          if (text) sources.push({ id: `brand-pdf-${sha256.slice(0, 24)}-${page}`, title: `${fileName} · 第 ${page} 页`,
            text, kind: 'pdf', sha256, importedAt, page, fileName });
        }
        if (!sources.length) throw new Error('PDF 没有可提取文字，扫描件 OCR 未实现，请粘贴并核对原文');
      } finally { await task.destroy(); }
      const directory = join(this.store.root, 'brand-documents');
      await mkdir(directory, { recursive: true });
      const localPath = join(directory, `${sha256}.pdf`);
      await writeFile(localPath, bytes, { mode: 0o600, flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      sources.forEach(source => { source.localPath = localPath; });
    } else if (input.kind === 'text') {
      const title = field(input.title, '资料标题', 200), text = field(input.text, '资料正文', 100_000);
      const sha256 = hash(text);
      sources = [{ id: `brand-text-${sha256.slice(0, 24)}`, title, text, kind: 'text', sha256, importedAt }];
    } else throw new Error('资料类型应为 website、text 或 pdf');
    return this.store.updateProject(projectId, project => {
      const added = sources.filter(source => !project.sources.some(existing => existing.id === source.id));
      if (project.sources.length + added.length > 300) throw new Error('来源超过 300 项，请拆分项目');
      project.sources.push(...added);
      return { added: added.length, sourceIds: sources.map(source => source.id), warnings: ['来源陈述未经独立核验，请录入原文事实并逐项审核。PDF 空白页未入库；扫描页和表格语义需要人工核对。'] };
    });
  }

  async addClaim(projectId: string, input: Record<string, unknown>) {
    const sourceId = field(input.sourceId, '来源', 100), label = field(input.label, '事实名称', 120);
    const value = field(input.value, '原文事实', 2000);
    return this.store.updateProject(projectId, project => {
      const source = project.sources.find(item => item.id === sourceId);
      if (!source || !normalize(source.text).includes(normalize(value))) throw new Error('事实必须是所选来源的原文片段，请核对页码和文字');
      const id = `brand-claim-${hash(sourceId + label + value).slice(0, 24)}`;
      if (!project.claims.some(claim => claim.id === id)) {
        if (project.claims.length >= 500) throw new Error('事实超过 500 项，请拆分项目');
        project.claims.push({ id, label, value, quote: value, status: 'unconfirmed', sourceIds: [sourceId] });
      }
      return { claimId: id };
    });
  }
}
