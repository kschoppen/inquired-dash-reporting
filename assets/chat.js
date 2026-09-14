(function () {
  'use strict';
  if (window.__iqChat) return;
  window.__iqChat = true;

  var ENDPOINT = '/.netlify/functions/chat';
  var history  = [];
  var isOpen   = false;
  var loading  = false;

  function currentTabLabel() {
    var active = document.querySelector('.tabs-btns button.active');
    return (active && active.textContent) || document.title || '';
  }

  /* ── Styles ── */
  var s = document.createElement('style');
  s.textContent = [
    '#iq-cb{position:fixed;bottom:24px;right:24px;z-index:9100;width:52px;height:52px;border-radius:50%;background:#B1E0BB;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.22);transition:background .15s,transform .15s;}',
    '#iq-cb:hover{background:#9ED4A9;transform:scale(1.06);}',
    '#iq-cp{position:fixed;bottom:88px;right:24px;z-index:9100;width:360px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;font-family:"Lato",sans-serif;transform:translateY(16px) scale(.97);opacity:0;pointer-events:none;transition:transform .2s ease,opacity .2s ease;max-height:520px;}',
    '#iq-cp.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all;}',
    '#iq-ch{background:#144745;color:#fff;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}',
    '#iq-ch-l{display:flex;align-items:center;gap:9px;}',
    '.iq-av{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}',
    '.iq-t1{font-size:13px;font-weight:900;letter-spacing:.02em;}',
    '.iq-t2{font-size:10px;color:rgba(255,255,255,.60);font-weight:700;margin-top:1px;}',
    '#iq-cx{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.65);padding:4px;border-radius:4px;display:flex;align-items:center;transition:color .15s,background .15s;}',
    '#iq-cx:hover{color:#fff;background:rgba(255,255,255,.12);}',
    '#iq-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;min-height:260px;max-height:340px;}',
    '.iq-m{max-width:86%;font-size:13px;line-height:1.55;padding:9px 12px;border-radius:12px;word-break:break-word;}',
    '.iq-m.u{align-self:flex-end;background:#144745;color:#fff;border-bottom-right-radius:3px;}',
    '.iq-m.a{align-self:flex-start;background:#F4F4F4;color:#1A1A1A;border-bottom-left-radius:3px;}',
    '.iq-m.a ul,.iq-m.a ol{padding-left:16px;margin:4px 0;}.iq-m.a li{margin:2px 0;}.iq-m.a strong{font-weight:700;}',
    '.iq-welcome{text-align:center;padding:22px 8px;color:#878787;font-size:12px;line-height:1.55;}',
    '.iq-welcome strong{display:block;color:#1A1A1A;font-size:13px;font-weight:900;margin-bottom:4px;}',
    '.iq-ld{align-self:flex-start;padding:10px 14px;background:#F4F4F4;border-radius:12px;border-bottom-left-radius:3px;}',
    '.iq-dots{display:flex;gap:4px;}.iq-dots span{width:6px;height:6px;background:#144745;border-radius:50%;animation:iqB 1.2s infinite;}',
    '.iq-dots span:nth-child(2){animation-delay:.2s;}.iq-dots span:nth-child(3){animation-delay:.4s;}',
    '@keyframes iqB{0%,80%,100%{transform:translateY(0);opacity:.35;}40%{transform:translateY(-6px);opacity:1;}}',
    '#iq-ft{border-top:1px solid #E2E2E2;padding:10px 12px;display:flex;align-items:flex-end;gap:8px;flex-shrink:0;}',
    '#iq-in{flex:1;border:1px solid #E2E2E2;border-radius:8px;padding:8px 10px;font-family:"Lato",sans-serif;font-size:13px;color:#1A1A1A;resize:none;outline:none;min-height:36px;max-height:100px;line-height:1.45;transition:border-color .15s;}',
    '#iq-in:focus{border-color:#144745;}#iq-in::placeholder{color:#B0B0B0;}',
    '#iq-sd{width:36px;height:36px;border-radius:8px;background:#144745;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}',
    '#iq-sd:hover{background:#0E3332;}#iq-sd:disabled{background:#D0D0D0;cursor:default;}',
    '@media(max-width:480px){#iq-cp{width:calc(100vw - 24px);right:12px;bottom:80px;}}'
  ].join('');
  document.head.appendChild(s);

  /* ── DOM ── */
  var btn = document.createElement('button');
  btn.id = 'iq-cb';
  btn.setAttribute('aria-label', 'Open Dash assistant');
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#144745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.id = 'iq-cp';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Dash Assistant');
  panel.innerHTML =
    '<div id="iq-ch">' +
      '<div id="iq-ch-l">' +
        '<div class="iq-av">✦</div>' +
        '<div><div class="iq-t1">Dash Assistant</div><div class="iq-t2">Powered by Claude</div></div>' +
      '</div>' +
      '<button id="iq-cx" aria-label="Close">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>' +
    '<div id="iq-msgs">' +
      '<div class="iq-welcome"><strong>Ask about the dashboard</strong>Funnel, revenue, win rate, campaigns — I can help you find it fast.</div>' +
    '</div>' +
    '<div id="iq-ft">' +
      '<textarea id="iq-in" placeholder="Ask about this data…" rows="1"></textarea>' +
      '<button id="iq-sd" aria-label="Send">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
      '</button>' +
    '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var msgs = document.getElementById('iq-msgs');
  var inp  = document.getElementById('iq-in');
  var snd  = document.getElementById('iq-sd');

  /* ── Helpers ── */
  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) inp.focus();
  }

  function scroll() { msgs.scrollTop = msgs.scrollHeight; }

  function md(text) {
    // Minimal markdown: bold, bullets, line breaks
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/^[ \t]*[-•]\s+(.+)$/gm,'<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>')
      .replace(/\n/g,'<br>');
  }

  function addMsg(role, text) {
    var w = msgs.querySelector('.iq-welcome');
    if (w) w.remove();
    var d = document.createElement('div');
    d.className = 'iq-m ' + (role === 'user' ? 'u' : 'a');
    if (role === 'assistant') d.innerHTML = md(text);
    else d.textContent = text;
    msgs.appendChild(d);
    scroll();
  }

  function showLoader() {
    var d = document.createElement('div');
    d.className = 'iq-ld'; d.id = 'iq-ld';
    d.innerHTML = '<div class="iq-dots"><span></span><span></span><span></span></div>';
    msgs.appendChild(d); scroll();
  }

  function hideLoader() { var el = document.getElementById('iq-ld'); if (el) el.remove(); }

  /* ── Send ── */
  function send() {
    var text = inp.value.trim();
    if (!text || loading) return;
    loading = true;
    snd.disabled = true;
    inp.value = '';
    inp.style.height = 'auto';
    addMsg('user', text);
    showLoader();

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, pageTitle: currentTabLabel(), history: history.slice(-10) })
    })
    .then(function(r) {
      hideLoader();
      if (!r.ok) { addMsg('assistant', 'Something went wrong — please try again.'); return; }
      return r.json().then(function(d) {
        var reply = d.reply || 'No response received.';
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: reply });
        addMsg('assistant', reply);
      });
    })
    .catch(function() {
      hideLoader();
      addMsg('assistant', 'Connection error — please check your network.');
    })
    .finally(function() {
      loading = false;
      snd.disabled = false;
      inp.focus();
    });
  }

  /* ── Events ── */
  btn.addEventListener('click', toggle);
  document.getElementById('iq-cx').addEventListener('click', toggle);
  snd.addEventListener('click', send);
  inp.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  inp.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 100) + 'px'; });
  document.addEventListener('click', function(e) { if (isOpen && !panel.contains(e.target) && !btn.contains(e.target)) toggle(); });
})();
