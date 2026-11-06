/** Plain page-context JS; no Playwright, cookies, bearer-token extraction, or private API replay. */
export function chatgptScript(action: 'auth' | 'prepare' | 'read', input: { prompt?: string; marker?: string } = {}): string {
  return String.raw`(async () => {
    const action = ${JSON.stringify(action)}, input = ${JSON.stringify(input)};
    const visible = el => !!el && !!(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
    const first = selector => [...document.querySelectorAll(selector)].find(visible);
    const output = value => JSON.stringify(value);
    if (location.origin !== 'https://chatgpt.com') return output({error:'unexpected_page'});
    if (/just a moment|attention required|verify you are human/i.test(document.title)
      || first('iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]')) return output({error:'challenge'});
    const wall = first('[role="dialog"]');
    if (wall && /log in|sign in|登录|登入/i.test(wall.innerText)) return output({error:'not_logged_in'});
    if (action === 'auth') {
      try {
        // Only return a boolean; identity, tokens and the response body never leave this page.
        const response = await fetch('/api/auth/session', {signal:AbortSignal.timeout(8000), redirect:'error'});
        if (!response.ok) return output({authenticated:false});
        const session = await response.json();
        return output({authenticated:!!session.user && !session.error && Date.parse(session.expires) > Date.now()});
      } catch { return output({authenticated:false}); }
    }
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const user = [...document.querySelectorAll('[data-message-author-role="user"]')].at(-1);
    const composer = first('#prompt-textarea, textarea[data-id]');
    if (action === 'prepare') {
      if (!composer) return output({error:'composer_missing'});
      if ((composer.innerText || composer.value || '').trim() || messages.length || user) return output({error:'not_fresh_chat'});
      const guard = {interrupted:false};
      window.__opengeoGuard = guard;
      for (const event of ['pointerdown','keydown','wheel','paste']) {
        document.addEventListener(event, e => { if (e.isTrusted) guard.interrupted = true; }, {capture:true, once:false});
      }
      return output({ready:true});
    }
    if (window.__opengeoGuard?.interrupted) return output({error:'user_interrupted'});
    if (!window.__opengeoGuard) return output({error:'page_reloaded'});
    const alerts = [...document.querySelectorAll('[role="alert"], [data-testid*="error"]')].filter(visible);
    if (alerts.some(el => /limit|try again later|too many|限制|稍后重试|达到上限/i.test(el.innerText))) return output({error:'rate_limited'});
    const normalize = value => String(value || '').replace(/\s+/g,' ').trim();
    if (!user || normalize(user.innerText) !== normalize(input.prompt)) {
      const send = first('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]');
      return output({answer:'', complete:false, sendReady:!!send && !send.disabled && normalize(composer?.innerText || composer?.value) === normalize(input.prompt)});
    }
    const last = messages.at(-1);
    if (!last) return output({answer:'', complete:false});
    // The assistant must follow this exact user message in DOM order.
    if (!(user.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) return output({error:'stale_answer'});
    const answer = last.innerText.trim();
    const turn = last.closest('[data-testid^="conversation-turn-"], article') || last.parentElement;
    const busy = !!first('[data-testid="stop-button"], button[aria-label*="Stop generating" i], button[aria-label*="停止生成"]');
    const complete = !!answer && !busy && !![...turn.querySelectorAll('[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="复制"]')].find(visible);
    const safeUrl = value => {
      try {
        const url = new URL(value);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password
          || [...url.searchParams.keys()].some(key => /token|secret|password|authorization|api.?key/i.test(key))) return null;
        return url.href;
      } catch { return null; }
    };
    const citations = [...new Set([...last.querySelectorAll('a[href]')].map(a => safeUrl(a.href)).filter(Boolean))];
    const clone = last.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,iframe,input,textarea,form,button,svg,img').forEach(el => el.remove());
    for (const element of [clone, ...clone.querySelectorAll('*')]) {
      for (const attribute of [...element.attributes]) {
        if (attribute.name !== 'href') element.removeAttribute(attribute.name);
      }
      if (element.hasAttribute('href')) {
        const url = safeUrl(element.getAttribute('href'));
        if (url) element.setAttribute('href', url); else element.removeAttribute('href');
      }
    }
    if (input.marker) last.setAttribute('data-opengeo-evidence', input.marker);
    return output({answer, complete, citations, url:location.href, html:'<!doctype html><meta charset="utf-8"><title>OpenGEO answer evidence</title>' + clone.outerHTML});
  })()`;
}
