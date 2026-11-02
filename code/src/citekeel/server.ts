import { PromptService, WorkspaceError } from './prompts.js';
import { RecordingService } from './recordings.js';
import { createBrowserCollector, type BrowserEngine } from './browser/collector.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadDotEnv, hasProviderKey, resolveProviderKey } from '../../vendor/niubigeo/src/config/env.js';
import { loadCases } from './cases.js';
import { Store } from './storage.js';
import { ResearchService } from './research-service.js';
import { researchWebsite } from './onboarding.js';
import { enrichWebsiteResearch } from './semantic-research.js';
import { createRun, executeRun } from './engine.js';
import { validateImport } from './analysis.js';
import { exportRun, reportMarkdown } from './report.js';
import { SKILLS, type AgentRun, type LiveConfig, type Project, type Query } from './types.js';

const PROVIDERS = ['openrouter', 'openai', 'deepseek', 'perplexity', 'gemini', 'anthropic'];
async function body(req: IncomingMessage): Promise<any> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length; if (size > 2_000_000) throw new Error('输入超过 2MB 限制'); chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new Error('输入不是有效 JSON'); }
}
function textField(value: unknown, label: string, max: number, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}需要 ${max} 字以内的文本`);
  return value.trim();
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function projectSummary(p: Project) { return { id: p.id, name: p.name, brand: p.brand, origin: p.origin, domain: p.domain, description: p.description, sampleCount: p.samples.length, queryCount: p.queries.length }; }
export async function createApp(store = new Store(), options: { research?: typeof researchWebsite; enrich?: typeof enrichWebsiteResearch } = {}) {
  await store.initialize(await loadCases());
  const research = new ResearchService(store, options.research, options.enrich); await research.initialize();
  const prompts = new PromptService(store);
  const recordings = new RecordingService(store);
  let activeRunId: string | null = null;
  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      const hostName = host.split(':')[0];
      if (!['127.0.0.1', 'localhost'].includes(hostName)) return send(res, 403, { error: '本地工作台仅接受 localhost 或 127.0.0.1' });
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return send(res, 403, { error: '请求来源与本地工作台不一致' });
      const url = new URL(req.url || '/', `http://${host}`), path = url.pathname;
      const method = req.method || 'GET';
      if (method === 'GET' && ['/', '/app.js', '/style.css', '/create-workspace', '/onboarding.js', '/onboarding.css', '/workspace', '/workspace.js', '/workspace.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path === '/create-workspace' ? 'onboarding.html' : path === '/workspace' ? 'workspace.html' : path.slice(1);
        const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
        res.writeHead(200, { 'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'" });
        return res.end(await readFile(join(process.cwd(), 'public', file)));
      }
      if (path === '/api/researches' && method === 'POST') return send(res, 202, await research.start(await body(req)));
      const researchMatch = path.match(/^\/api\/researches\/([a-zA-Z0-9_-]+)(?:\/(accept))?$/);
      if (researchMatch) {
        if (method === 'GET' && !researchMatch[2]) {
          const job = await research.get(researchMatch[1]);
          return send(res, job ? 200 : 404, job || { error: 'Research not found.' });
        }
        if (method === 'POST' && researchMatch[2] === 'accept') {
          const input = await body(req);
          return send(res, 200, await research.accept(researchMatch[1], input.selectedPromptIds));
        }
        return send(res, 405, { error: 'Unsupported research operation.' });
      }
      if (path === '/api/status' && method === 'GET') return send(res, 200, { name: 'CiteKeel', version: '0.1.0', upstream: 'niubigeo v0.3.2', skills: SKILLS,
        providers: PROVIDERS.map(id => ({ id, configured: hasProviderKey(id) })), activeRunCount: (await store.list<AgentRun>('runs')).filter(r => r.status === 'running').length });
      if (path === '/api/projects' && method === 'GET') return send(res, 200, (await store.list<Project>('projects')).map(projectSummary));
      if (path === '/api/projects' && method === 'POST') {
        const input = await body(req), brand = textField(input.brand, '品牌', 80), industry = textField(input.industry, '行业', 100);
        if (!brand || !industry) throw new Error('请填写品牌和行业');
        const brief = textField(input.brief, '资料', 12000);
        const now = new Date().toISOString();
        const strings = [`${brand}是做什么的？`, `${industry}供应商怎么选？`, `${industry}选型时需要核对哪些参数？`, `${industry}供应商的资质与交付能力怎样核验？`];
        const project: Project = { id: `project-${randomUUID()}`, name: brand, brand,
          aliases: textField(input.aliases, '别名', 300).split(/[,，\n]/).map(x => x.trim()).filter(Boolean),
          industry, domain: textField(input.domain, '域名', 200), description: '用户在本地创建的项目', origin: 'manual',
          goal: `诊断${brand}在${industry}选型问题中的表现，并生成有证据的行动任务。`,
          sources: [{ id: 'user-brief', title: '用户输入资料', text: brief }],
          claims: brief.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40).map((line, i) => {
            const [label, ...rest] = line.split(/[:：]/);
            return { id: `claim-${i + 1}`, label: rest.length ? label.slice(0, 80) : `资料项 ${i + 1}`, value: rest.length ? rest.join('：') : line, status: 'unconfirmed', sourceIds: ['user-brief'] };
          }), queries: strings.map((text, i) => ({ id: `q-${i + 1}`, text, intent: i === 0 ? '品牌核验' : '供应商发现', branded: i === 0, origin: '本地模板，待用户选择' })),
          queryVersion: 1, samples: [], createdAt: now, updatedAt: now };
        await store.save('projects', project); return send(res, 201, project);
      }
      const recordingMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/recordings(?:\/([a-zA-Z0-9_-]+))?(?:\/(collect))?$/);
      if (recordingMatch) {
        const [, id, rid, action] = recordingMatch;
        if (method === 'GET' && !rid) return send(res, 200, { recordings: await recordings.list(id) });
        if (method === 'POST' && !rid) return send(res, 201, await recordings.add(id, await body(req)));
        if (method === 'POST' && rid === 'prompts') return send(res, 200, await recordings.proposePrompts(id, (await body(req)).ids));
        if (method === 'DELETE' && rid && !action) return send(res, 200, await recordings.remove(id, rid));
        if (method === 'POST' && rid && action === 'collect') return send(res, 200, await recordings.collect(id, rid));
        return send(res, 405, { error: 'Unsupported recording operation.' });
      }
      const promptMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/(prompts|topics|table-settings)(?:\/([a-zA-Z0-9_-]+))?$/);
      if (promptMatch) {
        const [, id, resource, item] = promptMatch;
        if (resource === 'prompts' && method === 'GET' && !item) return send(res, 200, await prompts.list(id, {status:url.searchParams.get('status')||undefined,search:url.searchParams.get('search')||undefined,topicId:url.searchParams.get('topicId')||undefined,page:Number(url.searchParams.get('page')),pageSize:Number(url.searchParams.get('pageSize'))}));
        if (resource === 'table-settings' && method === 'GET') return send(res,200,await prompts.settings(id));
        const input=await body(req);
        if (resource === 'prompts' && method === 'POST' && !item) return send(res,201,await prompts.add(id,input));
        if (resource === 'prompts' && method === 'POST' && item === 'batch') return send(res,200,await prompts.batch(id,input));
        if (resource === 'prompts' && method === 'PATCH' && item) return send(res,200,await prompts.edit(id,item,input));
        if (resource === 'topics' && method === 'POST') return send(res,201,await prompts.addTopic(id,input));
        if (resource === 'table-settings' && method === 'PUT') return send(res,200,await prompts.settings(id,input));
        return send(res,405,{error:'Unsupported prompt operation.'});
      }
      const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)(?:\/(claims|queries|samples|observations))?$/);
      if (projectMatch) {
        const project = await store.get<Project>('projects', projectMatch[1]); if (!project) return send(res, 404, { error: '项目不存在' });
        const action = projectMatch[2];
        if (method === 'GET' && !action) return send(res, 200, project);
        if (method === 'GET' && action === 'observations') {
          const runs = (await store.list<AgentRun>('runs')).filter(r => r.projectId === project.id);
          const observations = [...project.samples, ...runs.flatMap(r => r.samples)];
          const unique = new Map<string, typeof observations[number]>();
          for (const sample of observations) {
            const key = `${sample.origin}:${sample.runGroup}:${sample.id}`;
            if (!unique.has(key)) unique.set(key, sample);
          }
          const rows = [...unique.values()].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
          return send(res, 200, { observations: rows, runs: runs.map(r => ({ id: r.id, createdAt: r.createdAt, status: r.status })),
            excluded: rows.filter(s => s.collectionStatus !== 'completed' || s.analysisStatus !== 'completed' || !s.answer.trim()).length });
        }
        const input = await body(req);
        if (method === 'POST' && action === 'claims') {
          const claim = project.claims.find(c => c.id === input.claimId);
          if (!claim) throw new Error('事实不存在');
          if (!project.sources.some(s => s.id === input.sourceId)) throw new Error('需要选择存在的资料来源');
          if (claim.status === 'conflict') {
            const option = claim.alternatives?.find(a => a.sourceId === input.sourceId);
            if (!option) throw new Error('需要选择一个事实口径'); claim.value = option.value;
          }
          claim.status = 'confirmed'; claim.confirmation = { sourceId: input.sourceId, at: new Date().toISOString() };
        } else if (method === 'PUT' && action === 'queries') {
          if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 40) throw new Error('问题集需要 1–40 条问题');
          const questions: string[] = input.questions.map((s: unknown) => textField(s, '问题', 800)).filter(Boolean);
          project.queries = [...new Set<string>(questions)].map((text, i): Query => ({
            ...project.queries.find(q => q.text === text),
            id: project.queries.find(q => q.text === text)?.id || `q-v${project.queryVersion + 1}-${i + 1}`, text,
            intent: project.queries.find(q => q.text === text)?.intent || '用户问题', branded: [project.brand, ...project.aliases].some(a => a && text.toLowerCase().includes(a.toLowerCase())), origin: '用户确认的问题集',
          })); project.queryVersion += 1;
        } else if (method === 'POST' && action === 'samples') {
          const imported = validateImport(input.samples);
          let added = false;
          for (const sample of imported) {
            sample.branded = [project.brand, ...project.aliases].some(a => a && sample.question.toLowerCase().includes(a.toLowerCase()));
            let query = project.queries.find(q => q.text === sample.question);
            if (!query) {
              query = { id: `q-${randomUUID()}`, text: sample.question, intent: sample.intent, branded: sample.branded, origin: 'Imported answer', status: 'active' };
              project.queries.push(query); added = true;
            }
            sample.queryId = query.id;
          }
          project.samples.push(...imported);
          if (added) project.queryVersion += 1;
          project.origin = 'manual';
        } else return send(res, 405, { error: '不支持的项目操作' });
        project.updatedAt = new Date().toISOString(); await store.save('projects', project); return send(res, 200, project);
      }
      if (path === '/api/runs' && method === 'GET') {
        const runs = (await store.list<AgentRun>('runs')).filter(r => !url.searchParams.get('projectId') || r.projectId === url.searchParams.get('projectId'));
        return send(res, 200, runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map(r => ({ id: r.id, projectId: r.projectId, createdAt: r.createdAt, status: r.status, mode: r.mode, goal: r.goal, sampleCount: r.samples.length })));
      }
      if (path === '/api/runs' && method === 'POST') {
        if ((await store.list<AgentRun>('runs')).some(r => ['queued', 'running'].includes(r.status))) return send(res, 409, { error: '当前有一轮执行中，请等待完成' });
        const input = await body(req), project = await store.get<Project>('projects', String(input.projectId || ''));
        if (!project) throw new Error('请选择项目');
        const mode = input.mode === 'live' ? 'live' : 'replay'; let config: LiveConfig | undefined;
        const channel = input.channel === 'browser' ? 'browser' : 'api';
        let browserEngine: BrowserEngine | undefined;
        if (mode === 'live') {
          const maxQuestions = channel === 'browser' ? Math.min(3, Math.max(1, Number(input.maxQuestions) || 2)) : Math.min(5, Math.max(1, Number(input.maxQuestions) || 3));
          if (Array.isArray(input.queryIds)) {
            if (!input.queryIds.length || input.queryIds.length > maxQuestions || new Set(input.queryIds).size !== input.queryIds.length) throw new WorkspaceError(channel === 'browser' ? 'Select 1–3 distinct active prompts for a browser run.' : 'Select 1–5 distinct active prompts.');
            const selected: Query[] = input.queryIds.map((id: unknown) => {
              const query = project.queries.find(q => q.id === id);
              if (!query || (query.status && query.status !== 'active')) throw new WorkspaceError('Only active prompts can be collected.');
              return query;
            });
            project.queries = selected;
          } else if (Array.isArray(input.questions)) {
            project.queries = input.questions.slice(0, maxQuestions).map((s: unknown, i: number): Query => {
              const text = textField(s, '问题', 800); if (!text) throw new Error('采样问题不能为空');
              const known = project.queries.find(q => q.text === text);
              if (known?.status && known.status !== 'active') throw new WorkspaceError('Track a suggested or inactive prompt before collection.');
              return known || { id: `adhoc-${randomUUID()}`, text, intent: '用户确认的 API 采样问题', branded: [project.brand, ...project.aliases].some(a => a && text.toLowerCase().includes(a.toLowerCase())), origin: '本轮确认' };
            });
          }
          if (channel === 'api') {
            const provider = textField(input.provider, 'Provider', 30, 'openrouter');
            if (!PROVIDERS.includes(provider)) throw new Error('不支持这个 Provider');
            const model = textField(input.model, '模型', 200); if (!model) throw new Error('请填写当前账号可用的模型 ID');
            const apiKey = textField(input.apiKey, 'API Key', 2000) || resolveProviderKey(provider);
            config = { provider, model, apiKey, maxQuestions, webSearch: input.webSearch === true };
          } else {
            browserEngine = input.engine === 'perplexity' ? 'perplexity' : 'chatgpt';
          }
        }
        if (activeRunId) return send(res, 409, { error: '当前有一轮执行中，请等待完成' });
        const run = createRun(project, mode, textField(input.goal, '目标', 2000, project.goal) || project.goal, config);
        activeRunId = run.id;
        try { await store.save('runs', run); } catch (error) { activeRunId = null; throw error; }
        void (async () => {
          let collector: Awaited<ReturnType<typeof createBrowserCollector>> | undefined;
          try {
            if (browserEngine) collector = await createBrowserCollector(browserEngine);
            await executeRun(run, store, config, collector ? { ask: collector.ask, engine: collector.engine } : undefined);
          } catch (error) {
            run.status = 'failed'; run.error = error instanceof Error ? error.message : '执行异常，已有证据已保留'; await store.save('runs', run);
          } finally {
            await collector?.close().catch(() => {}); activeRunId = null;
          }
        })();
        return send(res, 202, { id: run.id });
      }
      const runMatch = path.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)(?:\/(report|export|actions|draft|publications))?$/);
      if (runMatch) {
        const run = await store.get<AgentRun>('runs', runMatch[1]); if (!run) return send(res, 404, { error: '运行不存在' });
        const action = runMatch[2];
        if (method === 'GET' && !action) return send(res, 200, run);
        if (method === 'GET' && action === 'export') return send(res, 200, exportRun(run));
        if (method === 'GET' && action === 'report') {
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="citekeel-${run.id}.md"` }); return res.end(reportMarkdown(run));
        }
        if (['queued', 'running'].includes(run.status)) return send(res, 409, { error: '运行结束后才能修改交付记录' });
        const input = await body(req);
        if (method === 'PATCH' && action === 'actions') {
          const item = run.actions.find(a => a.id === input.id); if (!item || !['proposed', 'in_progress', 'done'].includes(input.status)) throw new Error('任务或状态无效'); item.status = input.status;
        } else if (method === 'PATCH' && action === 'draft') {
          if (!run.draft || run.draft.status === 'blocked') throw new Error('请先解决事实阻塞并重新运行');
          run.draft.markdown = textField(input.markdown, '草稿', 50000, run.draft.markdown);
          run.draft.status = input.reviewed === true ? 'reviewed' : 'draft';
        } else if (method === 'POST' && action === 'publications') {
          if (run.draft?.status !== 'reviewed') throw new Error('请先审核内容');
          const parsed = new URL(textField(input.url, '发布 URL', 2000));
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('发布链接仅支持 http 或 https');
          run.publications.push({ id: randomUUID(), url: parsed.toString(), recordedAt: new Date().toISOString(), note: textField(input.note, '说明', 1000), state: 'recorded_not_verified' });
        } else return send(res, 405, { error: '不支持的运行操作' });
        await store.save('runs', run); return send(res, 200, run);
      }
      return send(res, 404, { error: '没有这个页面或接口' });
    } catch (error) { send(res, error instanceof WorkspaceError ? error.status : 400, { error: error instanceof Error ? error.message : '请求失败', ...(error instanceof WorkspaceError ? {code:error.code} : {}) }); }
  });
  return { server, store };
}

if (process.argv[1]?.endsWith('/server.ts') || process.argv[1]?.endsWith('/server.js')) {
  loadDotEnv(); const port = Number(process.env.CITEKEEL_PORT || 8847);
  const { server } = await createApp();
  server.listen(port, '127.0.0.1', () => console.log(`CiteKeel 引舟: http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}
