// Delegated interactions survive workspace rerenders without retaining stale nodes.
let tip, activePoint;
const text = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
function hide() { tip?.remove(); tip = null; activePoint?.removeAttribute('aria-describedby'); activePoint = null; }
function positionTip() {
  if (!tip || !activePoint) return;
  const rect = activePoint.getBoundingClientRect(), box = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(12, Math.min(innerWidth - box.width - 12, rect.left))}px`;
  tip.style.top = `${rect.top > box.height + 16 ? rect.top - box.height - 8 : Math.min(innerHeight - box.height - 12, rect.bottom + 8)}px`;
}
function show(point) {
  hide();
  let data;
  try { data = JSON.parse(point.dataset.chartPoint); } catch { return; }
  activePoint = point;
  tip = document.createElement('div'); tip.className = 'da-chart-tip'; tip.id = 'chart-tooltip'; tip.role = 'tooltip';
  tip.append(text('strong', data.label), text('span', `${data.day} · ${data.value} (${data.ratio})`));
  if (data.hint) tip.append(text('span', data.hint));
  document.body.append(tip); point.setAttribute('aria-describedby', tip.id);
  positionTip();
}
document.addEventListener('pointerover', event => { const point = event.target.closest('[data-chart-point]'); if (point && !point.contains(event.relatedTarget)) show(point); });
document.addEventListener('pointerout', event => { if (activePoint && activePoint.contains(event.target) && !activePoint.contains(event.relatedTarget) && activePoint !== document.activeElement) hide(); });
document.addEventListener('focusin', event => { const point = event.target.closest('[data-chart-point]'); if (point) show(point); });
document.addEventListener('focusout', hide);
// Focusing an SVG point may scroll it into view after focusin. Keep its keyboard
// description anchored through that scroll; pointer-only tooltips still dismiss.
document.addEventListener('scroll', () => {
  if (activePoint === document.activeElement) positionTip(); else hide();
}, { capture: true, passive: true });
window.addEventListener('resize', hide);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hide();
  const point = event.target.closest('g[data-chart-point]');
  if (point && ['Enter', ' '].includes(event.key)) { event.preventDefault(); point.dispatchEvent(new MouseEvent('click', { bubbles: true })); hide(); }
});
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-series-toggle]');
  if (!toggle) { hide(); return; }
  const shown = toggle.getAttribute('aria-pressed') !== 'true'; toggle.setAttribute('aria-pressed', String(shown));
  toggle.closest('.da-chart-region').querySelectorAll(`[data-series="${toggle.dataset.seriesToggle}"]`).forEach(series => series.dataset.hidden = String(!shown));
});
// A filtered / changed run must not leave a tooltip describing an old value.
new MutationObserver(() => { if (activePoint && !activePoint.isConnected) hide(); }).observe(document.body, { childList: true, subtree: true });

function highlight(target, active) {
  const index = target?.dataset.seriesToggle ?? target?.dataset.series ?? target?.dataset.cohortIndex;
  const diagnostic = target?.closest('.diagnostic');
  if (index === undefined || !diagnostic) return;
  diagnostic.querySelectorAll('.chart-series').forEach(series => series.classList.toggle('is-dimmed', active && series.dataset.series !== index));
  diagnostic.querySelectorAll('[data-cohort-index]').forEach(row => row.classList.toggle('is-highlighted', active && row.dataset.cohortIndex === index));
}
const highlightTarget = target => target.closest('[data-series-toggle],.chart-series,[data-cohort-index]');
document.addEventListener('pointerover', event => { const target = highlightTarget(event.target); if (target && !target.contains(event.relatedTarget)) highlight(target, true); });
document.addEventListener('pointerout', event => { const target = highlightTarget(event.target); if (target && !target.contains(event.relatedTarget)) highlight(target, false); });
document.addEventListener('focusin', event => highlight(highlightTarget(event.target), true));
document.addEventListener('focusout', event => highlight(highlightTarget(event.target), false));
