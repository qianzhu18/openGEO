const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? esc(u.toString()) : '#'; } catch { return '#'; } };
const state = { projects: [], project: null, run: null, history: [], view: 'overview', selectedSample: '', filter: '', status: null, polling: false, apiKeys: {}, settings: {}, modelFilter: 'all', rangeFilter: 'all', chartMetric: 'visibility', collapsed: false };
try { state.settings = JSON.parse(localStorage.getItem('citekeel-model') || '{}'); } catch {}
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
  state.project = await api(`/api/projects/${id}`); state.selectedSample = ''; state.filter = ''; state.modelFilter = 'all'; state.rangeFilter = 'all';
  state.history = await api(`/api/runs?projectId=${encodeURIComponent(id)}`);
  state.run = state.history.length ? await api(`/api/runs/${state.history[0].id}`) : null;
  localStorage.setItem('citekeel-project', id); render(); if (running()) pollRun(state.run.id);
}
function pageHeader(title, description = '', actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${esc(state.project.brand)} / GEO workspace</div><h1>${esc(title)}</h1>${description ? `<p class="subtle">${esc(description)}</p>` : ''}</div>${actions && !actions.includes('data-export') ? `<div class="actions">${actions}</div>` : ''}</div>`;
}
function downloadActions() { return state.run ? `<a class="btn small" href="/api/runs/${state.run.id}/report" download>导出报告 ↗</a><button class="btn small" data-export>JSON 证据</button>` : ''; }
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
  return `<div class="goal-box"><label>本轮目标<textarea id="goal" rows="2" aria-label="本轮目标">${esc(state.run?.goal || state.project.goal)}</textarea></label><div class="actions"><button class="btn primary" data-diagnosis ${running() ? 'disabled' : ''}>${running() ? '执行中…' : '⇶ 运行品牌诊断'}</button><button class="btn" data-live ${running() ? 'disabled' : ''}>单模型实测</button><button class="btn quiet" data-run ${running() ? 'disabled' : ''}>仅回放</button></div></div>`;
}
function metricStrip() {
  const a = state.run?.audit;
  return `<div class="metric-strip"><div class="metric"><div class="metric-label">取得回答原文</div><div class="metric-value">${a ? a.collected : '·'}<span>/ ${a ? a.plannedUnits || a.planned : '·'} 个单元</span></div><small>${a ? `执行 ${a.attemptCount || a.planned} 次尝试；采纳后失败 ${a.collectionFailed}，分析待处理 ${a.analysisFailed}` : '运行后查看本轮覆盖'}</small></div><div class="metric"><div class="metric-label">品牌字面提及</div><div class="metric-value">${pct(a?.mention)}</div><small>${a ? `${a.mention.numerator} / ${a.mention.denominator} 个可判定单元` : '保留原文定位与人工复核'}</small></div><div class="metric"><div class="metric-label">Provider 引用</div><div class="metric-value">${a ? a.providerCitations : '·'}<span>项</span></div><small>与正文链接分开统计</small></div><div class="metric"><div class="metric-label">策略任务</div><div class="metric-value">${state.run ? state.run.actions.length : '·'}<span>项</span></div><small>${state.run ? `${state.run.actions.filter(a => a.status === 'done').length} 项已完成` : '每个任务保留依据'}</small></div></div>`;
}
function trace() {
  const steps = state.run?.steps || state.status.skills.map(([id, label, skill]) => ({ id, label, skill, status: 'pending', executor: 'rules', summary: '' }));
  return `<div class="panel"><div class="panel-head"><h2>Agent 执行轨迹</h2>${state.run ? statusBadge(state.run.status) : badge('尚未运行')}</div><div class="steps">${steps.map((step, i) => `<div class="step ${esc(step.status)}"><span class="step-mark">${step.status === 'completed' ? '✓' : i + 1}</span><div class="step-title">${esc(step.label)}<small>${esc(step.skill)}</small></div><p class="step-summary">${esc(step.summary || '等待本轮输入与前置步骤')}</p><span class="step-state">${esc(EXECUTORS[step.executor])}</span></div>`).join('')}</div></div>`;
}
function findings() {
  const actions = state.run?.actions || [];
  return `<div class="panel"><div class="panel-head"><h2>本轮发现与动作</h2><button class="btn quiet small" data-nav="actions">查看全部 →</button></div>${actions.length ? actions.slice(0, 3).map((item, i) => `<div class="finding"><span class="finding-number">0${i + 1}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.rationale)}</p></div>${badge(item.priority, item.priority === 'P0' ? 'warn' : '')}</div>`).join('') : `<div class="empty">运行后，Agent 会根据资料冲突、回答和信源生成下一步任务。</div>`}</div>`;
}
function dashboardSamples() {
  const samples = state.run?.samples || state.project.samples;
  const cutoff = state.rangeFilter === 'all' ? 0 : Date.now() - Number(state.rangeFilter) * 86400000;
  return samples.filter(s => s.selected !== false && (state.modelFilter === 'all' || s.model === state.modelFilter) && (!cutoff || Date.parse(s.observedAt) >= cutoff));
}
function observedMention(sample) {
  const judgment = state.run?.audit?.judgments.find(j => j.sampleId === sample.id);
  if (judgment) return judgment.mentioned;
  if (sample.collectionStatus !== 'completed' || sample.analysisStatus !== 'completed' || !sample.answer.trim()) return null;
  const folded = sample.answer.replace(/https?:\/\/[^\s"<>]+/gi, url => ' '.repeat(url.length)).toLocaleLowerCase();
  for (const alias of [state.project.brand, ...state.project.aliases].filter(Boolean)) {
    const needle = alias.toLocaleLowerCase(); let offset = folded.indexOf(needle);
    while (offset !== -1) {
      const ascii = /^[a-z0-9 ._-]+$/i.test(alias);
      if (!ascii || (!/[a-z0-9_]/i.test(sample.answer[offset-1] || '') && !/[a-z0-9_]/i.test(sample.answer[offset+alias.length] || ''))) return true;
      offset = folded.indexOf(needle, offset + needle.length);
    }
  }
  return false;
}
function sampleMetric(samples) {
  const valid = samples.filter(s => observedMention(s) !== null);
  if (state.chartMetric === 'citations') return valid.length ? valid.filter(s => s.citations.some(c => c.kind === 'provider_citation')).length / valid.length : null;
  return valid.length ? valid.filter(s => observedMention(s)).length / valid.length : null;
}
function trendChart(samples) {
  const series = new Map();
  for (const sample of samples) {
    const day = sample.observedAt?.slice(0,10); if (!day || !Number.isFinite(Date.parse(day))) continue;
    const key = [sample.model, sample.protocolId, sample.origin, sample.runGroup, sample.branded ? '品牌问题' : '非品牌问题', sample.intent].join(' · ');
    if (!series.has(key)) series.set(key, new Map());
    const days = series.get(key); if (!days.has(day)) days.set(day, []); days.get(day).push(sample);
  }
  const dates = [...new Set([...series.values()].flatMap(days => [...days.keys()]))].sort();
  const colors = ['#44403c', '#a855f7', '#ec4899', '#f59e0b', '#2a9d8f'];
  if (!dates.length) return '<div class="chart-empty">暂无符合筛选条件的观察<br><small>导入回答或运行模型实测后查看。</small></div>';
  const x = i => dates.length === 1 ? 320 : 50 + i * 540 / (dates.length - 1);
  const grid = [0,25,50,75,100].map(v => `<line x1="50" y1="${250-v*2.1}" x2="605" y2="${250-v*2.1}" class="chart-grid"/><text x="38" y="${254-v*2.1}" text-anchor="end">${v}%</text>`).join('');
  const plots = [...series.entries()].map(([name, days], i) => {
    const points = [...days.entries()].map(([day, values]) => ({day, value: sampleMetric(values)})).filter(p => p.value !== null).sort((a,b)=>a.day.localeCompare(b.day));
    return `<g class="chart-series"><title>${esc(name)}</title>${points.length > 1 ? `<polyline points="${points.map(p => `${x(dates.indexOf(p.day))},${250-p.value*210}`).join(' ')}" fill="none" stroke="${colors[i%5]}" stroke-width="2"/>` : ''}${points.map(p => `<circle cx="${x(dates.indexOf(p.day))}" cy="${250-p.value*210}" r="4" fill="${colors[i%5]}"><title>${esc(name)} · ${p.day} · ${(p.value*100).toFixed(1)}%</title></circle>`).join('')}</g>`;
  }).join('');
  return `<div class="chart-surface"><svg class="trend-chart" viewBox="0 0 640 290" role="img" aria-label="按模型、来源、协议和批次分开的品牌观察">${grid}${plots}${dates.filter((_,i)=>i===0||i===dates.length-1||dates.length<7).map(day=>`<text x="${x(dates.indexOf(day))}" y="280" text-anchor="middle">${day.slice(5)}</text>`).join('')}</svg></div><div class="chart-legend">${[...series.keys()].map((name,i)=>`<span><i class="legend-dot color-${i%5}"></i>${esc(name)}</span>`).join('')}</div><p class="chart-note">${dates.length === 1 ? '当前只有一个观察日，显示实际点位。' : '仅连接相同模型、来源、协议和批次的实际观察。'} 不补齐缺失日期。</p>`;
}
function modelComparison(samples) {
  const models = [...new Set(samples.map(s=>s.model))];
  const rows = models.map(model=> { const set=samples.filter(s=>s.model===model); const value=sampleMetric(set); return {model,set,value}; }).sort((a,b)=>(b.value ?? -1)-(a.value ?? -1));
  return `<div class="panel dashboard-panel"><div class="dashboard-head"><div><h2>模型表现</h2><p>当前品牌在不同模型中的实际观察</p></div><button class="text-link" data-nav="evidence">查看全部</button></div><div class="table-scroll comparison-table"><table class="data-table"><thead><tr><th>#</th><th>模型</th><th>${state.chartMetric === 'citations' ? '引用覆盖率' : '品牌提及率'}</th><th>回答</th><th>Provider 引用</th></tr></thead><tbody>${rows.length ? rows.map((r,i)=>`<tr><td>${i+1}</td><td><span class="model-avatar">${esc(r.model.charAt(0).toUpperCase())}</span><span class="model-name">${esc(r.model)}</span></td><td>${r.value===null?'—':(r.value*100).toFixed(1)+'%'}</td><td>${r.set.filter(s=>s.collectionStatus==='completed').length} / ${r.set.length}</td><td>${r.set.reduce((n,s)=>n+s.citations.filter(c=>c.kind==='provider_citation').length,0)}</td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">暂无模型观察数据</div></td></tr>'}</tbody></table></div><p class="chart-note">不同模型可能对应不同问题集与批次，此表不代表同条件竞测。</p></div>`;
}
function topicBreakdown(samples) {
  const intents = [...new Set(state.project.queries.map(q=>q.intent))];
  return `<div class="panel dashboard-panel section-gap"><div class="dashboard-head"><div><h2>主题表现</h2><p>从问题主题返回每一条回答证据</p></div><button class="text-link" data-nav="queries">管理问题 →</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>主题</th><th>问题数</th><th>取得回答</th><th>品牌提及率</th><th>Provider 引用</th></tr></thead><tbody>${intents.map(intent=>{ const set=samples.filter(s=>s.intent===intent); const valid=set.filter(s=>observedMention(s)!==null);return `<tr><td><button class="row-button" data-nav="evidence">${esc(intent)}</button></td><td>${state.project.queries.filter(q=>q.intent===intent).length}</td><td>${set.filter(s=>s.collectionStatus==='completed').length}</td><td>${valid.length ? (valid.filter(s=>observedMention(s)).length/valid.length*100).toFixed(1)+'%' : '—'}</td><td>${set.reduce((n,s)=>n+s.citations.filter(c=>c.kind==='provider_citation').length,0)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
}
function overview() {
  const samples = dashboardSamples();
  const models = [...new Set((state.run?.samples || state.project.samples).map(s=>s.model))];
  return `<h1 class="sr-only">把观察变成下一步行动</h1><div class="dashboard-toolbar"><div class="dashboard-filters"><label><span class="sr-only">观察时间范围</span><select id="dashboard-range" aria-label="观察时间范围">${[['all','全部观察时间'],['7','最近 7 天'],['30','最近 30 天']].map(([value,label])=>`<option value="${value}" ${state.rangeFilter===value?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="sr-only">筛选模型</span><select id="dashboard-model" aria-label="筛选模型"><option value="all">全部模型</option>${models.map(model=>`<option value="${esc(model)}" ${state.modelFilter===model?'selected':''}>${esc(model)}</option>`).join('')}</select></label><span class="brand-filter">◇ ${esc(state.project.brand)}</span></div><div class="metric-tabs" role="group" aria-label="图表指标"><button data-chart="visibility" class="${state.chartMetric==='visibility'?'active':''}">品牌提及</button><button data-chart="citations" class="${state.chartMetric==='citations'?'active':''}">引用覆盖</button></div></div><div class="dashboard-grid"><div class="panel dashboard-panel"><div class="dashboard-head"><div><h2>品牌趋势 <span class="help-hint" title="品牌提及以可判定原文为分母；引用覆盖以含 Provider 引用的回答为分子。">ⓘ</span></h2><p>${state.chartMetric==='citations'?'Provider 引用覆盖率':'品牌在 AI 回答中的字面提及率'}</p></div></div>${trendChart(samples)}</div>${modelComparison(samples)}</div><div class="section-gap">${findings()}</div>${topicBreakdown(samples)}<div class="dashboard-provenance">${originBanner()}</div><details class="run-controls" open><summary>运行工作流</summary>${runBox()}${metricStrip()}</details>`;
}
function sourcesPage() {
  const citations = (state.run?.samples || state.project.samples).flatMap(s=>s.citations.map(c=>({...c,sample:s})));
  const kinds={provider_citation:'Provider 引用',search_result:'检索结果',grounding:'Grounding',answer_url:'正文链接'};
  return pageHeader('信源分析','保留来源类型，正文链接不自动计为 Provider 引用。',downloadActions())+`<div class="panel table-scroll"><table class="data-table"><thead><tr><th>来源网址</th><th>类型</th><th>模型</th><th>关联回答</th></tr></thead><tbody>${citations.length?citations.map(c=>`<tr><td><a href="${safeUrl(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.url)}</a></td><td>${badge(kinds[c.kind]||c.kind)}</td><td>${esc(c.sample.model)}</td><td><button class="row-button" data-sample="${esc(c.sample.id)}">${esc(c.sample.question)}</button></td></tr>`).join(''):'<tr><td colspan="4"><div class="empty">尚无信源记录。导入回答或运行 Agent 后查看。</div></td></tr>'}</tbody></table></div>`;
}
function factsPage() {
  return pageHeader('品牌事实与来源', '确认可用于内容的事实。每次确认保存来源与时间，历史运行快照保持原样。', `<button class="btn primary" data-run ${running() ? 'disabled' : ''}>重新运行</button>`) + originBanner() +
    `<div class="panel"><div class="panel-head"><h2>事实清单</h2>${badge(`${state.project.claims.length} 项`)}</div><div class="claim-list">${state.project.claims.length ? state.project.claims.map(claim => `<div class="claim-row" id="${esc(claim.id)}"><div class="claim-label">${esc(claim.label)}</div><div><p class="claim-value">${esc(claim.value)}</p><p class="claim-sources">${claim.sourceIds.map(id => esc(state.project.sources.find(s => s.id === id)?.title || id)).join(' · ')}</p>${claim.status === 'conflict' ? `<div class="claim-options">${(claim.alternatives || []).map(option => `<button class="btn small" data-confirm="${esc(claim.id)}" data-source="${esc(option.sourceId)}">采用：${esc(option.value)}</button>`).join('')}</div>` : claim.status === 'unconfirmed' ? `<div class="claim-options"><button class="btn small" data-confirm="${esc(claim.id)}" data-source="${esc(claim.sourceIds[0])}">我已核对，确认此项</button></div>` : claim.confirmation ? `<p class="claim-sources">本地确认于 ${esc(fmtTime(claim.confirmation.at))}</p>` : ''}</div>${statusBadge(claim.status)}</div>`).join('') : `<div class="empty">创建项目时按“参数：内容”逐行输入品牌资料，可在这里逐项确认。</div>`}</div></div><div class="panel section-gap"><div class="panel-head"><h2>原始资料</h2></div>${state.project.sources.map(source => `<div class="source-document"><h3>${esc(source.title)}</h3><p>${esc(source.text)}</p>${source.url ? `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">打开公开来源 ↗</a>` : ''}</div>`).join('')}</div>`;
}
function queriesPage() {
  return pageHeader('先确认要覆盖的问题', `当前问题集 v${state.project.queryVersion}。修改后建立新版本；没有对应回答的新问题需要重新采样。`) +
    `<div class="two-col"><div class="panel"><div class="panel-head"><h2>本轮问题清单</h2>${badge(`${state.project.queries.length} 个问题`)}</div><div class="panel-body"><p class="subtle">每行一个问题。品牌核验与不带品牌的供应商发现分开观察。</p><textarea id="query-editor" rows="18" aria-label="问题清单">${esc(state.project.queries.map(q => q.text).join('\n'))}</textarea><div class="actions section-gap"><button class="btn primary" data-save-queries>保存并确认问题</button><button class="btn" data-live>用模型实测</button></div></div></div><aside class="panel"><div class="panel-head"><h2>问题的依据</h2></div><div class="panel-body"><p class="subtle">${state.project.origin === 'archive' ? '这些问题来自上游归档的原始探针。域名识别带有目标提示，不能称作自然发现。' : '初始候选由案例或本地模板提供。你可以按实际采购场景调整；系统不会把候选问题描述成有搜索量证据的热词。'}</p><div class="note section-gap">确认的单位是问题版本与实际文本。更换问题后，不沿用旧回答计算新版本表现。</div></div></aside></div>`;
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
  return pageHeader('有依据的策略任务', '任务保留目标问题、样本与事实 ID，执行状态可以在本地更新。') +
    `<div class="panel"><div class="panel-head"><h2>行动清单</h2>${badge(`${state.run?.actions.length || 0} 项`)}</div>${state.run?.actions.length ? state.run.actions.map(action => `<article class="task"><div><div class="task-title">${badge(action.priority, action.priority === 'P0' ? 'warn' : '')}<h3>${esc(action.title)}</h3></div><p>${esc(action.rationale)}</p><p class="acceptance">验收：${esc(action.acceptance)}</p><div class="references">${action.sampleIds.slice(0, 3).map((id, i) => `<button class="ref" data-sample="${esc(id)}">原文 ${i + 1} ↗</button>`).join('')}${action.claimIds.slice(0, 3).map(id => `<button class="ref" data-nav="facts">事实 ${esc(id)}</button>`).join('')}${action.queryIds.length ? `<button class="ref" data-nav="queries">${action.queryIds.length} 个关联问题</button>` : ''}</div></div><label class="subtle">执行状态<select data-action-id="${esc(action.id)}">${[['proposed', '待处理'], ['in_progress', '进行中'], ['done', '已完成']].map(([id, label]) => `<option value="${id}" ${action.status === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></article>`).join('') : `<div class="empty">运行 Agent 后，这里会出现基于证据的改进任务。</div>`}</div>`;
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
  return `<button data-nav="${id}" class="${state.view===id?'selected ':''}${nested?'nested':''}" ${state.view===id?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
}
function render() {
  if (!state.project || !state.status) return;
  const pages = { overview, facts: factsPage, queries: queriesPage, evidence: evidencePage, sources: sourcesPage, actions: actionsPage, content: contentPage, flow: flowPage };
  const label = NAV.find(n=>n[0]===state.view)?.[1] || '工作概览';
  const section = ['actions','content'].includes(state.view) ? '优化' : state.view === 'facts' ? '项目' : state.view === 'flow' ? 'Agent' : '分析';
  $('#app').innerHTML = `<div class="shell ${state.collapsed?'rail-collapsed':''}"><aside class="sidebar"><div class="brand"><div class="brand-symbol" aria-hidden="true">O</div><div><div class="wordmark">OpenGEO</div><div class="brand-caption">GEO WORKSPACE</div></div></div><div class="project-picker"><label for="project-picker">当前项目</label><select id="project-picker">${state.projects.map(p=>`<option value="${esc(p.id)}" ${state.project.id===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><nav class="nav" aria-label="工作台导航">${navItem('flow','♧')}<div class="nav-group">分析 <span>Analysis</span></div>${navItem('overview','▦')}<div class="tracking-label"><span aria-hidden="true">⌁</span> 监测 <span class="tracking-chevron">⌄</span></div>${navItem('queries','',true)}${navItem('evidence','',true)}${navItem('sources','',true)}<div class="nav-group">优化 <span>Optimization</span></div>${navItem('actions','♧')}${navItem('content','▤')}<div class="nav-group">项目 <span>Management</span></div>${navItem('facts','⚑')}</nav><div class="side-bottom"><a class="side-button" href="/create-workspace">＋ Create workspace</a><button class="side-button" data-new>＋ 新建项目</button><button class="side-button" data-settings>⚙ 模型设置</button><div class="local-profile"><span class="profile-avatar">O</span><div>本地工作空间<small>OpenGEO · 0.1.0</small></div><span class="dot"></span></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="sidebar-toggle" data-toggle-sidebar aria-label="切换侧边栏">◫</button><span class="breadcrumb-section">${section}</span><span>›</span><strong>${esc(label)}</strong></div><div class="actions">${downloadActions() || '<button class="btn small" data-nav="flow">Agent 工作流</button>'}</div></header><main class="content" id="main">${(pages[state.view]||overview)()}<footer class="footer-note"><span><span class="dot"></span> 本地运行 · 数据保存在本机</span><span>${state.run?`本轮 ${esc(fmtTime(state.run.createdAt))}`:'从一个案例开始'}</span></footer></main></div></div>`;
}
async function pollRun(id) {
  if (state.polling) return;
  state.polling = true;
  try {
    while (true) {
      const run = await api(`/api/runs/${id}`);
      if (run.projectId !== state.project.id) break;
      state.run = run; render();
      if (!['queued', 'running'].includes(run.status)) { state.history = await api(`/api/runs?projectId=${state.project.id}`); toast(run.status === 'failed' ? run.error || '本轮执行失败，已有证据保留' : '本轮已完成，结果与执行记录已保存在本地'); break; }
      await new Promise(resolve => setTimeout(resolve, 450));
    }
  } catch (error) { toast(error.message); }
  finally { state.polling = false; }
}
async function startRun(input = {}) {
  const goal = $('#goal')?.value || state.run?.goal || state.project.goal;
  const run = await api('/api/runs', { method: 'POST', body: JSON.stringify({ projectId: state.project.id, goal, mode: 'replay', ...input }) });
  state.run = await api(`/api/runs/${run.id}`); state.view = 'overview'; render(); pollRun(run.id);
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
function diagnosisDialog() {
  const defaults = state.settings;
  const templates = state.status?.diagnosisTargets || [];
  const activeQueries = state.project.queries.filter(q => !q.status || q.status === 'active').slice(0, 10);
  const fallbackProvider = defaults.provider || 'openrouter';
  const fallbackModel = templates.find(target => target.id === 'chatgpt')?.model || defaults.model || '';
  const questionFields = activeQueries.map((query, index) => `<label class="check-label question-option"><input type="checkbox" name="queryIds" value="${esc(query.id)}" ${index < 5 ? 'checked' : ''}><span><strong>${esc(query.branded ? '品牌核验' : '供应商发现')}</strong><small>${esc(query.text)}</small></span></label>`).join('');
  const providerOptions = provider => state.status.providers.map(item => `<option value="${esc(item.id)}" ${item.id === provider ? 'selected' : ''}>${esc(item.id)}${item.configured ? '（已配置）' : ''}</option>`).join('');
  const targetFields = templates.map(target => {
    const isWeb = target.preferredChannel === 'web';
    const enabled = isWeb || (target.configured && target.model);
    const model = isWeb ? fallbackModel : target.model || '';
    return `<article class="target-card"><label class="check-label"><input type="checkbox" name="targetIds" value="${esc(target.id)}" ${enabled ? 'checked' : ''}><span><strong>${esc(target.platform)}</strong><small>${isWeb ? 'Xue + Kimi 网页优先；可配 API 降级' : 'API 通道'}</small></span></label>${isWeb ? `<div class="form-row"><label>降级 Provider<select name="provider-${esc(target.id)}">${providerOptions(fallbackProvider)}</select></label><label>降级模型 ID<input name="model-${esc(target.id)}" value="${esc(model)}" placeholder="留空则网页失败后保留空缺"></label></div>` : target.provider ? `<div class="form-row"><label>Provider<select name="provider-${esc(target.id)}">${providerOptions(target.provider)}</select></label><label>模型 ID<input name="model-${esc(target.id)}" value="${esc(model)}" required></label></div>` : ''}<label class="check-label"><input type="checkbox" name="search-${esc(target.id)}" ${target.webSearch !== false ? 'checked' : ''}>请求 Provider 搜索能力</label></article>`;
  }).join('');
  const keyFields = state.status.providers.map(provider => {
    return `<label>${esc(provider.id)} API Key（本页内存）<input type="password" name="key-${esc(provider.id)}" autocomplete="off" placeholder="${provider.configured ? '本地环境已配置，可留空' : '未配置时填写'}"></label>`;
  }).join('');
  showDialog('运行一轮品牌诊断', '一轮冻结问题版本和平台矩阵。网页端通过 Xue + Kimi 串行提交；API 平台并行执行；网页失败只对当前题、当前平台做 API 降级。',
    `<section><h3>本轮问题集</h3><p class="dialog-note">默认勾选前 5 条 active 问题，最多 10 条。同一问题会在所有启用平台各形成一个计划单元。</p><div class="question-list">${questionFields || '<p class="dialog-note">没有 active 问题，请先保存问题集。</p>'}</div></section><section><h3>平台矩阵</h3><div class="target-grid">${targetFields}</div><p class="dialog-note">ChatGPT 是当前唯一正式网页适配器；其他平台先按 API 通道执行，不冒充网页结果。API Key 只留在本页内存，环境变量由本地服务端解析。</p><div class="form-row api-key-grid">${keyFields}</div></section><p class="dialog-note">并发规则：平台任务同时启动；同一个 API 平台内部按题串行，网页采集全局串行并保留平台限速。每个单元最多采纳一条有效回答，失败尝试不进分母。</p>`,
    '确认问题并运行', async form => {
      const queryIds = form.getAll('queryIds').map(String);
      if (!queryIds.length || queryIds.length > 10) throw new Error('请选择 1–10 个问题');
      const selectedIds = form.getAll('targetIds').map(String);
      if (!selectedIds.length || selectedIds.length > 6) throw new Error('请选择 1–6 个平台');
      const apiKeys = {};
      const targets = templates.filter(target => selectedIds.includes(target.id)).map(target => {
        const provider = target.preferredChannel === 'web' ? String(form.get(`provider-${target.id}`) || '') : target.provider ? String(form.get(`provider-${target.id}`) || target.provider) : undefined;
        let model = target.preferredChannel === 'web' ? String(form.get(`model-${target.id}`) || '').trim() : String(form.get(`model-${target.id}`) || '').trim();
        if (provider) {
          const key = String(form.get(`key-${provider}`) || '').trim();
          if (key) apiKeys[provider] = key;
        }
        if (target.preferredChannel !== 'web' && !model) throw new Error(`${target.platform} 需要模型 ID`);
        return { id: target.id, platform: target.platform, preferredChannel: target.preferredChannel, ...(target.webEngine ? { webEngine: target.webEngine } : {}), ...(provider && model ? { provider, model } : {}), webSearch: form.get(`search-${target.id}`) === 'on' };
      });
      state.apiKeys = { ...state.apiKeys, ...apiKeys };
      await startRun({ mode: 'live', diagnosis: true, queryIds, maxQuestions: queryIds.length, targets, apiKeys });
    });
  $('#dialog').classList.add('wide');
}
function modelDialog(live) {
  const defaults = state.settings;
  const neutral = state.project.queries.filter(q => !q.branded).slice(0, 2), branded = state.project.queries.filter(q => q.branded).slice(0, 1);
  const qs = [...neutral, ...branded].length ? [...neutral, ...branded] : state.project.queries.slice(0, 3);
  showDialog(live ? '运行一次新的 API 观察' : '模型设置', '密钥仅用于本次本地会话，不写入浏览器存储或项目文件。回放案例无需配置。',
    `<div class="form-row"><label>Provider<select name="provider">${state.status.providers.map(p => `<option value="${p.id}" ${p.id === (defaults.provider || 'openrouter') ? 'selected' : ''}>${p.id}${p.configured ? '（已有环境配置）' : ''}</option>`).join('')}</select></label><label>模型 ID<input name="model" placeholder="填写账号当前可用的模型 ID" value="${esc(defaults.model || ((!defaults.provider || defaults.provider === 'openrouter') ? 'qwen/qwen3.5-flash-02-23' : ''))}" required></label></div><label>API Key<input name="apiKey" id="api-key" type="password" autocomplete="off" placeholder="已有环境变量时可以留空"></label><label class="check-label"><input name="webSearch" type="checkbox" ${defaults.webSearch ? 'checked' : ''}>请求 Provider 支持的搜索能力</label>${live ? `<label>确认本轮问题（每行一条，最多 5 条）<textarea name="questions" rows="5" required>${esc(qs.map(q => q.text).join('\n'))}</textarea></label><p class="dialog-note">最多 5 次采样，另有策略和内容调用，总计最多 8 次请求。搜索是否实际执行以返回证据为准；费用未知时暂停后续调用。公开案例用于回放，模型实测适合你的真实品牌。</p>` : `<p class="dialog-note">只保存 Provider、模型 ID 和搜索偏好。API Key 留在当前页面内存，刷新后清除。</p>`}`,
    live ? '确认问题并实测' : '保存设置', async form => {
      const config = { provider: String(form.get('provider')), model: String(form.get('model')).trim(), webSearch: form.get('webSearch') === 'on' };
      state.settings = config; state.apiKeys[config.provider] = String(form.get('apiKey') || '').trim() || state.apiKeys[config.provider] || '';
      localStorage.setItem('citekeel-model', JSON.stringify(config));
      if (live) {
        const questions = String(form.get('questions')).split('\n').map(x => x.trim()).filter(Boolean);
        if (questions.length < 1 || questions.length > 5) throw new Error('请确认 1–5 个采样问题');
        await startRun({ mode: 'live', ...config, apiKey: state.apiKeys[config.provider] || '', maxQuestions: questions.length, questions });
      } else toast('模型偏好已保存，密钥仅保留在本页面内存');
    });
  $('#api-key').value = state.apiKeys[defaults.provider || 'openrouter'] || '';
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
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.hasAttribute('data-close')) { $('#dialog').close(); return; }
    if (button.dataset.nav) { state.view = button.dataset.nav; render(); return; }
    if (button.dataset.prompt) { state.view = 'queries'; render(); return; }
    if (button.hasAttribute('data-diagnosis')) { button.disabled = true; diagnosisDialog(); return; }
    if (button.hasAttribute('data-run')) { button.disabled = true; await startRun(); return; }
    if (button.hasAttribute('data-live')) { modelDialog(true); return; }
    if (button.hasAttribute('data-settings')) { modelDialog(false); return; }
    if (button.hasAttribute('data-new')) { newProjectDialog(); return; }
    if (button.dataset.sample) { state.selectedSample = button.dataset.sample; state.view = 'evidence'; render(); if (innerWidth < 1150) $('.inspector')?.scrollIntoView({ behavior: 'instant', block: 'start' }); return; }
    if (button.dataset.confirm) {
      button.disabled = true; state.project = await api(`/api/projects/${state.project.id}/claims`, { method: 'POST', body: JSON.stringify({ claimId: button.dataset.confirm, sourceId: button.dataset.source }) });
      render(); toast('事实已确认。重新运行会使用新资料，历史结果保留。'); return;
    }
    if (button.hasAttribute('data-save-queries')) {
      state.project = await api(`/api/projects/${state.project.id}/queries`, { method: 'PUT', body: JSON.stringify({ questions: $('#query-editor').value.split('\n').map(x => x.trim()).filter(Boolean) }) }); render(); toast(`问题集 v${state.project.queryVersion} 已保存`); return;
    }
    if (button.hasAttribute('data-save-draft')) {
      state.run = await api(`/api/runs/${state.run.id}/draft`, { method: 'PATCH', body: JSON.stringify({ markdown: $('#draft-editor').value, reviewed: $('#draft-reviewed').checked }) }); render(); toast('内容与审核状态已保存'); return;
    }
    if (button.hasAttribute('data-export')) { const data = await api(`/api/runs/${state.run.id}/export`); saveDownload(`citekeel-${state.project.id}.json`, JSON.stringify(data, null, 2)); return; }
    if (button.hasAttribute('data-import')) { $('#sample-file').click(); return; }
    if (button.hasAttribute('data-import-template')) { saveDownload('citekeel-import-template.json', JSON.stringify([{ question: state.project.queries[0]?.text || '你的原始问题', answer: '请替换成实际取得的原始回答', model: '请填写实际入口与模型', observedAt: new Date().toISOString(), runGroup: 'manual-batch-1' }], null, 2)); return; }
    if (button.dataset.history) { state.run = await api(`/api/runs/${button.dataset.history}`); state.view = 'overview'; render(); return; }
  } catch (error) { toast(error.message); button.disabled = false; }
});
document.addEventListener('change', async event => {
  const input = event.target;
  try {
    if (input.id === 'project-picker') { state.view = 'overview'; await selectProject(input.value); }
    if (input.dataset.actionId) { state.run = await api(`/api/runs/${state.run.id}/actions`, { method: 'PATCH', body: JSON.stringify({ id: input.dataset.actionId, status: input.value }) }); toast('任务状态已保存'); }
    if (input.id === 'sample-file' && input.files[0]) {
      if (input.files[0].size > 2_000_000) throw new Error('文件超过 2MB 限制');
      const samples = JSON.parse(await input.files[0].text());
      state.project = await api(`/api/projects/${state.project.id}/samples`, { method: 'POST', body: JSON.stringify({ samples }) });
      await refreshProjects(); await startRun(); toast('已导入原始回答，正在生成新一轮诊断');
    }
  } catch (error) { toast(error.message); }
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
  await selectProject(state.projects.some(p => p.id === requested) ? requested : 'sensor');
  if (new URLSearchParams(location.search).get('measure') === '1') modelDialog(true);
} catch (error) { $('#app').innerHTML = `<div class="boot"><h1>工作台暂时无法读取项目</h1><p>${esc(error.message)}</p><p>请确认本地服务正在运行，然后刷新页面。</p></div>`; }

document.addEventListener('change', event => {
  if (event.target.id === 'dashboard-model') { state.modelFilter = event.target.value; render(); }
  if (event.target.id === 'dashboard-range') { state.rangeFilter = event.target.value; render(); }
});
document.addEventListener('click', event => {
  const metric = event.target.closest('[data-chart]');
  if (metric) { state.chartMetric = metric.dataset.chart; render(); }
  if (event.target.closest('[data-toggle-sidebar]')) { state.collapsed = !state.collapsed; render(); }
});
