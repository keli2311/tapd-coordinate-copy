// ==UserScript==
// @name         TAPD 坐标提取与复制
// @namespace    tapd-coordinate-tools
// @version      1.2.1
// @description  汇总 TAPD 标题和详细内容中的 XYZ 坐标，支持定位与单值复制
// @updateURL    https://raw.githubusercontent.com/keli2311/tapd-coordinate-copy/main/tapd-coordinate-copy.user.js
// @downloadURL  https://raw.githubusercontent.com/keli2311/tapd-coordinate-copy/main/tapd-coordinate-copy.user.js
// @match        https://tapd.tencent.com/*
// @match        https://*.tapd.tencent.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const COORD_RE = /\(\s*X\s*=\s*([-+]?\d+(?:\.\d+)?)\s*[,，]\s*Y\s*=\s*([-+]?\d+(?:\.\d+)?)\s*[,，]\s*Z\s*=\s*([-+]?\d+(?:\.\d+)?)\s*\)/ig;
  const ROOT_ID = 'tapd-coordinate-panel';
  let records = [];
  let manuallyClosed = false;
  const trackedFrames = new WeakSet();

  GM_addStyle(`
    #${ROOT_ID} { position:fixed; z-index:2147483647; top:72px; right:18px; width:440px; max-height:calc(100vh - 96px); display:flex; flex-direction:column; color:#202124; background:#fff; border:1px solid #d9dce1; border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.18); font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; }
    #${ROOT_ID} * { box-sizing:border-box; }
    #${ROOT_ID} .tcp-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; color:#fff; background:#1769aa; border-radius:8px 8px 0 0; cursor:move; user-select:none; }
    #${ROOT_ID} .tcp-title { font-weight:600; }
    #${ROOT_ID} .tcp-actions { display:flex; gap:5px; }
    #${ROOT_ID} button { border:0; border-radius:4px; padding:4px 8px; color:inherit; background:rgba(255,255,255,.18); cursor:pointer; }
    #${ROOT_ID} button:hover { background:rgba(255,255,255,.32); }
    #${ROOT_ID} .tcp-body { overflow:auto; padding:8px; }
    #${ROOT_ID} .tcp-empty { padding:20px 8px; color:#6b7280; text-align:center; }
    #${ROOT_ID} .tcp-section { margin:0 0 9px; }
    #${ROOT_ID} .tcp-section-label { margin:5px 2px; color:#6b7280; font-size:11px; }
    #${ROOT_ID} .tcp-row { margin:4px 0; padding:8px; border:1px solid #e6e8eb; border-radius:6px; background:#fafbfc; cursor:pointer; }
    #${ROOT_ID} .tcp-row:hover { border-color:#1769aa; background:#f2f8fd; }
    #${ROOT_ID} .tcp-source { margin-bottom:6px; color:#6b7280; font-size:12px; }
    #${ROOT_ID} .tcp-coords { display:flex; gap:6px; flex-wrap:nowrap; }
    #${ROOT_ID} .tcp-value { flex:1 1 0; min-width:0; min-height:28px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px; color:#0f4c81; background:#fff; font-size:13px; cursor:copy; }
    #${ROOT_ID} .tcp-value:hover { background:#e8f3fb; }
    #${ROOT_ID} .tcp-foot { padding:7px 10px; border-top:1px solid #edf0f2; color:#6b7280; font-size:11px; }
  `);

  function textOf(el) { return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim(); }

  function contextText(text, raw) {
    const value = String(text || '');
    const at = value.indexOf(raw);
    if (at < 0) return raw;
    const lineStart = Math.max(value.lastIndexOf('\n', at), value.lastIndexOf('\r', at)) + 1;
    const nextRelative = value.slice(at + raw.length).search(/[\r\n]/);
    const nextLine = nextRelative < 0 ? -1 : at + raw.length + nextRelative;
    const line = value.slice(lineStart, nextLine < 0 ? value.length : nextLine).trim();
    return line.length > 220 ? `${line.slice(0, 217)}...` : line;
  }

  function parse(text) {
    const found = [];
    COORD_RE.lastIndex = 0;
    let match;
    while ((match = COORD_RE.exec(text))) found.push({ x: match[1], y: match[2], z: match[3], raw: match[0] });
    return found;
  }

  function documentsIn(rootDocument) {
    const docs = [rootDocument];
    rootDocument.querySelectorAll('iframe').forEach((frame) => {
      try {
        if (!trackedFrames.has(frame)) { trackedFrames.add(frame); frame.addEventListener('load', () => setTimeout(scan, 100)); }
        const child = frame.contentDocument || frame.contentWindow?.document;
        if (child && child !== rootDocument) docs.push(...documentsIn(child));
      } catch (_) { /* cross-origin frame */ }
    });
    return docs;
  }

  function rootsIn(rootDocument) {
    const roots = [rootDocument];
    const visit = (root) => root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) { roots.push(el.shadowRoot); visit(el.shadowRoot); }
    });
    visit(rootDocument);
    return roots;
  }

  function previewRoots(panel) {
    const roots = [panel];
    const visit = (root) => root.querySelectorAll?.('*').forEach((el) => {
      if (el.shadowRoot) { roots.push(el.shadowRoot); visit(el.shadowRoot); }
    });
    visit(panel);
    return roots;
  }

  function previewContainers() {
    if (!location.pathname.includes('/bug/list') || !new URLSearchParams(location.search).has('dialog_preview_id')) return [];
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="drawer" i], [class*="preview" i], [class*="modal" i], [data-testid*="preview" i], [style*="flex: 1 1 0%"]')]
      .filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0)
      .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height);
  }

  function shouldRun() {
    const isBugList = location.pathname.includes('/bug/list');
    return !isBugList || new URLSearchParams(location.search).has('dialog_preview_id');
  }

  function belongsToPreview(el, containers) {
    if (!containers.length) return true;
    let node = el;
    for (let i = 0; i < 4 && node; i += 1) {
      if (containers.some((container) => container === node || container.contains?.(node))) return true;
      node = node.ownerDocument?.defaultView?.frameElement || node.parentElement;
    }
    return false;
  }

  function sourceElements(rootDocument) {
    const list = [];
    const seen = new Set();
    const title = rootDocument === document ? rootDocument.querySelector('h1, [class*="title" i]') : null;
    if (title && parse(textOf(title)).length) list.push({ el: title, label: '标题', text: textOf(title) });
    const nodes = rootDocument.querySelectorAll('p, li, td, blockquote, pre, [contenteditable="true"], .markdown-body, .detail, .description, .cherry-editor-content, .cherry-editor-content p');
    nodes.forEach((el) => {
      if (el.closest(`#${ROOT_ID}`)) return;
      const text = textOf(el);
      if (!text || !parse(text).length) return;
      // Skip containers whose child already contains the same coordinate text.
      const childHasMatch = [...el.children].some((child) => parse(textOf(child)).length && textOf(child).length < text.length);
      if (childHasMatch) return;
      const key = `${text}|${el.tagName}|${el.className}`;
      if (!seen.has(key)) { seen.add(key); list.push({ el, label: '详细内容', text }); }
    });
    return list;
  }

  function scan() {
    if (!shouldRun()) return;
    const unique = new Map();
    const previews = previewContainers();
    if (location.pathname.includes('/bug/list') && !previews.length) return;
    if (previews.length) {
      const addPreviewText = (text, root, label = '详细内容') => parse(text).forEach((coord) => {
        const key = coord.raw.toLowerCase().replace(/\s+/g, '');
        if (unique.has(key)) return;
        const candidates = [...root.querySelectorAll?.('p, div, li, td, blockquote, pre, h1, h2, h3') || []]
          .filter((el) => (el.innerText || el.textContent || '').includes(coord.raw))
          .sort((a, b) => (a.innerText || a.textContent || '').length - (b.innerText || b.textContent || '').length);
        unique.set(key, { el: candidates[0] || root, label, text: coord.raw, coord, index: 0 });
      });
      previews.forEach((panel) => {
        previewRoots(panel).forEach((previewRoot) => {
          addPreviewText(previewRoot.innerText || previewRoot.textContent || '', previewRoot);
          previewRoot.querySelectorAll?.('iframe').forEach((frame) => {
            try { if (frame.contentDocument?.body) addPreviewText(frame.contentDocument.body.innerText || frame.contentDocument.body.textContent || '', frame.contentDocument, '详细内容'); } catch (_) {}
          });
        });
      });
      records = [...unique.values()];
      render();
      return;
    }
    documentsIn(document).forEach((doc) => {
      rootsIn(doc).forEach((root) => {
      const base = root.body || root;
      const sources = [base.innerText || '', base.textContent || '', base.innerHTML || ''];
      sources.forEach((pageText) => parse(pageText).forEach((coord) => {
        const key = coord.raw.toLowerCase().replace(/\s+/g, '');
        if (unique.has(key)) return;
        let anchor = doc.body;
        let anchorText = coord.raw;
        const candidates = [...root.querySelectorAll('div, p, li, td, blockquote, pre, [contenteditable="true"], .cherry-editor-content, h1, h2, h3')]
          .filter((el) => (el.innerText || el.textContent || '').includes(coord.raw));
        candidates.sort((a, b) => (a.innerText || a.textContent || '').length - (b.innerText || b.textContent || '').length);
        if (candidates[0]) { anchor = candidates[0]; anchorText = textOf(candidates[0]); }
        if (!belongsToPreview(anchor, previews)) return;
        const titleText = doc === document ? textOf(doc.querySelector('h1, [class*="title" i]')) : '';
        const isTitle = titleText.includes(coord.raw);
        unique.set(key, { el: anchor, label: isTitle ? '标题' : '详细内容', text: coord.raw, coord, index: 0 });
      }));
      });
    });
    records = [...unique.values()];
    render();
  }

  function copy(value, button) {
    const done = () => { const old = button.textContent; button.textContent = '已复制'; setTimeout(() => { button.textContent = old; }, 800); };
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(value, 'text'); done(); return; }
    navigator.clipboard?.writeText(value).then(done).catch(() => {});
  }

  function jump(el, raw) {
    // Intentionally no-op: row clicks no longer scroll or highlight the page.
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const body = root.querySelector('.tcp-body');
    body.replaceChildren();
    if (!records.length) { body.innerHTML = '<div class="tcp-empty">未找到坐标</div>'; root.querySelector('.tcp-foot').textContent = '点击“刷新”重新扫描当前页面'; return; }
    records.forEach((record, i) => {
      const row = document.createElement('div'); row.className = 'tcp-row';
      const source = document.createElement('div'); source.className = 'tcp-source'; source.textContent = `${i + 1}. ${record.text}`;
      const coords = document.createElement('div'); coords.className = 'tcp-coords';
      [['X', record.coord.x], ['Y', record.coord.y], ['Z', record.coord.z]].forEach(([axis, value]) => { const btn = document.createElement('button'); btn.className = 'tcp-value'; btn.textContent = `${axis}: ${value}`; btn.title = `复制 ${axis} 坐标`; btn.addEventListener('click', (e) => { e.stopPropagation(); copy(value, btn); }); coords.append(btn); });
      row.append(source, coords); row.addEventListener('click', () => jump(record.el, record.coord.raw)); body.append(row);
    });
    root.querySelector('.tcp-foot').textContent = `共 ${records.length} 组坐标 · 点击数值复制`;
  }

  function createPanel() {
    if (!shouldRun()) return;
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('aside'); root.id = ROOT_ID;
    root.innerHTML = '<div class="tcp-head"><span class="tcp-title">TAPD 坐标汇总</span><span class="tcp-actions"><button class="tcp-close">×</button></span></div><div class="tcp-body"></div><div class="tcp-foot"></div>';
    document.body.append(root);
    root.querySelector('.tcp-close').addEventListener('click', () => { manuallyClosed = true; root.remove(); });
    const head = root.querySelector('.tcp-head'); let drag;
    head.addEventListener('mousedown', (e) => { if (e.target.closest('button')) return; const r = root.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; const move = (ev) => { root.style.left = `${ev.clientX - drag.x}px`; root.style.top = `${ev.clientY - drag.y}px`; root.style.right = 'auto'; }; const up = () => { drag = null; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); });
    scan();
  }

  let scanTimer;
  const observer = new MutationObserver((mutations) => {
    if (manuallyClosed) return;
    if (!shouldRun()) { document.getElementById(ROOT_ID)?.remove(); return; }
    if (!document.getElementById(ROOT_ID)) { schedulePanel(); return; }
    if (mutations.every((mutation) => mutation.target.closest?.(`#${ROOT_ID}`))) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 350);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  let panelTimer;
  function schedulePanel() {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => { if (shouldRun()) createPanel(); }, 700);
  }
  window.addEventListener('popstate', () => { if (shouldRun()) schedulePanel(); else document.getElementById(ROOT_ID)?.remove(); });
  // TinyMCE populates its iframe after the outer TAPD view has rendered.
  // Re-scan a few times because iframe mutations are not visible to the
  // parent document's MutationObserver.
  [500, 1500, 3000, 6000].forEach((delay) => setTimeout(scan, delay));
  setInterval(() => {
    if (!manuallyClosed && shouldRun() && previewContainers().length) scan();
  }, 2500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { if (location.pathname.includes('/bug/list')) schedulePanel(); else createPanel(); });
  else if (location.pathname.includes('/bug/list')) schedulePanel();
  else createPanel();
})();
