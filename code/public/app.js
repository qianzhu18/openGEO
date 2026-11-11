import { navIcon } from './ui-icons.js';
import { actionCenter, diagnosticView, analysisQuery, executionPanel } from './analytics-view.js';
import { brandSourceForm } from './brand-sources.js';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? esc(u.toString()) : '#'; } catch { return '#'; } };
const state = { actionCategory: 'all', actionStatus: 'proposed', actionPriority: 'all', projects: [], project: null, spaceId: null, run: null, history: [], view: 'overview', selectedSample: '', filter: '', status: null, polling: false, apiKeys: {}, modelFilter: 'all', rangeFilter: 'all', chartMetric: 'visibility', collapsed: false, analytics: null, analysisFilters: {}, sourceLevel: 'domain' };
let runSelection = 0, projectSelection = 0;
let showExamples = localStorage.getItem('opengeo-show-examples') === 'true';
const NAV = [['overview', '工作概览'], ['queries', '问题空间'], ['evidence', '回答与信源'], ['sources', '信源分析'], ['actions', '策略任务'], ['content', '内容与交付'], ['facts', '品牌事实'], ['flow', 'Agent 思路与历史']];
const LABELS = { queued: '等待执行', running: '执行中', completed: '已完成', needs_review: '待处理', failed: '执行失败', interrupted: '已中断', pending: '待执行', blocked: '等待确认', confirmed: '已确认', unconfirmed: '待确认', conflict: '口径冲突', draft: '草稿', reviewed: '已审核' };
const ORIGINS = { synthetic: '合成案例', archive: '历史归档', manual: '人工资料', api: 'API 实测' };
const EXECUTORS = { rules: '本地规则', archive: '数据回放', llm: '模型调用' };
const fmtTime = value => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未运行';
const pct = metric => !metric || metric.value === null ? '无数据' : `${(metric.value * 100).toFixed(1)}%`;
const badge = (label, type = '') => `<span class="badge ${esc(type)}">${esc(label)}</span>`;
const statusBadge = status => badge(LABELS[status] || status, ['confirmed', 'completed', 'reviewed'].includes(status) ? 'ok' : ['conflict', 'blocked', 'needs_review', 'unconfirmed'].includes(status) ? 'warn' : status === 'failed' ? 'bad' : '');
const running = () => state.run && ['queued', 'running'].includes(state.run.status);
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '请求失败'); return data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
async function refreshProjects() { state.projects = await api('/api/projects'); }
async function selectProject(id) {
  const selection = ++projectSelection; ++runSelection;
  state.project = null; state.run = null; state.history = []; state.analytics = null;
  $('#app').innerHTML = '<div class="boot">正在读取项目…</div>';
  const [project, history] = await Promise.all([api(`/api/projects/${id}`), api(`/api/runs?projectId=${encodeURIComponent(id)}`)]);
  const params = new URLSearchParams(location.search), sameProject = params.get('project') === id;
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(`opengeo-space-${id}`) || '{}'); } catch {}
  const requestedSpace = sameProject ? params.get('space') || saved.spaceId : saved.spaceId;
  const spaceId = project.diagnosisSpaces?.some(s=>s.id===requestedSpace) ? requestedSpace : null;
  const requestedRun = sameProject ? params.get('run') || saved.runId : saved.runId;
  const choices = history.filter(r => !spaceId || r.spaceId === spaceId);
  const summary = choices.find(r=>r.id===requestedRun) || choices.find(r=>['queued','running'].includes(r.status)) || choices[0];
  const run = summary ? await api(`/api/runs/${summary.id}?projectId=${encodeURIComponent(id)}`) : null;
  if (selection !== projectSelection) return;
  state.project = project; state.history = history; state.run = run; state.spaceId = spaceId || run?.spaceId || null;
  state.selectedSample = ''; state.filter = ''; state.modelFilter = 'all'; state.rangeFilter = 'all'; state.analysisFilters = {};
  state.analytics = run?.analytics || (state.spaceId ? null : project.analytics);
  rememberSpace();
  localStorage.setItem('citekeel-project', id); render(); if (running()) pollRun(state.run.id);
}
function rememberSpace() {
  if (!state.project) return;
  const url = new URL(location.href); url.searchParams.set('project',state.project.id);
  for (const [key,value] of Object.entries({space:state.spaceId,run:state.run?.id})) value ? url.searchParams.set(key,value) : url.searchParams.delete(key);
  window.history.replaceState(null,'',url);
  localStorage.setItem(`opengeo-space-${state.project.id}`,JSON.stringify({spaceId:state.spaceId,runId:state.run?.id}));
}
function spaceToolbar() {
  const spaces = state.project.diagnosisSpaces || [];
  if (!spaces.length && !state.history.length) return '';
  const runs = state.history.filter(r=>state.spaceId ? r.spaceId === state.spaceId : !r.spaceId);
  const space = spaces.find(s=>s.id===state.spaceId);
  return `<details class="space-context" ${!state.run || running() ? 'open' : ''}><summary>${esc(space?.name || '历史诊断')} · ${runs.length} 轮测试 <span>切换空间与记录</span></summary><div class="space-toolbar"><label>诊断空间<select data-space><option value="">历史运行（未归属空间）</option>${spaces.map(s=>`<option value="${esc(s.id)}" ${s.id===state.spaceId?'selected':''}>${esc(s.name)} · ${s.queries.length} 个问题</option>`).join('')}</select></label><label>空间内测试记录<select data-space-run><option value="">${runs.length?'选择测试记录':'尚未开始测试'}</option>${runs.map(r=>`<option value="${esc(r.id)}" ${r.id===state.run?.id?'selected':''}>${esc(fmtTime(r.createdAt))} · ${esc(LABELS[r.status]||r.status)}</option>`).join('')}</select></label>${space && !running()?'<button class="btn small" data-diagnosis>在此空间开始测试</button>':''}</div>${space?`<p class="space-saved">已保存：${esc(space.name)} · ${esc(fmtTime(space.updatedAt))} · ${space.targetIds.length} 个平台；问题快照与测试记录保留在本机。</p>`:''}</details>`;
}
function pageHeader(title, description = '', actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${esc(state.project.brand)} / GEO workspace</div><h1>${esc(title)}</h1>${description ? `<p class="subtle">${esc(description)}</p>` : ''}</div>${actions && !actions.includes('data-export') ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function downloadActions() {
  if (!state.run || running()) return '';
  const base = `/api/runs/${state.run.id}`, query = analysisQuery(state.analysisFilters);
  return `<a class="btn small" href="${base}/report${query}" download>业务简报 ↗</a><details class="export-menu"><summary class="btn small">导出与证据 <span aria-hidden="true">⌄</span></summary><div class="export-options"><a href="${base}/report-html${query}" download>简报 HTML</a><a href="${base}/report-evidence${query}" download>完整证据 MD</a><a href="${base}/report-evidence-html${query}" download>完整证据 HTML</a><button data-export>JSON 证据</button></div></details>`;
}
function originBanner() {
  const samples = state.run?.samples || state.project.samples;
  const apiArchive = state.run?.mode !== 'live' && samples.length > 0 && samples.every(s => s.origin === 'api');
  const mixedLive = state.run?.mode === 'live' && samples.some(s => s.origin === 'browser') && samples.some(s => s.origin === 'api');
  const origin = state.run?.mode === 'live' || apiArchive ? 'api' : state.project.origin;
  const note = apiArchive ? '回放 2026-10-29 保存的实际 API 回答，本次不发起模型调用。未联网基线与公开搜索结果分别解释。' : origin === 'synthetic' ? '资料和回答均为虚构样例，用来检验工作流；不代表真实客户或优化效果。' : origin === 'archive' ? '原始回答来自 niubigeo 于 2026-09-08 的公开测量。本次回放不会调用模型。' : origin === 'api' ? '这是新取得的 API 回答。模型、搜索和消费级网页的结果需要分别观察。' : '使用你在本地提供的品牌资料与原始回答。';
  const displayNote = mixedLive ? '本轮同时取得网页与 API 回答；通道、平台、模型和降级原因分开查看，不合并成同一种结果。' : note;
  return `<div class="source-banner">${badge(mixedLive ? '网页 + API' : apiArchive ? 'API 观察回放' : ORIGINS[origin], origin)}<p>${esc(displayNote)}</p></div>`;
}
function runBox() {
  return `<div class="goal-box"><label>本轮目标<textarea id="goal" rows="2" aria-label="本轮目标">${esc(state.run?.goal || state.project.goal)}</textarea></label><div class="actions"><button class="btn primary" data-diagnosis ${running() ? 'disabled' : ''}>${running() ? '执行中…' : '⇶ 运行品牌诊断'}</button><button class="btn quiet" data-run ${running() ? 'disabled' : ''}>仅回放</button></div></div>`;
}
function trace() {
  const steps = state.run?.steps || state.status.skills.map(([id, label, skill]) => ({ id, label, skill, status: 'pending', executor: 'rules', summary: '' }));
  return `<div class="panel"><div class="panel-head"><h2>Agent 执行轨迹</h2>${state.run ? statusBadge(state.run.status) : badge('尚未运行')}</div><div class="steps">${steps.map((step, i) => `<div class="step ${esc(step.status)}"><span class="step-mark">${step.status === 'completed' ? '✓' : i + 1}</span><div class="step-title">${esc(step.label)}<small>${esc(step.skill)}</small></div><p class="step-summary">${esc(step.summary || '等待本轮输入与前置步骤')}</p><span class="step-state">${esc(EXECUTORS[step.executor])}</span></div>`).join('')}</div></div>`;
}
function overview() {
  return `<h1 class="sr-only">把观察变成下一步行动</h1><div class="page-heading"><div><div class="eyebrow">${esc(state.project.brand)} / GEO analytics</div><h1>数据分析</h1><p class="subtle">从本轮覆盖、品牌表现与信源，回到每一条回答。</p></div></div>` + (running() ? '' : diagnosticView(state.spaceId && !state.run ? null : state.analytics, { runs: state.history.filter(r=>state.spaceId ? r.spaceId===state.spaceId : !r.spaceId), chart: state.chartMetric, sourceLevel: state.sourceLevel, diagnosis: state.analytics?.diagnosis || state.run?.diagnosis })) + `<details class="run-controls" ${!state.run ? 'open' : ''}><summary>运行工作流</summary>${runBox()}</details>`;
}
function sourcesPage() { return pageHeader('信源分析', '域名与 URL 分层，保留来源类型与原文入口。') + diagnosticView(state.analytics, { runs: state.history.filter(r=>state.spaceId ? r.spaceId===state.spaceId : !r.spaceId), sourceLevel: state.sourceLevel, sourcesOnly: true }); }
async function refreshAnalysis() {
  if (!state.project) return;
  if (state.spaceId && !state.run) { state.analytics=null; return; }
  if (!state.run) {
    const projectId = state.project.id, selection = projectSelection, query = analysisQuery(state.analysisFilters);
    const result = await api(`/api/projects/${projectId}/analytics${query}`);
    if (state.project?.id === projectId && selection === projectSelection && !state.run && query === analysisQuery(state.analysisFilters)) state.analytics = result;
    return;
  }
  const id = state.run.id, projectId = state.project.id, selection = projectSelection, query = analysisQuery(state.analysisFilters);
  const result = await api(`/api/runs/${id}/analytics${query}`);
  if (state.project?.id === projectId && selection === projectSelection && state.run?.id === id && query === analysisQuery(state.analysisFilters)) state.analytics = result;
}
function factsPage() {
  return pageHeader('品牌事实与来源', '确认可用于内容的事实。每次确认保存来源与时间，历史运行快照保持原样。', `<button class="btn primary" data-run ${running() ? 'disabled' : ''}>重新运行</button>`) + originBanner() + brandSourceForm(state.project) +
    `<div class="panel"><div class="panel-head"><h2>事实清单</h2>${badge(`${state.project.claims.length} 项`)}</div><div class="claim-list">${state.project.claims.length ? state.project.claims.map(claim => `<div class="claim-row" id="${esc(claim.id)}"><div class="claim-label">${esc(claim.label)}</div><div><p class="claim-value">${esc(claim.value)}</p><p class="claim-sources">${claim.sourceIds.map(id => esc(state.project.sources.find(s => s.id === id)?.title || id)).join(' · ')}</p>${claim.status === 'conflict' ? `<div class="claim-options">${(claim.alternatives || []).map(option => `<button class="btn small" data-confirm="${esc(claim.id)}" data-source="${esc(option.sourceId)}">采用：${esc(option.value)}</button>`).join('')}</div>` : claim.status === 'unconfirmed' ? `<div class="claim-options"><button class="btn small" data-confirm="${esc(claim.id)}" data-source="${esc(claim.sourceIds[0])}">我已核对，确认此项</button></div>` : claim.confirmation ? `<p class="claim-sources">本地确认于 ${esc(fmtTime(claim.confirmation.at))}</p>` : ''}</div>${statusBadge(claim.status)}</div>`).join('') : `<div class="empty">创建项目时按“参数：内容”逐行输入品牌资料，可在这里逐项确认。</div>`}</div></div><div class="panel section-gap"><div class="panel-head"><h2>原始资料</h2></div>${state.project.sources.map(source => `<div class="source-document"><h3>${esc(source.title)}</h3><p>${esc(source.text)}</p>${source.url ? `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">打开公开来源 ↗</a>` : ''}</div>`).join('')}</div>`;
}
function queriesPage() {
  const space = state.project.diagnosisSpaces?.find(s=>s.id===state.spaceId);
  return pageHeader('先确认要覆盖的问题', `当前问题集 v${space?.queryVersion ?? state.project.queryVersion}。修改后建立新版本；没有对应回答的新问题需要重新采样。`) +
    `<div class="two-col"><div class="panel"><div class="panel-head"><h2>本轮问题清单</h2>${badge(`${state.project.queries.length} 个问题`)}</div><div class="panel-body"><p class="subtle">每行一个问题。品牌核验与不带品牌的供应商发现分开观察。</p><textarea id="query-editor" rows="18" aria-label="问题清单">${esc((state.project.diagnosisSpaces?.find(s=>s.id===state.spaceId)?.queries || state.project.queries).map(q => q.text).join('\n'))}</textarea><div class="actions section-gap"><button class="btn primary" data-save-queries ${running()?'disabled':''}>保存并确认问题</button><button class="btn" data-confirm-diagnosis ${running()?'disabled':''}>保存并开始品牌诊断</button></div></div></div><aside class="panel"><div class="panel-head"><h2>问题的依据</h2></div><div class="panel-body"><p class="subtle">${state.project.origin === 'archive' ? '这些问题来自上游归档的原始探针。域名识别带有目标提示，不能称作自然发现。' : '初始候选由案例或本地模板提供。你可以按实际采购场景调整；系统不会把候选问题描述成有搜索量证据的热词。'}</p><div class="note section-gap">确认的单位是问题版本与实际文本。更换问题后，不沿用旧回答计算新版本表现。</div></div></aside></div>`;
}
function sampleRows(samples) {
  return samples.map(sample => {
    const j = state.run?.audit?.judgments.find(j => j.sampleId === sample.id);
    const label = sample.collectionStatus === 'failed' ? '采集失败' : sample.analysisStatus !== 'completed' ? '分析未完成' : j?.mentioned === true ? '已提及' : j?.mentioned === false ? '未提及' : '未判定';
    return `<tr class="${state.selectedSample === sample.id ? 'active' : ''}"><td class="question"><button class="row-button" data-sample="${esc(sample.id)}">${esc(sample.question)}<small>${esc(sample.intent)} · ${sample.branded ? '品牌问题' : '非品牌问题'}${sample.selected ? ' · 已采纳' : sample.selected === false ? ' · 未采纳尝试' : ''}</small></button></td><td><small>${esc(sample.model)}</small><div class="subtle">${esc(sample.origin === 'browser' ? '网页' : 'API')} · ${esc(fmtTime(sample.observedAt))}</div></td><td>${badge(label, label === '已提及' ? 'ok' : label.includes('失败') || label.includes('未完成') ? 'warn' : '')}</td><td class="right num">${sample.citations.filter(c => c.kind === 'provider_citation').length}</td></tr>`;
  }).join('');
}
function measurementMatrix() {
  const units = state.run?.measurementUnits;
  if (!units?.length) return '';
  const attemptRows = units.flatMap(unit => unit.attempts.map(attempt => `<tr><td class="question"><button class="row-button" data-prompt="${esc(unit.queryId)}">${esc(unit.question)}</button><small>${esc(unit.platform)} · ${esc(unit.id)}</small></td><td>${badge(attempt.channel === 'web' ? '网页' : 'API', attempt.channel === 'web' ? '' : 'api')}</td><td>${attempt.fallback ? '是' : '否'}</td><td>${statusBadge(attempt.status === 'completed' ? 'completed' : attempt.status === 'skipped' ? 'blocked' : 'failed')}${attempt.sampleId === unit.selectedSampleId ? badge('采纳', 'ok') : ''}</td><td><small>${esc(attempt.provider && attempt.model ? `${attempt.provider}/${attempt.model}` : attempt.provider || 'Xue + Kimi')}</small>${attempt.reason ? `<div class="subtle">${esc(attempt.reason)}</div>` : ''}</td></tr>`));
  return `<div class="panel section-gap"><div class="panel-head"><h2>逐题通道核对</h2>${badge(`${units.length} 个计划单元`)}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>问题 × 平台</th><th>通道</th><th>降级</th><th>状态</th><th>实际身份 / 失败原因</th></tr></thead><tbody>${attemptRows}</tbody></table></div><div class="panel-foot">指标只采纳每个问题×平台单元的一条终局结果；网页失败和 API 降级尝试保留在这里，不额外进入有效分母。</div></div>`;
}
function inspector() {
  const sample = state.run?.samples.find(s => s.id === state.selectedSample);
  if (!sample) return `<aside class="panel inspector"><div class="panel-head"><h2>证据检查器</h2></div><div class="empty">选择左侧问题，查看原始回答、判定依据与来源项。</div></aside>`;
  const judgment = state.run.audit?.judgments.find(j => j.sampleId === sample.id);
  const kindLabels = { provider_citation: 'Provider 引用', search_result: '检索结果', grounding: 'Grounding 来源', answer_url: '正文链接' };
  return `<aside class="panel inspector"><div class="panel-head"><h2>原始回答</h2>${badge(ORIGINS[sample.origin], sample.origin)}</div><div class="panel-body"><h3>${esc(sample.question)}</h3><div class="evidence-meta">${esc(sample.model)}<br>${esc(sample.observedAt)}<br>采集 ${esc(sample.collectionStatus)} / 分析 ${esc(sample.analysisStatus)}</div><pre class="answer">${esc(sample.answer || '未取得回答原文。')}</pre>${sample.error ? `<div class="note warn">${esc(sample.error)}</div>` : ''}${judgment ? `<div class="note"><strong>判定依据</strong><p>${esc(judgment.reason)}</p>${judgment.evidence ? `<p>“${esc(judgment.evidence.quote)}”</p><small>原文 UTF-16 位置 ${judgment.evidence.start}–${judgment.evidence.end}</small>` : ''}</div>` : ''}<h3 class="section-gap">来源项 · ${sample.citations.length}</h3>${sample.citations.length ? sample.citations.map(c => `<div class="citation">${badge(kindLabels[c.kind] || c.kind)} <small>${c.integrity === 'matched' ? '原始响应路径匹配' : c.integrity === 'mismatch' ? '路径核验不一致' : '尚未核验来源内容'}</small><a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.url)} ↗</a>${c.payloadPath ? `<small>${esc(c.payloadPath)}</small>` : ''}</div>`).join('') : `<p class="subtle">本次没有保存来源项。</p>`}<details><summary>查看原始响应</summary><pre>${esc(JSON.stringify(sample.rawResponse || {}, null, 2))}</pre></details></div></aside>`;
}
function evidencePage() {
  const samples = state.run?.samples || [];
  const filtered = samples.filter(s => `${s.question} ${s.answer} ${s.model}`.toLowerCase().includes(state.filter.toLowerCase()));
  return pageHeader('回答、判定与信源', '从每条记录返回原文。请求失败、分析失败和品牌未提及分别展示。', downloadActions()) + originBanner() +
    `${measurementMatrix()}<div class="filters"><input id="sample-filter" placeholder="筛选问题、回答或模型" aria-label="筛选回答" value="${esc(state.filter)}"><div class="actions"><button class="btn small" data-import>导入回答 JSON</button><button class="btn quiet small" data-import-template>下载导入格式</button></div></div><div class="evidence-layout"><div class="panel table-scroll"><table class="data-table"><thead><tr><th>问题 / 意图</th><th>模型 / 时间</th><th>判定</th><th class="right">引用</th></tr></thead><tbody>${filtered.length ? sampleRows(filtered) : `<tr><td colspan="4"><div class="empty">${state.run ? '当前没有匹配的回答。可以导入原文，或用模型执行新测量。' : '先运行 Agent，再查看回答证据。'}</div></td></tr>`}</tbody></table></div>${inspector()}</div>${state.run?.audit ? `<div class="panel section-gap"><div class="panel-head"><h2>分组覆盖</h2>${badge('不同条件不混作趋势')}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>来源 · 模型 · 问题类型 · 批次</th><th class="right">原文</th><th class="right">提及 / 可判定</th></tr></thead><tbody>${state.run.audit.strata.map(s => `<tr><td class="mono">${esc(s.label)}</td><td class="right num">${s.collected}/${s.count}</td><td class="right num">${s.mentioned}/${s.denominator}</td></tr>`).join('')}</tbody></table></div></div>` : ''}<input type="file" id="sample-file" accept="application/json,.json" hidden>`;
}
function actionsPage() {
  return pageHeader('行动中心', '从诊断到可执行的制作单，待办与历史保存在当前运行。') + actionCenter(state.run, {category:state.actionCategory,status:state.actionStatus,priority:state.actionPriority});
}
function contentPage() {
  const draft = state.run?.draft;
  return pageHeader('把确认的事实写成内容', '草稿、审核和发布登记分开记录，Agent 不会自动对外发布。', downloadActions()) +
    (!draft ? `<div class="panel empty">先运行 Agent 生成草稿。</div>` : draft.status === 'blocked' ? `<div class="panel"><div class="panel-head"><h2>内容生成等待确认</h2>${statusBadge('blocked')}</div><div class="panel-body"><ul class="warning-list">${draft.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul><div class="actions section-gap"><button class="btn primary" data-nav="facts">查看并确认事实</button><button class="btn" data-run>确认后重新运行</button></div><p class="subtle section-gap">当前运行保留阻塞状态。确认事实后，新运行会使用更新后的资料快照。</p></div></div>` : `<div class="panel"><div class="panel-head"><h2>${esc(draft.title)}</h2><div class="actions">${badge(draft.generator === 'llm' ? '模型生成' : '本地规则草稿')}${statusBadge(draft.status)}</div></div><textarea id="draft-editor" class="editor" aria-label="内容草稿">${esc(draft.markdown)}</textarea><div class="editor-footer"><label class="check-label"><input id="draft-reviewed" type="checkbox" ${draft.status === 'reviewed' ? 'checked' : ''}>我已核对事实与引用</label><button class="btn primary" data-save-draft>保存内容与审核状态</button></div></div>${draft.warnings.length ? `<div class="note warn section-gap"><ul class="warning-list">${draft.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}<div class="panel publication"><div class="panel-head"><h2>发布登记</h2>${badge('人工发布')}</div><div class="panel-body"><p>审核后可登记你发布的页面。登记仅保存链接，不代表已经访问、被索引或被 AI 引用。</p>${draft.status === 'reviewed' ? `<form id="publication-form" class="publication-form"><input type="url" name="url" placeholder="https://你的公开页面" required aria-label="发布链接"><button class="btn" type="submit">登记发布链接</button></form>` : `<p class="subtle section-gap">先核对内容并保存审核状态，再登记发布。</p>`}${state.run.publications.map(p => `<div class="citation"><a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a><small>${esc(fmtTime(p.recordedAt))} · 已登记，访问状态未验证</small></div>`).join('')}</div></div>`);
}
function flowPage() {
  return pageHeader('一个总控，八项可检查的能力', '用显式流程控制执行，模型负责受约束的语义任务，代码保存事实、状态与证据。') +
    `<div class="panel"><div class="panel-body"><h2>Agent 的工作方式</h2><div class="intro-flow"><div><strong>01 组织输入</strong><small>资料、事实和问题都有来源与版本。</small></div><div><strong>02 保留观察</strong><small>先存原文，再做判定和来源区分。</small></div><div><strong>03 生成动作</strong><small>策略引用实际问题、样本和事实。</small></div><div><strong>04 检查与复盘</strong><small>冲突阻塞内容，结果可以返回依据。</small></div></div><p class="subtle">无密钥时，规则规划器读取案例归档生成任务和草稿。连接模型后，采样模型只接收问题；策略模型接收诊断，内容模型只使用已确认事实。模型输出含不存在的证据 ID 时会被拒绝，并明确记录回退。</p><div class="note section-gap">这版实现没有训练模型或自动改变搜索平台的推荐权重。它帮助你组织可检查的 GEO 工作和实验。</div></div></div><div class="section-gap">${trace()}</div><div class="panel section-gap"><div class="panel-head"><h2>运行历史</h2>${badge(`${state.history.length} 轮`)}</div>${state.history.length ? state.history.map(r => `<div class="history-row"><div><p>${r.mode === 'live' ? '新 API 观察' : '案例回放'} · ${r.sampleCount} 条样本</p><time>${esc(fmtTime(r.createdAt))}</time></div>${statusBadge(r.status)}<button class="btn small" data-history="${esc(r.id)}">打开结果</button></div>`).join('') : '<div class="empty">尚无运行记录。</div>'}</div>${state.run?.limitations.length ? `<div class="panel section-gap"><div class="panel-head"><h2>本轮限制</h2></div><div class="panel-body"><ul class="warning-list">${state.run.limitations.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div>` : ''}`;
}
function navItem(id, icon, nested = false) {
  const label = NAV.find(n=>n[0]===id)?.[1];
  return `<button data-nav="${id}" class="${state.view===id?'selected ':''}${nested?'nested':''}" ${state.view===id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${navIcon(id)}</span><span>${label}</span></button>`;
}
function render() {
  if (!state.status) return;
  if (!state.project) { $('#app').innerHTML = '<main class="boot"><h1>创建你的第一个项目</h1><button class="btn primary" data-new>＋ 新建项目</button><button class="btn" data-projects>项目管理与回收站</button></main>'; return; }
  const pages = { overview, facts: factsPage, queries: queriesPage, evidence: evidencePage, sources: sourcesPage, actions: actionsPage, content: contentPage, flow: flowPage };
  const label = NAV.find(n=>n[0]===state.view)?.[1] || '工作概览';
  const section = ['actions','content'].includes(state.view) ? '优化' : state.view === 'facts' ? '项目' : state.view === 'flow' ? 'Agent' : '分析';
  $('#app').innerHTML = `<div class="shell ${state.collapsed?'rail-collapsed':''}"><aside class="sidebar"><div class="brand"><div class="brand-symbol" aria-hidden="true">O</div><div><div class="wordmark">OpenGEO</div><div class="brand-caption">GEO WORKSPACE</div></div></div><div class="project-picker"><label for="project-picker">当前项目</label><select id="project-picker">${state.projects.filter(p=>showExamples || !p.example || p.id===state.project.id).map(p=>`<option value="${esc(p.id)}" ${state.project.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><nav class="nav" aria-label="工作台导航">${navItem('flow','♧')}<div class="nav-group">分析 <span>Analysis</span></div>${navItem('overview','▦')}<div class="tracking-label"><span aria-hidden="true">⌁</span> 监测 <span class="tracking-chevron">⌄</span></div>${navItem('queries','',true)}${navItem('evidence','',true)}${navItem('sources','',true)}<div class="nav-group">优化 <span>Optimization</span></div>${navItem('actions','♧')}${navItem('content','▤')}<div class="nav-group">项目 <span>Management</span></div>${navItem('facts','⚑')}</nav><div class="side-bottom"><a class="side-button" href="/create-workspace">＋ 官网建档</a><button class="side-button" data-new>＋ 新建项目</button><button class="side-button" data-projects>项目管理</button><button class="side-button" data-settings>⚙ 服务商设置</button><div class="local-profile"><span class="profile-avatar">O</span><div>本地工作空间<small>OpenGEO · ${esc(state.status?.version || '未知版本')}</small></div><span class="dot"></span></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="sidebar-toggle" data-toggle-sidebar aria-label="切换侧边栏">◫</button><span class="breadcrumb-section">${section}</span><span>›</span><strong>${esc(label)}</strong></div><div class="actions">${downloadActions() || '<button class="btn small" data-nav="flow">Agent 工作流</button>'}</div></header><main class="content" id="main">${executionPanel(state.run)}${spaceToolbar()}${running() && ['overview','sources','actions','content','evidence'].includes(state.view) ? '<div class="panel empty">正在完成本轮诊断，结束后自动展示结果。</div>' : (pages[state.view]||overview)()}<footer class="footer-note"><span><span class="dot"></span> 本地运行 · 数据保存在本机</span><span>${state.run?`本轮 ${esc(fmtTime(state.run.createdAt))}`:'从一个案例开始'}</span></footer></main></div></div>`;
}
async function pollRun(id) {
  const selection = runSelection;
  if (state.polling === selection) return;
  state.polling = selection;
  try {
    while (true) {
      const run = await api(`/api/runs/${id}`);
      if (run.projectId !== state.project?.id || state.run?.id !== id || selection !== runSelection) break;
      state.run = run; state.analytics = run.analytics; if (Object.keys(state.analysisFilters).length) await refreshAnalysis(); render();
      if (!['queued', 'running'].includes(run.status)) { state.history = await api(`/api/runs?projectId=${state.project.id}`); render(); toast(run.status === 'failed' ? run.error || '本轮执行失败，已有证据保留' : '本轮已完成，结果与执行记录已保存在本地'); break; }
      await new Promise(resolve => setTimeout(resolve, 450));
    }
  } catch (error) { toast(error.message); }
  finally { if (state.polling === selection) state.polling = false; }
}
async function selectRun(id) {
  const selection = ++runSelection;
  let run;
  try { run = await api(`/api/runs/${encodeURIComponent(id)}`); }
  catch (error) { if (selection === runSelection && running()) pollRun(state.run.id); throw error; }
  if (selection !== runSelection) return;
  if (run.projectId !== state.project?.id) throw new Error('运行不属于当前项目');
  state.run = run; state.spaceId = run.spaceId || null; rememberSpace(); state.view = 'overview'; await refreshAnalysis();
  if (selection !== runSelection) return;
  render(); if (running()) pollRun(id);
}
let pendingSubmission;
async function startRun(input = {}) {
  ++runSelection;
  const goal = $('#goal')?.value || state.run?.goal || state.project.goal;
  const payload={projectId:state.project.id,...(state.spaceId?{spaceId:state.spaceId}:{}),goal,mode:'replay',...input};
  const signature=JSON.stringify(payload);
  if(pendingSubmission?.signature!==signature) pendingSubmission={signature,key:crypto.randomUUID()};
  const run=await api('/api/runs',{method:'POST',body:JSON.stringify({...payload,requestKey:pendingSubmission.key})});
  pendingSubmission=undefined;
  state.run = await api(`/api/runs/${run.id}`); state.analytics = state.run.analytics; state.analysisFilters = {}; state.view = 'overview'; rememberSpace(); await refreshHistory(); render(); pollRun(run.id);
}
function showDialog(title, description, fields, submitLabel, onSubmit) {
  const dialog = $('#dialog'); if (dialog.open) dialog.close();
  dialog.classList.remove('wide');
  dialog.innerHTML = `<button class="dialog-close" data-close aria-label="关闭">×</button><h2 id="dialog-title">${esc(title)}</h2><p class="subtle">${esc(description)}</p><form id="dialog-form"><div class="form-grid">${fields}</div><p class="dialog-error" role="alert"></p><div class="dialog-actions"><button class="btn" data-close type="button">取消</button><button class="btn primary" type="submit">${esc(submitLabel)}</button></div></form>`;
  dialog.onsubmit = async event => {
    event.preventDefault(); const button = dialog.querySelector('[type=submit]'); button.disabled = true;
    try { await onSubmit(new FormData(event.target)); dialog.close(); }
    catch (error) { dialog.querySelector('.dialog-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
  dialog.showModal();
}
async function refreshHistory() { state.history = await api(`/api/runs?projectId=${encodeURIComponent(state.project.id)}`); }
async function saveQuestions() {
  const editor = $('#query-editor');
  if (!editor) return;
  if (running()) throw new Error('当前诊断仍在执行，请结束后再保存新的问题空间');
  state.project = await api(`/api/projects/${state.project.id}/queries`, { method: 'PUT', body: JSON.stringify({ questions: editor.value.split('\n') }) });
  const space = await api(`/api/projects/${state.project.id}/diagnosis-spaces`, {method:'POST',body:'{}'});
  state.project = await api(`/api/projects/${state.project.id}`); state.spaceId = space.id;
  const previous = state.history.find(r=>r.spaceId===space.id); state.run = previous ? await api(`/api/runs/${previous.id}`) : null;
  rememberSpace();
}
function diagnosisDialog() {
  const templates = state.status.diagnosisTargets || [];
  const space = state.project.diagnosisSpaces?.find(s=>s.id===state.spaceId);
  const queries = (space?.queries || state.project.queries).filter(q => !q.status || q.status === 'active');
  const keyFields = ['openrouter', 'cloro'].map(id => {
    const configured = [...state.status.providers, ...(state.status.monitorProviders || [])].find(p => p.id === id)?.configured;
    return `<label>${id} API Key（${configured ? '本地已配置，可留空' : '本次需要填写'}）<input type="password" autocomplete="off" name="key-${id}" value="${esc(state.apiKeys[id] || '')}"></label>`;
  }).join('');
  showDialog('运行一轮品牌诊断', '问题已保存。选择平台即可开始。ChatGPT 与国内平台用 OpenRouter，Gemini 用 Cloro；模型由系统维护。',
    `<h3>已确认问题（每轮最多 50 条，按限额排队执行）</h3>${queries.map((q,i) => `<label class="check-label"><input type="checkbox" name="queryIds" value="${esc(q.id)}" ${space?.selectedQueryIds ? space.selectedQueryIds.includes(q.id)?'checked':'' : i<10?'checked':''}>${esc(q.text)}</label>`).join('')}<h3>诊断平台</h3>${templates.map(t => `<label class="check-label"><input type="checkbox" name="targetIds" value="${esc(t.id)}" ${!space?.targetIds.length || space.targetIds.includes(t.id)?'checked':''}>${esc(t.platform)} · ${t.provider === 'cloro' ? 'Cloro 监测 API' : 'OpenRouter 模型 API'}${t.collectionNote ? `<small>${esc(t.collectionNote)}</small>` : ''}</label>`).join('')}<details><summary>服务商密钥（已有本地配置可直接运行）</summary>${keyFields}</details>${space?'<button class="btn" type="button" data-save-space-config>保存选择，稍后测试</button>':''}`,
    '开始品牌诊断', async form => {
      const queryIds = form.getAll('queryIds').map(String), targetIds = form.getAll('targetIds').map(String);
      if (!queryIds.length || queryIds.length>50) throw new Error('请选择 1–50 个问题');
      if (!targetIds.length) throw new Error('请选择至少一个平台');
      const apiKeys = {};
      for (const id of ['openrouter','cloro']) { const key = String(form.get(`key-${id}`)||'').trim(); if(key) apiKeys[id]=key; }
      state.apiKeys = {...state.apiKeys,...apiKeys};
      if (state.spaceId) { await api(`/api/projects/${state.project.id}/diagnosis-spaces/${state.spaceId}`, {method:'PATCH',body:JSON.stringify({targetIds,queryIds})}); state.project=await api(`/api/projects/${state.project.id}`); }
      await startRun({mode:'live',diagnosis:true,queryIds,maxQuestions:queryIds.length,targetIds,apiKeys});
    });
  $('#dialog').classList.add('wide');
}
function modelDialog(live) {
  if (live) { diagnosisDialog(); return; }
  showDialog('服务商设置', '仅配置 OpenRouter 和 Cloro。密钥保存在本地服务进程内存，重启后清除；不会写入项目或浏览器存储。模型由系统管理。',
    ['openrouter','cloro'].map(id => `<label>${id} API Key<input type="password" name="${id}" autocomplete="off" placeholder="留空保留当前配置"></label>`).join('') + '<p><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">OpenRouter 密钥</a> · <a href="https://dashboard.cloro.dev/" target="_blank" rel="noopener noreferrer">Cloro 控制台</a></p>',
    '保存服务商配置', async form => { await api('/api/provider-session',{method:'POST',body:JSON.stringify(Object.fromEntries(form))}); state.status=await api('/api/status'); render(); toast('服务商配置已在本地进程内生效'); });
}
async function projectManager() {
  const deleted = await api('/api/deleted-projects');
  showDialog('项目管理', '各项目的资料、问题、运行和报告独立。删除后进入本地回收站，可恢复；不会删除其他项目。',
    `<label class="check-label"><input type="checkbox" name="examples" ${showExamples ? 'checked' : ''}>显示内置示例项目</label>${state.projects.filter(p => showExamples || !p.example).map(p => `<div class="actions"><strong>${esc(p.name)}</strong><button type="button" class="btn small" data-open-project="${esc(p.id)}">打开</button><button type="button" class="btn small" data-delete-project="${esc(p.id)}">删除项目</button></div>`).join('')}<h3>回收站</h3>${deleted.map(p => `<div class="actions"><span>${esc(p.name)}</span><button type="button" class="btn small" data-restore-project="${esc(p.id)}">恢复项目</button></div>`).join('') || '<p>暂无已删除项目</p>'}`, '保存显示偏好', async form => { showExamples = form.get('examples') === 'on'; localStorage.setItem('opengeo-show-examples', String(showExamples)); render(); });
}
function newProjectDialog() {
  showDialog('新建一个自己的项目', '输入品牌与产品资料，再逐项确认事实。新项目不会自动生成或伪造回答数据。',
    `<div class="form-row"><label>品牌名称<input name="brand" required maxlength="80" placeholder="你的品牌"></label><label>行业或产品<input name="industry" required maxlength="100" placeholder="例如：工业温度传感器"></label></div><div class="form-row"><label>官网域名<input name="domain" placeholder="example.com"></label><label>品牌别名<input name="aliases" placeholder="用逗号分隔，可留空"></label></div><label>品牌事实（每行一项，参数：内容）<textarea name="brief" rows="7" placeholder="主营产品：…&#10;适用场景：…&#10;参数范围：…"></textarea></label>`, '创建项目', async form => {
      const project = await api('/api/projects', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      await refreshProjects(); state.view = 'facts'; await selectProject(project.id); toast('项目已创建，请核对品牌事实');
    });
}
function saveDownload(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('keydown', () => document.body.classList.add('keyboard'));
document.addEventListener('pointerdown', () => document.body.classList.remove('keyboard'));
document.addEventListener('click', async event => {
  const button = event.target.closest('button, [data-chart-point][data-sample]'); if (!button) return;
  try {
    if(button.dataset.queueAction) {
      const action=button.dataset.queueAction;
      if(action==='redrive' && !confirm('旧请求可能已经收费。本次重投会保留旧记录，并可能再次收费。确认已核对回执并重投？')) return;
      button.disabled=true;
      await api(`/api/runs/${state.run.id}/${action}`, {method:'POST',body:JSON.stringify({jobId:button.dataset.queueJob,jobIds:[button.dataset.queueJob],acknowledgeCost:action==='redrive'})});
      await selectRun(state.run.id);
      return;
    }
    if (button.dataset.acFilter) { state[{category:'actionCategory',status:'actionStatus',priority:'actionPriority'}[button.dataset.acFilter]] = button.dataset.acValue; render(); return; }
    if (button.dataset.acAction) { button.disabled=true; const saved=await api(`/api/runs/${state.run.id}/actions`, {method:'PATCH',body:JSON.stringify({id:button.dataset.acAction,status:button.dataset.acStatus})}); state.run={...state.run,...saved}; render(); toast('行动状态已保存'); return; }
    if (button.hasAttribute('data-projects')) { await projectManager(); return; }
    if (button.dataset.openProject) { $('#dialog').close(); await selectProject(button.dataset.openProject); return; }
    if (button.dataset.deleteProject) {
      const id = button.dataset.deleteProject, p = state.projects.find(p => p.id === id);
      if (!confirm(`将「${p.name}」移入回收站？该项目的资料、运行和报告将一起隐藏，可恢复。`)) return;
      await api(`/api/projects/${id}`, { method: 'DELETE' }); await refreshProjects(); $('#dialog').close();
      if (state.project?.id === id) { const next = state.projects.find(p => !p.example); if (next) await selectProject(next.id); else { state.project = null; state.run = null; localStorage.removeItem('citekeel-project'); window.history.replaceState(null, '', '/'); render(); } }
      else render(); return;
    }
    if (button.dataset.restoreProject) { await api(`/api/deleted-projects/${button.dataset.restoreProject}/restore`, { method: 'POST' }); await refreshProjects(); await projectManager(); return; }
    if (button.hasAttribute('data-save-space-config')) {
      const form = new FormData($('#dialog-form')); button.disabled=true;
      const targetIds=form.getAll('targetIds').map(String), queryIds=form.getAll('queryIds').map(String);
      await api(`/api/projects/${state.project.id}/diagnosis-spaces/${state.spaceId}`,{method:'PATCH',body:JSON.stringify({targetIds,queryIds})});
      state.project=await api(`/api/projects/${state.project.id}`); $('#dialog').close(); render(); toast('问题与平台选择已保存，可稍后返回此空间测试'); return;
    }
    if (button.hasAttribute('data-close')) { $('#dialog').close(); return; }
    if (button.dataset.sourceLevel) { state.sourceLevel = button.dataset.sourceLevel; render(); return; }
    if (button.dataset.nav) { state.view = button.dataset.nav; render(); return; }
    if (button.dataset.prompt) { state.view = 'queries'; render(); return; }
    if (button.hasAttribute('data-diagnosis')) { if (!state.spaceId) { const space=await api(`/api/projects/${state.project.id}/diagnosis-spaces`,{method:'POST',body:'{}'}); state.project=await api(`/api/projects/${state.project.id}`); state.spaceId=space.id; state.run=null; rememberSpace(); render(); } diagnosisDialog(); return; }
    if (button.hasAttribute('data-run')) { button.disabled = true; await startRun(); return; }
    if (button.hasAttribute('data-live')) { document.querySelector('[data-diagnosis]')?.click(); return; }
    if (button.hasAttribute('data-settings')) { modelDialog(false); return; }
    if (button.hasAttribute('data-new')) { newProjectDialog(); return; }
    if (button.dataset.sample) { state.selectedSample = button.dataset.sample; state.view = 'evidence'; render(); if (innerWidth < 1150) $('.inspector')?.scrollIntoView({ behavior: 'instant', block: 'start' }); return; }
    if (button.dataset.confirm) {
      button.disabled = true; state.project = await api(`/api/projects/${state.project.id}/claims`, { method: 'POST', body: JSON.stringify({ claimId: button.dataset.confirm, sourceId: button.dataset.source }) });
      render(); toast('事实已确认。重新运行会使用新资料，历史结果保留。'); return;
    }
    if (button.hasAttribute('data-confirm-diagnosis')) { button.disabled=true; await saveQuestions(); render(); diagnosisDialog(); return; }
    if (button.hasAttribute('data-save-queries')) {
      button.disabled=true; await saveQuestions(); render(); toast('问题快照已保存到诊断空间，可开始测试或稍后返回'); return;
    }
    if (button.hasAttribute('data-save-draft')) {
      state.run = await api(`/api/runs/${state.run.id}/draft`, { method: 'PATCH', body: JSON.stringify({ markdown: $('#draft-editor').value, reviewed: $('#draft-reviewed').checked }) }); render(); toast('内容与审核状态已保存'); return;
    }
    if (button.hasAttribute('data-export')) { const data = await api(`/api/runs/${state.run.id}/export`); saveDownload(`citekeel-${state.project.id}.json`, JSON.stringify(data, null, 2)); return; }
    if (button.hasAttribute('data-import')) { $('#sample-file').click(); return; }
    if (button.hasAttribute('data-import-template')) { saveDownload('citekeel-import-template.json', JSON.stringify([{ question: state.project.queries[0]?.text || '你的原始问题', answer: '请替换成实际取得的原始回答', model: '请填写实际入口与模型', observedAt: new Date().toISOString(), runGroup: 'manual-batch-1' }], null, 2)); return; }
    if (button.dataset.history) { await selectRun(button.dataset.history); return; }
  } catch (error) { toast(error.message); button.disabled = false; if (running()) pollRun(state.run.id); }
});
document.addEventListener('change', async event => {
  const input = event.target;
  try {
    if (input.hasAttribute('data-space')) {
      const selection = ++runSelection, projectId = state.project.id; state.spaceId = input.value || null; state.run = null; state.analytics = null;
      const summary = state.history.find(r=>state.spaceId ? r.spaceId===state.spaceId : !r.spaceId);
      const run = summary ? await api(`/api/runs/${summary.id}?projectId=${projectId}`) : null;
      if (selection !== runSelection || projectId !== state.project?.id) return;
      state.run = run;
      state.analytics = state.run?.analytics || null; state.analysisFilters={}; rememberSpace(); render(); if(running()) pollRun(state.run.id); return;
    }
    if (input.hasAttribute('data-space-run')) { if(input.value) await selectRun(input.value); return; }
    if (input.hasAttribute('data-analysis-run')) { await selectRun(input.value); return; }
    if (input.matches('[data-analysis-model],[data-analysis-channel],[data-analysis-days]')) { const key = input.hasAttribute('data-analysis-model') ? 'model' : input.hasAttribute('data-analysis-channel') ? 'channel' : 'days'; state.analysisFilters[key] = input.value; await refreshAnalysis(); render(); return; }
    if (input.id === 'project-picker') { state.view = 'overview'; await selectProject(input.value); }
    if (input.dataset.actionId) { state.run = await api(`/api/runs/${state.run.id}/actions`, { method: 'PATCH', body: JSON.stringify({ id: input.dataset.actionId, status: input.value }) }); toast('任务状态已保存'); }
    if (input.id === 'sample-file' && input.files[0]) {
      if (input.files[0].size > 2_000_000) throw new Error('文件超过 2MB 限制');
      const samples = JSON.parse(await input.files[0].text());
      state.project = await api(`/api/projects/${state.project.id}/samples`, { method: 'POST', body: JSON.stringify({ samples }) });
      await refreshProjects(); await startRun(); toast('已导入原始回答，正在生成新一轮诊断');
    }
  } catch (error) { toast(error.message); if (running()) pollRun(state.run.id); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'sample-filter') { const pos = event.target.selectionStart; state.filter = event.target.value; render(); $('#sample-filter').focus(); $('#sample-filter').setSelectionRange(pos, pos); }
  if (event.target.id === 'draft-editor') $('#draft-reviewed').checked = false;
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'publication-form') return;
  event.preventDefault();
  try { state.run = await api(`/api/runs/${state.run.id}/publications`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); render(); toast('已登记链接，尚未验证访问或引用状态'); }
  catch (error) { toast(error.message); }
});
try {
  [state.status] = await Promise.all([api('/api/status'), refreshProjects()]);
  const requested = new URLSearchParams(location.search).get('project') || localStorage.getItem('citekeel-project');
  const selected = state.projects.find(p => p.id === requested) || state.projects.find(p => !p.example);
  if (selected) await selectProject(selected.id); else render();
  if (new URLSearchParams(location.search).get('manage') === '1') await projectManager();
  if (new URLSearchParams(location.search).get('settings') === '1') modelDialog(false);
  if (new URLSearchParams(location.search).get('measure') === '1') modelDialog(true);
} catch (error) { $('#app').innerHTML = `<div class="boot"><h1>工作台暂时无法读取项目</h1><p>${esc(error.message)}</p><p>请确认本地服务正在运行，然后刷新页面。</p></div>`; }

document.addEventListener('change', event => {


});
document.addEventListener('click', event => {
  const metric = event.target.closest('[data-chart]');
  if (metric) { state.chartMetric = metric.dataset.chart; render(); }
  if (event.target.closest('[data-toggle-sidebar]')) { state.collapsed = !state.collapsed; render(); }
});

document.addEventListener('brand-sources-updated', event => { if (event.detail.id !== state.project?.id) return; state.project = event.detail; render(); toast('资料已保存，请逐项核对事实；历史运行快照保持原样。'); });
