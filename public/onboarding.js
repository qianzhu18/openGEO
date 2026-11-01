const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = url => { try { const value = new URL(url); return ['https:', 'http:'].includes(value.protocol) ? escapeHtml(value.href) : '#'; } catch { return '#'; } };
let job = null, selected = new Set(), project = null, generation = 0;
async function api(path, data) {
  const response = await fetch(path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
function progress(index) { $('#progress').innerHTML = ['Info','Research','Prompts','Ready'].map((name,i)=>`<li class="${i === index ? 'current' : i < index ? 'done' : ''}" ${i===index?'aria-current="step"':''}>${i+1} · ${name}</li>`).join(''); }
function info() {
  generation++; job = null; project = null; history.replaceState(null,'','/create-workspace'); progress(0); $('#error').textContent = '';
  $('#content').innerHTML = `<h2>What's your website?</h2><p class="subtle">We'll use your public pages to prepare your workspace. Review the suggestions before collecting AI answers.</p><form id="website-form"><label>Website URL<input name="url" required maxlength="2048" autocomplete="url" placeholder="yourbrand.com"></label><div class="row"><label>Language<select name="language"><option value="en">English</option></select></label><label>Target market<select name="country"><option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label></div><details><summary>Model-assisted research (optional)</summary><label class="prompt"><input type="checkbox" name="useModel"><span>Use a model to research topics and buyer questions</span></label><label>Research provider<select name="modelProvider"><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="perplexity">Perplexity</option><option value="gemini">Gemini</option><option value="anthropic">Anthropic</option></select></label><label>Research model ID<input name="modelId" maxlength="200" placeholder="An available model ID for your account"></label><label>Research API key<input name="modelKey" type="password" autocomplete="off" placeholder="Leave blank to use the local provider configuration"></label><p class="subtle">One model operation, up to 2,500 output tokens. Your provider may charge for it. Without this option, research uses source-based templates.</p></details><button class="primary" type="submit">Research my website →</button></form><div class="note">Website sources are collected automatically. Model research is optional; neither path measures AI visibility until you collect real answers.</div>`;
  $('#website-form').elements.useModel.onchange = event => { $('#website-form').elements.modelId.required = event.target.checked; };
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
  const token = ++generation; progress(1);
  $('#content').innerHTML = '<h2>Reading your website</h2><p class="subtle">Collecting public pages, source evidence and suggested questions.</p><div class="loader" role="status" aria-label="Research in progress"></div><p class="subtle">You can refresh this page. Your research is saved locally.</p>';
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
    $('#content').innerHTML = '<h2>Connection interrupted</h2><p class="subtle">Your saved research may still be running. Reload to reconnect.</p><button class="secondary" id="retry">Reconnect</button>';
    $('#retry').onclick = () => { $('#error').textContent=''; resume(id); };
  }
}
function review() {
  const result = job.result;
  if (!result?.profile || !['completed','partial'].includes(job.status)) {
    progress(1); $('#content').innerHTML = `<h2>We couldn't finish the research</h2><p class="subtle">${escapeHtml(job.error || 'No usable website evidence was found. Try another public website.')}</p><button class="secondary" id="start-over">Try another website</button>`; $('#start-over').onclick=info; return;
  }
  progress(2); selected = new Set(result.prompts.map(p=>p.id));
  $('#content').innerHTML = `<h2>Review your first questions</h2><p class="subtle">Keep the questions you want to measure. No AI answers have been collected yet.</p><div class="profile"><h3>${escapeHtml(result.profile.brand)}</h3><p>${escapeHtml(result.profile.description || 'No description was available on the collected pages.')}</p></div><div class="summary"><span class="tag">English · ${escapeHtml(result.country)}</span><span class="tag">${result.sources.length} sources</span><span class="tag">${result.topics.length} topics</span>${job.status==='partial'?'<span class="tag">Partial research</span>':''}</div><div class="button-row"><h3>Suggested prompts</h3><button class="text-button" id="select-all">Select all</button></div><div id="prompts">${result.prompts.map(p=>`<label class="prompt"><input type="checkbox" data-prompt="${escapeHtml(p.id)}" checked><span>${escapeHtml(p.text)}<small>${escapeHtml(result.topics.find(t=>t.id===p.topicId)?.name || p.intent)} · ${p.origin === 'model-assisted' ? 'Model-assisted proposal' : 'Website-based template'}</small></span></label>`).join('')}</div><details><summary>Research sources & limitations</summary>${result.sources.map(s=>`<a class="source" href="${link(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)} ↗</a>`).join('')}<ul>${result.warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></details><button class="primary" id="accept">Create workspace with selected prompts →</button><button class="secondary" id="start-over">Use another website</button>`;
  $('#start-over').onclick = info;
  $('#select-all').onclick = () => { document.querySelectorAll('[data-prompt]').forEach(input=>{input.checked=true;selected.add(input.dataset.prompt);}); };
  $('#prompts').onchange = event => { const id=event.target.dataset.prompt;if(id) event.target.checked?selected.add(id):selected.delete(id); };
  $('#accept').onclick = async event => {
    const button=event.currentTarget;button.disabled=true;$('#error').textContent='';
    try { if(!selected.size) throw new Error('Select at least one prompt.');project=await api(`/api/researches/${job.id}/accept`,{selectedPromptIds:[...selected]});ready(); }
    catch(error){$('#error').textContent=error.message;button.disabled=false;}
  };
}
function ready() {
  progress(3);$('#error').textContent='';
  $('#content').innerHTML=`<div class="check" aria-hidden="true">✓</div><h2>Your workspace is ready</h2><p class="subtle">${escapeHtml(project.brand)} · ${project.queries.filter(q=>q.status==='active').length} active prompts · English / ${escapeHtml(project.country)}</p><div class="note">Website research is saved. AI visibility is still unmeasured. Open your workspace to configure a provider and collect your first real answers.</div><a class="primary" href="/workspace?project=${encodeURIComponent(project.id)}">Open workspace →</a><a class="secondary" href="/workspace?project=${encodeURIComponent(project.id)}&view=agent">Configure first API measurement</a>`;
}
const saved = new URLSearchParams(location.search).get('research');
if(saved && /^research-[a-zA-Z0-9-]{1,80}$/.test(saved)) resume(saved);else info();
