const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = url => { try { const value = new URL(url); return ['https:', 'http:'].includes(value.protocol) ? escapeHtml(value.href) : '#'; } catch { return '#'; } };
let job = null, selected = new Set(), project = null, generation = 0, uiLang = 'en';

const copy = {
  en: {
    steps: ['Info', 'Research', 'Prompts', 'Ready'],
    aside: `<div class="eyebrow">YOUR BRAND, IN AI ANSWERS</div><h1>Start with your website.<br>Build from evidence.</h1><p>Turn your public pages into a brand profile and a focused set of questions for your first AI visibility baseline.</p><ol class="benefits"><li><span>01</span><div><strong>Research your website</strong><p>Collect your homepage and relevant pages, with sources attached.</p></div></li><li><span>02</span><div><strong>Review the right questions</strong><p>Choose which questions belong in your first measurement.</p></div></li><li><span>03</span><div><strong>Measure, then act</strong><p>Collect real answers before drawing conclusions or planning improvements.</p></div></li></ol><div class="local-note"><span class="live-dot"></span> Runs locally · English &amp; Chinese</div>`,
    formTitle: "What's your website?",
    formSub: "We'll use your public pages to prepare your workspace. Review the suggestions before collecting AI answers.",
    urlLabel: 'Website URL', language: 'Language', market: 'Target market',
    useModel: 'Model-assisted research (optional)', useModelNote: 'Use a model to research topics and buyer questions',
    provider: 'Research provider', modelId: 'Research model ID', apiKey: 'Research API key',
    keyPlaceholder: 'Leave blank to use the local provider configuration',
    modelNote: 'One model operation, up to 2,500 output tokens. Your provider may charge for it. Without this option, research uses source-based templates.',
    submit: 'Research my website →',
    formNote: 'Website sources are collected automatically. Model research is optional; neither path measures AI visibility until you collect real answers.',
    loadingTitle: 'Reading your website', loadingSub: 'Collecting public pages, source evidence and suggested questions.',
    loadingAria: 'Research in progress', loadingNote: 'You can refresh this page. Your research is saved locally.',
    interrupted: 'Connection interrupted', interruptedNote: 'Your saved research may still be running. Reload to reconnect.', reconnect: 'Reconnect',
    failTitle: "We couldn't finish the research", failNote: 'No usable website evidence was found. Try another public website.',
    retryOther: 'Try another website',
    reviewTitle: 'Review your first questions', reviewSub: 'Keep the questions you want to measure. No AI answers have been collected yet.',
    noDescription: 'No description was available on the collected pages.',
    sources: 'sources', topics: 'topics', partial: 'Partial research',
    suggested: 'Suggested prompts', selectAll: 'Select all', details: 'Research sources & limitations',
    modelProposal: 'Model-assisted proposal', template: 'Website-based template',
    accept: 'Create workspace with selected prompts →', useOther: 'Use another website',
    readyTitle: 'Your workspace is ready', readyNote: 'Website research is saved. AI visibility is still unmeasured. Open your workspace to configure a provider and collect your first real answers.',
    openWorkspace: 'Open workspace →', configure: 'Configure first API measurement',
    languageTag: 'English',
  },
  zh: {
    steps: ['信息', '研究', '问题', '完成'],
    aside: `<div class="eyebrow">你的品牌，出现在 AI 回答里</div><h1>从网站开始。<br>用证据构建。</h1><p>把公开页面变成品牌画像和一组聚焦的问题，作为第一次 AI 可见性基线。</p><ol class="benefits"><li><span>01</span><div><strong>研究你的网站</strong><p>采集首页与相关页面，并附上来源。</p></div></li><li><span>02</span><div><strong>审核问题</strong><p>选择哪些问题进入第一次测量。</p></div></li><li><span>03</span><div><strong>先测量，再行动</strong><p>先拿到真实回答，再下结论或规划改进。</p></div></li></ol><div class="local-note"><span class="live-dot"></span> 本地运行 · 中英双语</div>`,
    formTitle: '你的网站是？',
    formSub: '我们会用公开页面准备工作区。采集 AI 回答前，先审核建议问题。',
    urlLabel: '网站地址', language: '语言', market: '目标市场',
    useModel: '模型辅助研究（可选）', useModelNote: '用模型研究主题与买家问题',
    provider: '研究服务商', modelId: '研究模型 ID', apiKey: '研究 API Key',
    keyPlaceholder: '留空则使用本地已配置的服务商密钥',
    modelNote: '一次模型调用，最多 2,500 输出 token；服务商可能收费。不勾选时，研究只使用来源模板。',
    submit: '研究我的网站 →',
    formNote: '网址来源会自动采集。模型研究是可选项；两种方式都不会在真正采集回答前产生可见性数字。',
    loadingTitle: '正在读取网站', loadingSub: '正在采集公开页面、来源证据与建议问题。',
    loadingAria: '研究进行中', loadingNote: '可以刷新本页；研究结果保存在本地。',
    interrupted: '连接中断', interruptedNote: '已保存的研究可能仍在运行，重新加载即可恢复。', reconnect: '重新连接',
    failTitle: '研究没有完成', failNote: '没有取得可用的网站证据。请换一个公开网站再试。',
    retryOther: '换一个网站',
    reviewTitle: '审核你的第一批问题', reviewSub: '保留你想测量的问题。此时还没有采集任何 AI 回答。',
    noDescription: '采集到的页面没有可用描述。',
    sources: '个来源', topics: '个主题', partial: '部分完成',
    suggested: '建议问题', selectAll: '全选', details: '研究来源与限制',
    modelProposal: '模型提案', template: '网站模板',
    accept: '用选中的问题创建工作区 →', useOther: '换一个网站',
    readyTitle: '工作区已就绪', readyNote: '网站研究已保存。AI 可见性还没有测量；打开工作区配置服务商，采集第一批真实回答。',
    openWorkspace: '打开工作区 →', configure: '配置第一次 API 采集',
    languageTag: '中文',
  },
};
const t = () => copy[uiLang];
function applyAside() { $('#aside').innerHTML = t().aside; }
async function api(path, data) {
  const response = await fetch(path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
function progress(index) { $('#progress').innerHTML = t().steps.map((name,i)=>`<li class="${i === index ? 'current' : i < index ? 'done' : ''}" ${i===index?'aria-current="step"':''}>${i+1} · ${name}</li>`).join(''); }
function info(urlValue = '') {
  generation++; job = null; project = null; history.replaceState(null,'','/create-workspace'); progress(0); $('#error').textContent = '';
  const c = t();
  $('#content').innerHTML = `<h2>${c.formTitle}</h2><p class="subtle">${c.formSub}</p><form id="website-form"><label>${c.urlLabel}<input name="url" required maxlength="2048" autocomplete="url" placeholder="yourbrand.com" value="${escapeHtml(urlValue)}"></label><div class="row"><label>${c.language}<select name="language"><option value="en" ${uiLang==='en'?'selected':''}>English</option><option value="zh" ${uiLang==='zh'?'selected':''}>中文</option></select></label><label>${c.market}<select name="country"><option value="US">${uiLang==='zh'?'美国':'United States'}</option><option value="GB">${uiLang==='zh'?'英国':'United Kingdom'}</option><option value="CA">${uiLang==='zh'?'加拿大':'Canada'}</option><option value="AU">${uiLang==='zh'?'澳大利亚':'Australia'}</option><option value="CN" ${uiLang==='zh'?'selected':''}>${uiLang==='zh'?'中国':'China'}</option></select></label></div><details><summary>${c.useModel}</summary><label class="prompt"><input type="checkbox" name="useModel"><span>${c.useModelNote}</span></label><label>${c.provider}<select name="modelProvider"><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="perplexity">Perplexity</option><option value="gemini">Gemini</option><option value="anthropic">Anthropic</option></select></label><label>${c.modelId}<input name="modelId" maxlength="200" placeholder="An available model ID for your account"></label><label>${c.apiKey}<input name="modelKey" type="password" autocomplete="off" placeholder="${c.keyPlaceholder}"></label><p class="subtle">${c.modelNote}</p></details><button class="primary" type="submit">${c.submit}</button></form><div class="note">${c.formNote}</div>`;
  $('#website-form').elements.useModel.onchange = event => { $('#website-form').elements.modelId.required = event.target.checked; };
  $('#website-form').elements.language.onchange = event => { uiLang = event.target.value; applyAside(); info($('#website-form').elements.url.value); };
  $('#website-form').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true; $('#error').textContent = '';
    try {
      const values = Object.fromEntries(new FormData(event.target));
      job = await api('/api/researches', {url:values.url,language:values.language,country:values.country,requestId:`research-${crypto.randomUUID()}`, ...(values.useModel ? {modelConfig:{provider:values.modelProvider,model:values.modelId,apiKey:values.modelKey}} : {})});
      history.replaceState(null,'',`/create-workspace?research=${encodeURIComponent(job.id)}`); await resume(job.id);
    } catch(error) { $('#error').textContent = error.message; button.disabled = false; }
  };
}
async function resume(id) {
  const token = ++generation; progress(1); const c = t();
  $('#content').innerHTML = `<h2>${c.loadingTitle}</h2><p class="subtle">${c.loadingSub}</p><div class="loader" role="status" aria-label="${c.loadingAria}"></div><p class="subtle">${c.loadingNote}</p>`;
  try {
    while(token === generation) {
      job = await api(`/api/researches/${encodeURIComponent(id)}`);
      if (!['queued','running'].includes(job.status)) {
        if (job.projectId) { project = await api(`/api/projects/${encodeURIComponent(job.projectId)}`); ready(); return; }
        review(); return;
      }
      await new Promise(resolve => setTimeout(resolve,900));
    }
  } catch(error) {
    if(token !== generation) return;
    $('#error').textContent = error.message;
    $('#content').innerHTML = `<h2>${c.interrupted}</h2><p class="subtle">${c.interruptedNote}</p><button class="secondary" id="retry">${c.reconnect}</button>`;
    $('#retry').onclick = () => { $('#error').textContent=''; resume(id); };
  }
}
function review() {
  const result = job.result, c = t();
  if (!result?.profile || !['completed','partial'].includes(job.status)) {
    const reasons = (result?.attempts || []).filter(a => a.status === 'failed').map(a => a.reason).filter(Boolean);
    progress(1);
    $('#content').innerHTML = `<h2>${c.failTitle}</h2><p class="subtle">${escapeHtml(job.error || c.failNote)}</p>${reasons.length?`<ul class="subtle">${reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`:''}<button class="secondary" id="start-over">${c.retryOther}</button>`;
    $('#start-over').onclick=()=>info(); return;
  }
  progress(2); selected = new Set(result.prompts.map(p=>p.id));
  $('#content').innerHTML = `<h2>${c.reviewTitle}</h2><p class="subtle">${c.reviewSub}</p><div class="profile"><h3>${escapeHtml(result.profile.brand)}</h3><p>${escapeHtml(result.profile.description || c.noDescription)}</p></div><div class="summary"><span class="tag">${c.languageTag} · ${escapeHtml(result.country)}</span><span class="tag">${result.sources.length} ${c.sources}</span><span class="tag">${result.topics.length} ${c.topics}</span>${job.status==='partial'?`<span class="tag">${c.partial}</span>`:''}</div><div class="button-row"><h3>${c.suggested}</h3><button class="text-button" id="select-all">${c.selectAll}</button></div><div id="prompts">${result.prompts.map(p=>`<label class="prompt"><input type="checkbox" data-prompt="${escapeHtml(p.id)}" checked><span>${escapeHtml(p.text)}<small>${escapeHtml(result.topics.find(t=>t.id===p.topicId)?.name || p.intent)} · ${p.origin === 'model-assisted' ? c.modelProposal : c.template}</small></span></label>`).join('')}</div><details><summary>${c.details}</summary>${result.sources.map(s=>`<a class="source" href="${link(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)} ↗</a>`).join('')}<ul>${result.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></details><button class="primary" id="accept">${c.accept}</button><button class="secondary" id="start-over">${c.useOther}</button>`;
  $('#start-over').onclick = info;
  $('#select-all').onclick = () => { document.querySelectorAll('[data-prompt]').forEach(input=>{input.checked=true;selected.add(input.dataset.prompt);}); };
  $('#prompts').onchange = event => { const id=event.target.dataset.prompt;if(id) event.target.checked?selected.add(id):selected.delete(id); };
  $('#accept').onclick = async event => {
    const button=event.currentTarget;button.disabled=true;$('#error').textContent='';
    try { if(!selected.size) throw new Error(uiLang==='zh'?'至少选择一个建议问题。':'Select at least one prompt.');project=await api(`/api/researches/${job.id}/accept`,{selectedPromptIds:[...selected]});ready(); }
    catch(error){$('#error').textContent=error.message;button.disabled=false;}
  };
}
function ready() {
  const c=t(); progress(3);$('#error').textContent='';
  $('#content').innerHTML=`<div class="check" aria-hidden="true">✓</div><h2>${c.readyTitle}</h2><p class="subtle">${escapeHtml(project.brand)} · ${project.queries.filter(q=>q.status==='active').length} ${uiLang==='zh'?'个启用问题':'active prompts'} · ${c.languageTag} / ${escapeHtml(project.country)}</p><div class="note">${c.readyNote}</div><a class="primary" href="/workspace?project=${encodeURIComponent(project.id)}">${c.openWorkspace}</a><a class="secondary" href="/workspace?project=${encodeURIComponent(project.id)}&view=agent">${c.configure}</a>`;
}
applyAside();
const saved = new URLSearchParams(location.search).get('research');
if(saved && /^research-[a-zA-Z0-9-]{1,80}$/.test(saved)) resume(saved);else info();
