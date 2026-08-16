// ==UserScript==
// @name         TAPD 坐标提取与复制
// @namespace    tapd-coordinate-tools
// @version      1.3.3
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
    #${ROOT_ID} { position:fixed; z-index:2147483647; right:18px; bottom:18px; width:440px; max-height:calc(100vh - 42px); display:flex; flex-direction:column; color:#202124; background:#fff; border:1px solid #d9dce1; border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.18); font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; }
    #${ROOT_ID} * { box-sizing:border-box; }
    #${ROOT_ID} .tcp-head { display:flex; align-items:center; justify-content:flex-end; min-height:28px; padding:3px 6px 0; background:#fff; border-radius:8px 8px 0 0; cursor:move; user-select:none; }
    #${ROOT_ID} .tcp-title { display:none; }
    #${ROOT_ID} .tcp-actions { display:flex; gap:5px; }
    #${ROOT_ID} button { border:0; border-radius:4px; padding:3px 7px; color:#6b7280; background:#f1f3f5; cursor:pointer; }
    #${ROOT_ID} button:hover { background:#e2e6ea; color:#202124; }
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
    #${ROOT_ID} .tcp-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 8px 7px 10px; border-top:1px solid #edf0f2; color:#6b7280; font-size:11px; }
    #${ROOT_ID} .tcp-hint { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
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
    const isPreview = location.pathname.includes('/bug/list') && new URLSearchParams(location.search).has('dialog_preview_id');
    const isBugDetail = /\/bug\/detail\//.test(location.pathname);
    return isPreview || isBugDetail;
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
          .sort(byTextLengthThenDepth);
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
        candidates.sort(byTextLengthThenDepth);
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

  function containsCoordText(el, raw) {
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const needle = raw.replace(/\s+/g, ' ').trim();
    return text.includes(needle) || text.replace(/\s+/g, '').includes(needle.replace(/\s+/g, ''));
  }

  function byTextLengthThenDepth(a, b) {
    const la = (a.innerText || a.textContent || '').length;
    const lb = (b.innerText || b.textContent || '').length;
    if (la !== lb) return la - lb;
    if (b.contains?.(a)) return -1; // a is deeper
    if (a.contains?.(b)) return 1;  // b is deeper
    return 0;
  }

  function smallestContainers(root, raw, selector) {
    return [...root.querySelectorAll(selector)]
      .filter((el) => containsCoordText(el, raw))
      .sort(byTextLengthThenDepth);
  }

  function deepestTextContainer(el, raw) {
    if (!el || !el.querySelectorAll) return el;
    const candidates = [el, ...el.querySelectorAll('*')].filter((node) => containsCoordText(node, raw));
    candidates.sort(byTextLengthThenDepth);
    return candidates[0] || el;
  }

  function findAnchorFor(raw) {
    const previews = previewContainers();
    if (previews.length) {
      for (const panel of previews) {
        for (const root of previewRoots(panel)) {
          const found = smallestContainers(root, raw, 'p, div, li, td, blockquote, pre, h1, h2, h3');
          if (found[0]) return found[0];
          // TinyMCE / iframe 编辑器内容也在预览抽屉中，扫描 iframe 内部。
          for (const frame of [...(root.querySelectorAll?.('iframe') || [])]) {
            try {
              const child = frame.contentDocument || frame.contentWindow?.document;
              if (!child || child === panel.ownerDocument) continue;
              const frameFound = smallestContainers(child, raw, 'p, div, li, td, blockquote, pre, h1, h2, h3');
              if (frameFound[0]) return frameFound[0];
            } catch (_) { /* cross-origin frame */ }
          }
        }
      }
      return null;
    }
    let anchor = null;
    documentsIn(document).forEach((doc) => {
      if (anchor) return;
      rootsIn(doc).forEach((root) => {
        if (anchor) return;
        const base = root.body || root;
        const found = smallestContainers(base, raw, 'div, p, li, td, blockquote, pre, [contenteditable="true"], .cherry-editor-content, h1, h2, h3');
        if (found[0]) anchor = found[0];
      });
    });
    return anchor;
  }

  let flashTimer = null;
  let flashedEl = null;
  function flash(el) {
    if (flashedEl && flashedEl.isConnected) {
      flashedEl.style.outline = '';
      flashedEl.style.outlineOffset = '';
    }
    clearTimeout(flashTimer);
    flashedEl = el;
    el.style.outline = '3px solid #ff9800';
    el.style.outlineOffset = '2px';
    flashTimer = setTimeout(() => {
      if (flashedEl && flashedEl.isConnected) {
        flashedEl.style.outline = '';
        flashedEl.style.outlineOffset = '';
      }
      flashedEl = null;
    }, 1800);
  }

  function frameOf(target) {
    let node = target;
    while (node) {
      try {
        const frameEl = node.ownerDocument?.defaultView?.frameElement;
        if (frameEl) return frameEl;
      } catch (_) { /* cross-origin frame */ }
      node = node.parentElement || node.parentNode;
    }
    return null;
  }

  function scrollContainer(container) {
    try { container.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
    catch (_) { container.scrollIntoView(true); }
  }

  function jump(el, raw) {
    const isBugDetail = /\/bug\/detail\//.test(location.pathname);
    let target = isBugDetail ? findAnchorFor(raw) : (el && el.isConnected ? el : findAnchorFor(raw));
    if (!target && el && el.isConnected) target = el;
    if (!target) return;
    target = deepestTextContainer(target, raw);
    const frame = frameOf(target);
    if (frame) {
      // 坐标在 iframe（如 TinyMCE）中：先滚动外层让 iframe 可见，再滚动 iframe 内部。
      scrollContainer(frame);
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
      catch (_) { target.scrollIntoView(true); }
      // iframe 内的元素可能被编辑器外壳遮挡，外层 iframe 也高亮，保证可见。
      if (frame.style) {
        const restore = frame.style.outline;
        frame.style.outline = '3px solid #ff9800';
        frame.style.outlineOffset = '2px';
        setTimeout(() => { frame.style.outline = restore; frame.style.outlineOffset = ''; }, 1800);
      }
      try { flash(target); } catch (_) { flash(frame); }
      return;
    }
    scrollContainer(target);
    flash(target);
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const body = root.querySelector('.tcp-body');
    body.replaceChildren();
    if (!records.length) { body.innerHTML = '<div class="tcp-empty">未找到坐标</div>'; root.querySelector('.tcp-hint').textContent = '等待预览内容加载'; return; }
    records.forEach((record, i) => {
      const row = document.createElement('div'); row.className = 'tcp-row'; row.title = '点击定位到页面位置';
      const source = document.createElement('div'); source.className = 'tcp-source'; source.textContent = `${i + 1}. ${record.text}`;
      const coords = document.createElement('div'); coords.className = 'tcp-coords';
      [['X', record.coord.x], ['Y', record.coord.y], ['Z', record.coord.z]].forEach(([axis, value]) => { const btn = document.createElement('button'); btn.className = 'tcp-value'; btn.textContent = `${axis}: ${value}`; btn.title = `复制 ${axis} 坐标`; btn.addEventListener('click', (e) => { e.stopPropagation(); copy(value, btn); }); coords.append(btn); });
      row.append(source, coords); row.addEventListener('click', () => jump(record.el, record.coord.raw)); body.append(row);
    });
    root.querySelector('.tcp-hint').textContent = `共 ${records.length} 组坐标 · 点击数值复制 · 点击行定位`;
  }

  function createPanel() {
    if (!shouldRun()) return;
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement('aside'); root.id = ROOT_ID;
    root.innerHTML = '<div class="tcp-body"></div><div class="tcp-foot"><span class="tcp-hint"></span><button class="tcp-close" title="关闭">×</button></div>';
    document.body.append(root);
    root.querySelector('.tcp-close').addEventListener('click', () => { manuallyClosed = true; root.remove(); });
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
