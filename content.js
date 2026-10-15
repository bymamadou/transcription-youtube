/* Boost Arc : bouton « Transcription » sur les vidéos YouTube */
(() => {
  const ytxRun = async () => {
  const ID = 'ytx-transcript-box';
  document.getElementById(ID)?.remove();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SEG = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e[k] = v;
    }
    for (const c of kids) if (c != null) e.append(c);
    return e;
  };
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const fmt = ms => {
    const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
  };

  const C = { bg: '#14161c', panel: '#1c1f27', line: '#2e3340', fg: '#eef0f4', dim: '#9aa1b0', acc: '#ffd23f' };
  const btnCss = 'all:unset;cursor:pointer;padding:7px 12px;border-radius:8px;font:600 13px/1 system-ui,sans-serif;';
  const status = el('div', { style: 'color:' + C.dim + ';font:13px/1.4 system-ui,sans-serif;' }, 'Récupération de la transcription…');
  const body = el('div', { style: 'flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;' }, status);
  const close = el('button', { style: btnCss + 'color:' + C.dim + ';font-size:18px;padding:4px 8px;', title: 'Fermer', onclick: () => box.remove() }, '×');
  const box = el('div', {
    id: ID,
    style: 'position:fixed;top:72px;right:16px;width:min(440px,calc(100vw - 32px));height:min(640px,calc(100vh - 96px));z-index:2147483647;background:' + C.bg + ';color:' + C.fg + ';border:1px solid ' + C.line + ';border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:12px;padding:14px;box-sizing:border-box;'
  },
    el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;' },
      el('div', { style: 'font:700 14px/1.2 system-ui,sans-serif;letter-spacing:.02em;' },
        el('span', { style: 'background:' + C.acc + ';color:#111;padding:2px 6px;border-radius:4px;margin-right:8px;font-size:11px;' }, 'CC'),
        'Transcription'),
      close),
    body);
  document.body.append(box);

  const fail = msg => { status.textContent = msg; status.style.color = '#ff8a8a'; };

  if (!/(^|\.)youtube\.com$/.test(location.hostname) || !/^\/(watch|shorts\/)/.test(location.pathname)) {
    fail("Ouvre d'abord une vidéo sur youtube.com, puis clique à nouveau sur le favori.");
    return;
  }
  const vid = new URLSearchParams(location.search).get('v') || location.pathname.split('/')[2];

  async function viaTracks() {
    let pr;
    try { pr = document.getElementById('movie_player')?.getPlayerResponse?.(); } catch (e) {}
    if (!pr || pr.videoDetails?.videoId !== vid) pr = window.ytInitialPlayerResponse;
    if (!pr || pr.videoDetails?.videoId !== vid) {
      try {
        const html = await (await fetch('/watch?v=' + vid, { credentials: 'include' })).text();
        const k = html.indexOf('ytInitialPlayerResponse = {');
        if (k > -1) {
          let i = html.indexOf('{', k), d = 0, q = false, esc = false, j = i;
          for (; j < html.length; j++) {
            const c = html[j];
            if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; }
            if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) break;
          }
          pr = JSON.parse(html.slice(i, j + 1));
        }
      } catch (e) { pr = null; }
    }
    if (!pr || pr.videoDetails?.videoId !== vid) return null;
    const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks.length) return null;
    const tr = tracks.find(t => t.kind !== 'asr') || tracks[0];
    try {
      const r = await fetch(tr.baseUrl + '&fmt=json3', { credentials: 'include' });
      const txt = await r.text();
      if (!txt) return null;
      const segs = (JSON.parse(txt).events || []).filter(e => e.segs)
        .map(e => ({ t: fmt(e.tStartMs || 0), x: clean(e.segs.map(s => s.utf8).join('')) }))
        .filter(s => s.x);
      return segs.length ? segs : null;
    } catch (e) { return null; }
  }

  function readDom() {
    return $$(SEG).map(s => {
      const full = clean(s.innerText);
      let t = clean($('.segment-timestamp', s)?.textContent);
      if (!t) { const m = full.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/); t = m ? m[1] : ''; }
      let x = clean($('.segment-text', s)?.textContent);
      if (!x) x = clean(full.replace(t, ''));
      return { t, x };
    }).filter(s => s.x);
  }

  async function viaPanel() {
    if ($$(SEG).length) return readDom();
    const find = () => $('ytd-video-description-transcript-section-renderer button') ||
      $$('button').find(b => /transcri/i.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent));
    let btn = find();
    if (!btn) {
      $('#description-inline-expander #expand, tp-yt-paper-button#expand, #expand')?.click();
      await sleep(700);
      btn = find();
    }
    if (!btn) return null;
    btn.click();
    for (let i = 0; i < 48; i++) {
      await sleep(250);
      if ($$(SEG).length) { await sleep(500); return readDom(); }
    }
    return null;
  }

  let segs = await viaTracks();
  if (!segs) { status.textContent = 'Ouverture du panneau de transcription de YouTube…'; segs = await viaPanel(); }
  if (!segs || !segs.length) {
    fail("Aucune transcription trouvée. Cette vidéo n'a sans doute pas de sous-titres (ni manuels ni automatiques). Si elle en a, recharge la page et réessaie.");
    return;
  }

  const title = clean($('h1.ytd-watch-metadata, h1.title')?.textContent) || document.title.replace(/ - YouTube$/, '');
  const asText = withTs => {
    if (withTs) return segs.map(s => (s.t ? '[' + s.t + '] ' : '') + s.x).join('\n');
    let out = '', para = '';
    for (const s of segs) {
      para += (para ? ' ' : '') + s.x;
      if (/[.!?…]$/.test(s.x) && para.length > 450) { out += para + '\n\n'; para = ''; }
    }
    return (out + para).trim();
  };

  let ts = true;
  const area = el('textarea', { readOnly: true, style: 'flex:1;min-height:0;resize:none;width:100%;box-sizing:border-box;background:' + C.panel + ';color:' + C.fg + ';border:1px solid ' + C.line + ';border-radius:10px;padding:12px;font:13.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;outline:none;' });
  const words = segs.reduce((n, s) => n + s.x.split(' ').length, 0);
  const info = el('div', { style: 'color:' + C.dim + ';font:12px/1.4 system-ui,sans-serif;' });
  const refresh = () => { area.value = asText(ts); };
  const tsBtn = el('button', { style: btnCss + 'background:' + C.panel + ';color:' + C.fg + ';border:1px solid ' + C.line + ';' });
  const setTsLabel = () => { tsBtn.textContent = ts ? 'Horodatage : oui' : 'Horodatage : non'; };
  tsBtn.addEventListener('click', () => { ts = !ts; setTsLabel(); refresh(); });
  const copyBtn = el('button', {
    style: btnCss + 'background:' + C.acc + ';color:#111;',
    onclick: async () => {
      try { await navigator.clipboard.writeText(area.value); }
      catch (e) { area.select(); document.execCommand('copy'); }
      copyBtn.textContent = 'Copié ✓';
      setTimeout(() => { copyBtn.textContent = 'Copier'; }, 1500);
    }
  }, 'Copier');
  const dlBtn = el('button', {
    style: btnCss + 'background:' + C.panel + ';color:' + C.fg + ';border:1px solid ' + C.line + ';',
    onclick: () => {
      const blob = new Blob([title + '\nhttps://youtu.be/' + vid + '\n\n' + area.value], { type: 'text/plain;charset=utf-8' });
      const a = el('a', { href: URL.createObjectURL(blob), download: (title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || vid) + '.txt' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  }, 'Télécharger .txt');

  info.textContent = title + ' · ' + segs.length + ' segments · ' + words.toLocaleString('fr-FR') + ' mots';
  setTsLabel(); refresh();
  body.replaceChildren(info, el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;' }, copyBtn, dlBtn, tsBtn), area);
};
  const BTN = 'ytx-boost-btn';
  const isVideo = () => /^\/(watch|shorts\/)/.test(location.pathname);
  const make = () => {
    const b = document.createElement('button');
    b.id = BTN;
    b.type = 'button';
    b.title = 'Afficher la transcription de cette vidéo';
    const tag = document.createElement('span');
    tag.textContent = 'CC';
    tag.style.cssText = 'background:#14161c;color:#ffd23f;padding:2px 5px;border-radius:4px;font-size:11px;margin-right:6px;';
    b.append(tag, 'Transcription');
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); ytxRun(); });
    return b;
  };
  const tick = () => {
    const old = document.getElementById(BTN);
    if (!isVideo()) { old?.remove(); return; }
    const host = document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #actions');
    if (old && (host ? host.contains(old) : old.dataset.floating)) return;
    old?.remove();
    const b = make();
    const base = 'all:unset;cursor:pointer;display:inline-flex;align-items:center;background:#ffd23f;color:#111;font:600 14px/1 Roboto,system-ui,sans-serif;padding:0 14px;height:36px;border-radius:18px;';
    if (host) {
      b.style.cssText = base + 'margin-right:8px;';
      host.prepend(b);
    } else {
      b.dataset.floating = '1';
      b.style.cssText = base + 'position:fixed;left:16px;bottom:16px;z-index:2147483646;box-shadow:0 6px 20px rgba(0,0,0,.35);';
      document.body.append(b);
    }
  };
  setInterval(tick, 1000);
  document.addEventListener('yt-navigate-finish', () => setTimeout(tick, 300));
  tick();
})();
