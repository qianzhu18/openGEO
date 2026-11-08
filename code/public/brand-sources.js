const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
export function brandSourceForm(project, english = false) {
  const t = (zh, en) => english ? en : zh;
  const button = english ? 'button primary' : 'btn primary';
  return `<section class="panel section-gap"><div class="panel-head"><h2>${t('补充品牌资料', 'Add brand sources')}</h2></div><div class="panel-body">
    <p>${t('导入官网、粘贴原文或上传文字 PDF。来源默认待核对，不自动变成产品事实。', 'Import public website text, pasted material or a text PDF. Sources require review before reuse as facts.')}</p>
    <form data-brand-source data-project="${escapeText(project.id)}" class="form-grid">
      <label>${t('资料类型', 'Source type')}<select name="kind"><option value="text">${t('粘贴原文', 'Pasted text')}</option><option value="website">${t('官网网址', 'Public website')}</option><option value="pdf">PDF</option></select></label>
      <div data-source-kind="text"><label>${t('资料标题', 'Source title')}<input name="title" maxlength="200"></label><label>${t('资料原文', 'Source text')}<textarea name="text" rows="5" maxlength="100000"></textarea></label></div>
      <div data-source-kind="website" hidden><label>${t('公开网址', 'Public URL')}<input name="url" type="url" placeholder="https://"></label></div>
      <div data-source-kind="pdf" hidden><label>${t('文字 PDF（最多 1MB、40 页）', 'Text PDF (up to 1MB, 40 pages)')}<input name="file" type="file" accept="application/pdf,.pdf"></label><p>${t('扫描件 OCR 未实现；表格、型号和单位请对照原件核对。', 'OCR is not available. Check tables, model names and units against the original file.')}</p></div>
      <p role="status" data-source-status></p><button class="${button}" type="submit">${t('导入来源', 'Import source')}</button>
    </form>
    <details class="section-gap"><summary>${t('从来源录入一项事实', 'Add a fact from a source')}</summary>
      <form data-brand-claim data-project="${escapeText(project.id)}" class="form-grid"><label>${t('原文来源／页码', 'Source / page')}<select name="sourceId" required>${project.sources.map(source => `<option value="${escapeText(source.id)}">${escapeText(source.title)}</option>`).join('')}</select></label><label>${t('事实名称（建议包含型号与属性）', 'Fact label (include model and attribute)')}<input name="label" required maxlength="120"></label><label>${t('复制一段原文（不能改写）', 'Exact source excerpt (no rewriting)')}<textarea name="value" rows="3" required maxlength="2000"></textarea></label><p role="status" data-source-status></p><button class="${button}" type="submit">${t('录入待确认事实', 'Add fact for review')}</button></form>
    </details></div></section>`;
}
document.addEventListener('change', event => {
  if (event.target.name !== 'kind' || !event.target.closest('[data-brand-source]')) return;
  event.target.form.querySelectorAll('[data-source-kind]').forEach(section => { section.hidden = section.dataset.sourceKind !== event.target.value; });
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('[data-brand-source], [data-brand-claim]')) return;
  event.preventDefault();
  const button = form.querySelector('button[type=submit]'), status = form.querySelector('[data-source-status]');
  const english = location.pathname === '/workspace';
  button.disabled = true; status.textContent = english ? 'Importing…' : '正在导入…';
  try {
    const data = new FormData(form), payload = Object.fromEntries([...data].filter(([key]) => key !== 'file'));
    if (payload.kind === 'pdf') {
      const file = data.get('file');
      if (!file?.size || file.size > 1_000_000) throw new Error(english ? 'Select a PDF up to 1MB.' : '请选择不超过 1MB 的 PDF');
      payload.fileName = file.name;
      payload.base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('File read failed')); reader.readAsDataURL(file); });
    }
    const resource = form.hasAttribute('data-brand-claim') ? 'brand-claims' : 'brand-sources';
    const response = await fetch(`/api/projects/${encodeURIComponent(form.dataset.project)}/${resource}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Import failed');
    document.dispatchEvent(new CustomEvent('brand-sources-updated', { detail: result.project }));
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
