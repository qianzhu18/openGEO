/** Plain page-context JS; no Playwright, cookies, bearer-token extraction, or private API replay. */
export function chatgptScript(action: 'auth' | 'prepare' | 'inject' | 'read' | 'clear-draft' | 'arm' | 'disarm', input: { prompt?: string; marker?: string } = {}): string {
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
        const response = await fetch('/api/auth/session', {signal:AbortSignal.timeout(12000), redirect:'error'});
        if (!response.ok) return output({authenticated:false});
        const session = await response.json();
        const expires = session.expires == null ? null : Date.parse(session.expires);
        const fresh = expires === null || expires > Date.now();
        return output({authenticated:!!session.user && !session.error && fresh});
      } catch { return output({authenticated:false}); }
    }
    const normalize = value => String(value || '').replace(/\s+/g,' ').trim();
    const user = [...document.querySelectorAll('[data-message-author-role="user"], [class*="group/user-message"]')].at(-1);
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"], [class*="MarkdownRoot"]')].filter(el => !el.closest('[class*="group/user-message"]') && normalize(el.innerText) && normalize(el.innerText) !== normalize(user?.innerText));
    // 2026-11-06 Xue: the composer is a ProseMirror textbox, not #prompt-textarea. Old selectors stay as fallback.
    const composer = first('[role="textbox"][contenteditable="true"], #prompt-textarea, textarea[data-id]');
    const sendButton = () => {
      const send = first('[data-testid="send-button"], button[aria-label="发送"], button[aria-label="发送提示"], button[aria-label="Send"], button[aria-label="Send prompt"]');
      if (send) send.setAttribute('data-opengeo-send', '1');
      return send;
    };
    if (action === 'prepare') {
      if (!composer) return output({error:'composer_missing'});
      if (messages.length || user) return output({error:'not_fresh_chat'});
      const draft = normalize(composer.innerText || composer.value);
      if (draft && draft !== normalize(input.prompt || '')) return output({error:'not_fresh_chat'});
      const guard = {interrupted:false};
      window.__opengeoGuard = guard;
      for (const event of ['pointerdown','keydown','wheel','paste']) {
        document.addEventListener(event, e => {
          if (!e.isTrusted || guard.sending) return;
          const target = e.target && e.target.closest ? e.target.closest('[data-opengeo-send], button[aria-label="发送"], button[aria-label="发送提示"], button[aria-label="Send"], button[aria-label="Send prompt"]') : null;
          if (target) return;
          guard.interrupted = true;
        }, {capture:true, once:false});
      }
      return output({ready:true});
    }
    if (action === 'clear-draft') {
      if (messages.length || user) return output({error:'not_fresh_chat'});
      if (composer) {
        composer.focus();
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false, null);
      }
      return output({cleared:true});
    }
    if (action === 'arm' || action === 'disarm') {
      if (!window.__opengeoGuard) return output({error:'page_reloaded'});
      window.__opengeoGuard.sending = action === 'arm';
      return output({sending: action === 'arm'});
    }
    if (window.__opengeoGuard?.interrupted) return output({error:'user_interrupted'});
    if (!window.__opengeoGuard) return output({error:'page_reloaded'});
    const alerts = [...document.querySelectorAll('[role="alert"], [data-testid*="error"]')].filter(visible);
    if (alerts.some(el => /limit|try again later|too many|限制|稍后重试|达到上限/i.test(el.innerText))) return output({error:'rate_limited'});
    if (action === 'inject') {
      if (!composer) return output({error:'composer_missing'});
      const prompt = String(input.prompt || '');
      composer.focus();
      if (composer.tagName === 'TEXTAREA') {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        set?.call(composer, prompt);
        composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
      } else {
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, prompt);
      }
      const inserted = normalize(composer.innerText || composer.value) === normalize(prompt);
      if (!inserted) return output({error:'inject_failed'});
      const send = sendButton();
      return output({inserted:true, sendReady:!!send && !send.disabled});
    }
    if (!user || normalize(user.innerText) !== normalize(input.prompt)) {
      const send = sendButton();
      return output({answer:'', complete:false, sendReady:!!send && !send.disabled && normalize(composer?.innerText || composer?.value) === normalize(input.prompt)});
    }
    const last = messages.at(-1);
    if (!last) return output({answer:'', complete:false});
    // The assistant must follow this exact user message in DOM order.
    if (!(user.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) return output({error:'stale_answer'});
    const answer = last.innerText.trim();
    // 2026-11-06 Xue: assistant「复制」sits beside MarkdownRoot. Their common parent also
    // contains the user turn, so walking ancestors never isolates it. Take a visible
    // copy control that follows this answer and is outside the user message. A hidden
    // control still does not count; a page with no copy control can finish on stop-gone.
    const copySelector = '[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="复制"], button[aria-label="复制回答"]';
    const assistantCopy = [...document.querySelectorAll(copySelector)].filter(visible).find(button => {
      if (button.closest('[class*="group/user-message"], [data-message-author-role="user"]')) return false;
      return !!(last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    const busy = !!first('[data-testid="stop-button"], button[aria-label="停止"], button[aria-label*="Stop generating" i], button[aria-label*="停止生成"]');
    const noCopyControl = !document.querySelector(copySelector);
    const complete = !!answer && !busy && (!!assistantCopy || noCopyControl);
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
