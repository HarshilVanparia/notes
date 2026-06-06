// GhostNotepad - renderer.js
// Core: tabbed editor with text + draw overlay per tab

const tabsList = document.getElementById('tabsList');
const editorContainer = document.getElementById('editorContainer');
const addTabBtn = document.getElementById('addTabBtn');
const statusInfo = document.getElementById('statusInfo');
const wordCount = document.getElementById('wordCount');
const zoomInfo = document.getElementById('zoomInfo');

let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let zoomLevel = 100;
let savedSelectionRange = null;
const MIN_ZOOM = 10, MAX_ZOOM = 300;

// ============== Shortcuts ==============
const SHORTCUTS_KEY = 'notes_shortcuts_v3';
const DEFAULT_SHORTCUTS = {
  newTab: 'Ctrl+N', openFile: 'Ctrl+O', save: 'Ctrl+S', saveAs: 'Ctrl+Shift+S',
  close: 'Ctrl+W', find: 'Ctrl+F', pastePlain: 'Ctrl+Shift+V', paste: 'Ctrl+V',
  zoomIn: 'Ctrl+Plus', zoomOut: 'Ctrl+-', zoomReset: 'Ctrl+0',
  italic: 'Ctrl+I', insertImage: 'Ctrl+Shift+I',
  cycleForward: 'Ctrl+Tab', cycleBackward: 'Ctrl+Shift+Tab'
};
let shortcuts = loadShortcuts();
function loadShortcuts() {
  try { const r = localStorage.getItem(SHORTCUTS_KEY); if (r) return JSON.parse(r); } catch (e) {}
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(DEFAULT_SHORTCUTS));
  return Object.assign({}, DEFAULT_SHORTCUTS);
}
function saveShortcuts(o) { shortcuts = Object.assign({}, o); localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts)); }
const PASTE_MODE_KEY = 'notes_paste_mode_v1';
function loadPasteMode() { try { const v = localStorage.getItem(PASTE_MODE_KEY); if (v) return v; } catch (e) {} localStorage.setItem(PASTE_MODE_KEY, 'clean'); return 'clean'; }
function savePasteMode(v) { try { localStorage.setItem(PASTE_MODE_KEY, v); } catch (e) {} }

function matchShortcut(e, str) {
  const parts = str.toLowerCase().split('+').map(x => x.trim());
  const needs = { ctrl: false, shift: false, alt: false, meta: false };
  let key = null;
  for (const p of parts) {
    if (['ctrl','control'].includes(p)) needs.ctrl = true;
    else if (p === 'shift') needs.shift = true;
    else if (p === 'alt') needs.alt = true;
    else if (['meta','cmd','super'].includes(p)) needs.meta = true;
    else key = p;
  }
  if (e.ctrlKey !== needs.ctrl) return false;
  if (e.shiftKey !== needs.shift) return false;
  if (e.altKey !== needs.alt) return false;
  if (e.metaKey !== needs.meta) return false;
  if (!key) return true;
  const ek = e.key.toLowerCase();
  if (key === 'plus' || key === '+') return ek === '+' || ek === '=';
  if (key === 'tab') return ek === 'tab';
  return ek === key;
}

document.getElementById('minBtn')?.addEventListener('click', () => window.api.windowMin());
document.getElementById('maxBtn')?.addEventListener('click', () => window.api.windowMax());
document.getElementById('closeBtn')?.addEventListener('click', () => window.api.windowClose());

// ============== Tab Management ==============
function getFileName(p) { if (!p) return 'Untitled'; return p.split(/[\\/]/).pop(); }

const NOTES_FILE_VERSION = 1;
function parseNoteFile(raw, path) {
  if (!raw) return { content: '', drawing: { strokes: [], history: [], historyIndex: -1 }, images: [], bgSettings: { url: '', color: '' } };
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (data.version === NOTES_FILE_VERSION || data.content !== undefined) {
        return {
          content: data.content || '',
          drawing: data.drawing || { strokes: [], history: [], historyIndex: -1 },
          images: data.images || [],
          bgSettings: data.bgSettings || { url: '', color: '' }
        };
      }
    } catch (e) {}
  }
  return {
    content: raw,
    drawing: { strokes: [], history: [], historyIndex: -1 },
    images: [],
    bgSettings: { url: '', color: '' }
  };
}

function serializeTab(tab) {
  return JSON.stringify({
    version: NOTES_FILE_VERSION,
    content: tab.content,
    drawing: tab.drawing,
    images: tab.images || [],
    bgSettings: tab.bgSettings
  }, null, 2);
}

function tabSnapshot(t) {
  return { path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings, drawing: t.drawing, images: t.images || [] };
}

function createTab(fileData = null) {
  const id = 'tab_' + (++tabCounter);
  let parsed = { content: '', drawing: { strokes: [], history: [], historyIndex: -1 }, images: [], bgSettings: { url: '', color: '' } };
  if (fileData) parsed = parseNoteFile(fileData.content, fileData.path);

  const tab = {
    id,
    path: fileData ? fileData.path : null,
    title: fileData ? getFileName(fileData.path) : 'Untitled',
    content: parsed.content,
    isDirty: false,
    bgSettings: parsed.bgSettings,
    drawing: parsed.drawing,
    images: parsed.images
  };
  tabs.push(tab);

  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `tab_el_${id}`;
  tabEl.innerHTML = `<div class="tab-title" id="title_${id}">${tab.title}</div><div class="tab-close" data-id="${id}">&#x2715;</div>`;
  tabEl.addEventListener('click', (e) => { if (!e.target.classList.contains('tab-close')) setActiveTab(id); });
  tabEl.querySelector('.tab-close').addEventListener('click', async (e) => { e.stopPropagation(); await closeTab(id); });
  tabsList.appendChild(tabEl);

  const paneEl = document.createElement('div');
  paneEl.className = 'tab-pane';
  paneEl.id = `pane_${id}`;

  const workspace = document.createElement('div');
  workspace.className = 'editor-workspace';

  const editorEl = document.createElement('div');
  editorEl.className = 'editor';
  editorEl.id = `editor_${id}`;
  editorEl.contentEditable = 'true';
  editorEl.spellcheck = true;
  editorEl.innerHTML = tab.content;
  workspace.appendChild(editorEl);
  paneEl.appendChild(workspace);
  editorContainer.appendChild(paneEl);

  editorEl.addEventListener('input', () => {
    tab.isDirty = true;
    tab.content = editorEl.innerHTML;
    updateTabTitle(id);
    scheduleStatusUpdate();
    scheduleSessionSave();
  });
  editorEl.addEventListener('keyup', scheduleStatusUpdate);
  editorEl.addEventListener('click', scheduleStatusUpdate);
  editorEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
      updateActiveTabContent();
    }
  });
  editorEl.addEventListener('dragover', (e) => e.preventDefault());
  editorEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0], editorEl);
    }
  });
  editorEl.addEventListener('paste', (e) => {
    const cb = e.clipboardData;
    if (!cb) return;
    for (const item of cb.items || []) {
      if (item.type && item.type.indexOf('image') === 0) {
        e.preventDefault();
        handleImageFile(item.getAsFile(), editorEl);
        return;
      }
    }
    const html = cb.getData('text/html');
    if (html) {
      e.preventDefault();
      const mode = loadPasteMode();
      const cleaned = sanitizeHtml(html, mode);
      if (mode === 'plain') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        document.execCommand('insertText', false, doc.body.textContent || '');
      } else {
        insertHtmlAtCursor(cleaned);
      }
      updateActiveTabContent();
    }
  });

  setActiveTab(id);
  return id;
}

function addImageToTab(file, dataUrl, width, height) {
  if (!activeTabId) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  if (!tab.images) tab.images = [];
  tab.images.push({
    id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: file.name || 'image',
    data: dataUrl,
    width: width || 0,
    height: height || 0,
    size: file.size || 0,
    type: file.type || 'image/png'
  });
  tab.isDirty = true;
  updateTabTitle(activeTabId);
  scheduleSessionSave();
  refreshGalleryIfOpen();
}

function refreshGalleryIfOpen() {
  const overlay = document.getElementById('galleryOverlay');
  if (overlay && !overlay.classList.contains('hidden')) updateGalleryGrid();
}

function isGalleryOpen() {
  const overlay = document.getElementById('galleryOverlay');
  return overlay && !overlay.classList.contains('hidden');
}

function handleImageFile(file, editorEl, addToGalleryOnly = false) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const probe = new Image();
    probe.onload = () => {
      addImageToTab(file, dataUrl, probe.naturalWidth, probe.naturalHeight);
      if (!addToGalleryOnly && editorEl) {
        editorEl.focus();
        document.execCommand('insertImage', false, dataUrl);
        updateActiveTabContent();
      }
    };
    probe.onerror = () => {
      addImageToTab(file, dataUrl, 0, 0);
      if (!addToGalleryOnly && editorEl) {
        editorEl.focus();
        document.execCommand('insertImage', false, dataUrl);
        updateActiveTabContent();
      }
    };
    probe.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

window.api.onOpenInitialFile?.(async (filePath) => {
  const existing = tabs.find(t => t.path === filePath);
  if (existing) { setActiveTab(existing.id); return; }
  try {
    const data = await window.api.openFileSpecific(filePath);
    if (data) createTab(data);
  } catch (e) {}
});

function setActiveTab(id) {
  if (drawState.open) setDrawMode(false);
  const gallery = document.getElementById('galleryOverlay');
  if (gallery && !gallery.classList.contains('hidden')) gallery.classList.add('hidden');

  activeTabId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  const tabEl = document.getElementById(`tab_el_${id}`);
  const paneEl = document.getElementById(`pane_${id}`);
  const editorEl = document.getElementById(`editor_${id}`);

  if (tabEl) tabEl.classList.add('active');
  if (paneEl) paneEl.classList.add('active');
  if (editorEl) {
    if (!drawState.open) editorEl.focus();
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      editorEl.style.backgroundImage = tab.bgSettings.url ? `url('${tab.bgSettings.url}')` : 'none';
      editorEl.style.backgroundColor = tab.bgSettings.color || '';
    }
  }
  if (typeof resetFormatTogglesForActiveTab === 'function') resetFormatTogglesForActiveTab();

  updateStatus();
  updateZoom();
  updateToolbarState();
}

function getActiveTabIndex() { return tabs.findIndex(t => t.id === activeTabId); }
function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = getActiveTabIndex();
  if (i === -1) return;
  setActiveTab(tabs[(i + dir + tabs.length) % tabs.length].id);
}

async function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  if (tab.isDirty) {
    const r = await window.api.showMessageBox({
      type: 'question', buttons: ['Save', 'Don\'t Save', 'Cancel'],
      title: 'GhostNotepad', message: `Save changes to ${tab.title}?`, cancelId: 2
    });
    if (r.response === 0) await saveTab(id);
    else if (r.response === 2) return;
  }
  document.getElementById(`tab_el_${id}`)?.remove();
  document.getElementById(`pane_${id}`)?.remove();
  tabs.splice(idx, 1);
  if (tabs.length === 0) createTab();
  else if (activeTabId === id) setActiveTab(tabs[Math.max(0, idx - 1)].id);
}

function updateTabTitle(id) {
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    const el = document.getElementById(`title_${id}`);
    if (el) el.textContent = tab.title + (tab.isDirty ? ' *' : '');
  }
}

let _statusTimer = null;
function scheduleStatusUpdate() {
  if (_statusTimer) clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => { _statusTimer = null; updateStatus(); }, 250);
}
function updateStatus() {
  if (!activeTabId) return;
  const el = document.getElementById(`editor_${activeTabId}`);
  if (!el) return;
  const text = el.innerText || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  wordCount.textContent = `Words: ${words} | Chars: ${text.length}`;
}

async function saveTab(id, saveAs = false) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return false;
  const el = document.getElementById(`editor_${id}`);
  if (el) tab.content = el.innerHTML;
  const payload = serializeTab(tab);
  const newPath = await window.api.saveFile(payload, saveAs ? null : tab.path);
  if (newPath) {
    tab.path = newPath;
    tab.title = getFileName(newPath);
    tab.isDirty = false;
    updateTabTitle(id);
    statusInfo.textContent = `Saved: ${tab.title}`;
    scheduleSessionSave();
    return true;
  }
  return false;
}

function updateActiveTabContent() {
  if (!activeTabId) return;
  const tab = tabs.find(t => t.id === activeTabId);
  const el = document.getElementById(`editor_${activeTabId}`);
  if (tab && el) {
    tab.content = el.innerHTML;
    tab.isDirty = true;
    updateTabTitle(activeTabId);
  }
}

addTabBtn.addEventListener('click', () => createTab());

// ============== Zoom ==============
function setZoomLevel(z) { zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)); updateZoom(); }
function changeZoom(d) { setZoomLevel(zoomLevel + d); }
function updateZoom() {
  if (activeTabId) {
    const el = document.getElementById(`editor_${activeTabId}`);
    if (el) el.style.fontSize = `${14 * (zoomLevel / 100)}px`;
  }
  if (zoomInfo) zoomInfo.textContent = `${zoomLevel}%`;
}

document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  changeZoom(e.deltaY < 0 ? 10 : -10);
}, { passive: false });

// ============== Global keyboard ==============
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
    return;
  }
  if (drawState.open) return; // draw handler takes priority
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); createTab(); return; }
  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    const data = await window.api.openFile();
    if (data) createTab(data);
    return;
  }
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    if (e.shiftKey) saveTab(activeTabId, true);
    else saveTab(activeTabId, false);
    return;
  }
  if (e.ctrlKey && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); return; }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleFind(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'i') {
    e.preventDefault();
    if (e.shiftKey) { openGallery(); return; }
    else { document.execCommand('italic', false, null); updateActiveTabContent(); }
    return;
  }
  if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); changeZoom(10); return; }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); changeZoom(-10); return; }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); setZoomLevel(100); return; }
  if (e.key === '?' && !e.ctrlKey && !e.altKey) {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') { e.preventDefault(); openShortcutsModal(); }
  }
});

function showInfoPopup(m) { window.api.showMessageBox?.({ type: 'info', buttons: ['OK'], title: 'GhostNotepad', message: m }); }

function insertHtmlAtCursor(html) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const div = document.createElement('div');
  div.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node, last;
  while ((node = div.firstChild)) last = frag.appendChild(node);
  range.insertNode(frag);
  if (last) {
    const nr = document.createRange();
    nr.setStartAfter(last); nr.collapse(true);
    sel.removeAllRanges(); sel.addRange(nr);
  }
}

function sanitizeHtml(html, mode = 'clean') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  if (mode === 'plain') return doc.body.textContent || '';
  doc.querySelectorAll('*').forEach(el => { if (el.hasAttribute('face')) el.removeAttribute('face'); });
  doc.querySelectorAll('font').forEach(fn => {
    const p = fn.parentNode;
    while (fn.firstChild) p.insertBefore(fn.firstChild, fn);
    p.removeChild(fn);
  });
  if (mode === 'rich') {
    doc.querySelectorAll('*').forEach(el => {
      if (el.style && el.style.fontFamily) el.style.fontFamily = '';
      if (el.hasAttribute('style')) {
        const s = el.getAttribute('style').split(';').filter(p => p.trim() !== '' && p.toLowerCase().indexOf('font-family') === -1).join(';');
        if (s) el.setAttribute('style', s); else el.removeAttribute('style');
      }
    });
    return doc.body.innerHTML;
  }
  doc.querySelectorAll('*').forEach(el => { if (el.hasAttribute('style')) el.removeAttribute('style'); });
  return doc.body.innerHTML;
}

// ============== Session save (debounced) ==============
let _saveSessionTimer = null, _saveSessionInFlight = false;
function syncTabsContent() {
  tabs.forEach(t => {
    const el = document.getElementById(`editor_${t.id}`);
    if (el) t.content = el.innerHTML;
  });
}
function scheduleSessionSave() {
  if (_saveSessionTimer) clearTimeout(_saveSessionTimer);
  _saveSessionTimer = setTimeout(async () => {
    if (!window.api.saveSession || _saveSessionInFlight) return;
    _saveSessionInFlight = true;
    try {
      syncTabsContent();
      await window.api.saveSession({ tabs: tabs.map(tabSnapshot), activeTabId });
    } catch (e) {} finally { _saveSessionInFlight = false; }
  }, 2000);
}

// ============== Draw State ==============
let drawState = { open: false, tool: 'pen', color: '#ffffff', thickness: 4, drawing: false, lastX: 0, lastY: 0, currentStroke: null };
function getActiveEditor() { if (!activeTabId) return null; return document.getElementById(`editor_${activeTabId}`); }
function getActiveDrawCanvas() { return document.getElementById('drawCanvasFull'); }
function resizeDrawCanvas(c) {
  if (!c) return;
  const rect = c.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = window.devicePixelRatio || 1;
  const tw = Math.max(1, Math.floor(rect.width * dpr));
  const th = Math.max(1, Math.floor(rect.height * dpr));
  if (c.width !== tw || c.height !== th) {
    c.width = tw;
    c.height = th;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) replayAllStrokes(c, tab.drawing.strokes);
  }
}
function replayAllStrokes(c, strokes) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!strokes) return;
  for (const s of strokes) {
    if (!s.points || s.points.length === 0) continue;
    ctx.save();
    if (s.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = s.thickness * 2; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = s.color; ctx.lineWidth = s.thickness; }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    const p0 = s.points[0]; ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke(); ctx.restore();
  }
}
function pushStroke(tab, stroke) {
  if (!tab.drawing) tab.drawing = { strokes: [], history: [], historyIndex: -1 };
  const d = tab.drawing;
  if (d.historyIndex < d.history.length - 1) d.history = d.history.slice(0, d.historyIndex + 1);
  d.strokes.push(stroke); d.history.push({ type: 'add', stroke });
  if (d.history.length > 40) { d.history.shift(); d.strokes.shift(); } else d.historyIndex++;
}
function undoStroke(tab) {
  if (!tab.drawing || tab.drawing.historyIndex <= 0) return;
  tab.drawing.historyIndex--;
  tab.drawing.strokes = [];
  for (let i = 0; i <= tab.drawing.historyIndex; i++) { const e = tab.drawing.history[i]; if (e.type === 'add') tab.drawing.strokes.push(e.stroke); else if (e.type === 'clear') tab.drawing.strokes = []; }
  replayAllStrokes(getActiveDrawCanvas(), tab.drawing.strokes);
}
function clearStrokes(tab) {
  if (!tab.drawing) tab.drawing = { strokes: [], history: [], historyIndex: -1 };
  const d = tab.drawing;
  if (d.historyIndex < d.history.length - 1) d.history = d.history.slice(0, d.historyIndex + 1);
  d.history.push({ type: 'clear' });
  if (d.history.length > 40) d.history.shift(); else d.historyIndex++;
  d.strokes = [];
  const c = getActiveDrawCanvas();
  if (c) { const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
}
function getOverlayCoords(c, e) {
  const r = c.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
}
function drawStart(e) {
  if (!drawState.open || !activeTabId) return;
  const c = getActiveDrawCanvas();
  if (!c) return;
  e.preventDefault();
  const { x, y } = getOverlayCoords(c, e);
  drawState.drawing = true; drawState.lastX = x; drawState.lastY = y;
  drawState.currentStroke = { tool: drawState.tool, color: drawState.color, thickness: drawState.thickness, points: [{ x, y }] };
}
function drawMove(e) {
  if (!drawState.drawing || !drawState.currentStroke) return;
  const c = getActiveDrawCanvas(); if (!c) return;
  e.preventDefault();
  const { x, y } = getOverlayCoords(c, e);
  const ctx = c.getContext('2d'); ctx.save();
  if (drawState.currentStroke.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = drawState.currentStroke.thickness * 2; }
  else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = drawState.currentStroke.color; ctx.lineWidth = drawState.currentStroke.thickness; }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(drawState.lastX, drawState.lastY); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
  drawState.currentStroke.points.push({ x, y });
  drawState.lastX = x; drawState.lastY = y;
}
function drawEnd() {
  if (!drawState.drawing || !drawState.currentStroke) return;
  drawState.drawing = false;
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab && drawState.currentStroke.points.length > 0) {
    pushStroke(tab, drawState.currentStroke);
    tab.isDirty = true;
    updateTabTitle(activeTabId);
    scheduleSessionSave();
  }
  drawState.currentStroke = null;
}
let drawSurfaceBound = false;
function bindDrawSurface() {
  if (drawSurfaceBound) return;
  const c = getActiveDrawCanvas();
  if (!c) return;
  drawSurfaceBound = true;
  c.addEventListener('pointerdown', (e) => {
    if (!drawState.open) return;
    e.preventDefault();
    drawStart(e);
  });
  c.addEventListener('pointermove', (e) => { if (drawState.drawing) drawMove(e); });
  c.addEventListener('pointerup', drawEnd);
  c.addEventListener('pointercancel', drawEnd);
  c.addEventListener('pointerleave', (e) => { if (drawState.drawing) drawEnd(e); });
}
window.addEventListener('resize', () => { if (drawState.open) resizeDrawCanvas(getActiveDrawCanvas()); });

function stopDrawUiEvent(e) {
  e.stopPropagation();
  if (drawState.drawing) drawEnd();
}

function selectDrawTool(tool) {
  drawState.tool = tool;
  document.getElementById('drawToolPen')?.classList.toggle('active', tool === 'pen');
  document.getElementById('drawToolEraser')?.classList.toggle('active', tool === 'eraser');
}

function updateToolbarState() {
  document.getElementById('toolDrawToggle')?.classList.toggle('active', drawState.open);
  document.getElementById('toolGallery')?.classList.toggle('active', isGalleryOpen());
}

function setDrawMode(on) {
  if (on && !activeTabId) return;
  if (on && isGalleryOpen()) closeGallery();
  drawState.open = on;
  const overlay = document.getElementById('drawOverlay');
  if (overlay) overlay.classList.toggle('hidden', !on);
  if (on) {
    bindDrawSurface();
    const c = getActiveDrawCanvas();
    const paint = () => {
      if (!c) return;
      resizeDrawCanvas(c);
      const t = tabs.find(x => x.id === activeTabId);
      if (t?.drawing) replayAllStrokes(c, t.drawing.strokes);
    };
    requestAnimationFrame(() => requestAnimationFrame(paint));
  } else {
    const tab = tabs.find(x => x.id === activeTabId);
    if (tab) { tab.isDirty = true; updateTabTitle(activeTabId); scheduleSessionSave(); }
    getActiveEditor()?.focus();
  }
  updateToolbarState();
}

document.getElementById('toolDrawToggle')?.addEventListener('click', () => setDrawMode(!drawState.open));
document.getElementById('toolGallery')?.addEventListener('click', () => {
  if (isGalleryOpen()) closeGallery();
  else openGallery();
});

function initDrawToolbar() {
  const bar = document.getElementById('drawToolbar');
  if (bar) {
    bar.querySelectorAll('button, input, label').forEach(el => {
      el.addEventListener('pointerdown', stopDrawUiEvent);
      el.addEventListener('mousedown', stopDrawUiEvent);
    });
  }
  document.getElementById('drawSaveBtn')?.addEventListener('pointerdown', stopDrawUiEvent);
  document.getElementById('drawSaveBtn')?.addEventListener('click', (e) => { e.stopPropagation(); setDrawMode(false); });

  document.getElementById('drawToolPen')?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectDrawTool('pen');
  });
  document.getElementById('drawToolEraser')?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectDrawTool('eraser');
  });
  document.querySelectorAll('.draw-color').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      drawState.color = b.dataset.color;
      document.querySelectorAll('.draw-color').forEach(x => x.classList.toggle('active', x === b));
      selectDrawTool('pen');
    });
  });
  const custom = document.getElementById('drawCustomColor');
  custom?.addEventListener('input', (e) => {
    drawState.color = e.target.value;
    document.querySelectorAll('.draw-color').forEach(x => x.classList.remove('active'));
    selectDrawTool('pen');
  });
  custom?.addEventListener('click', (e) => e.stopPropagation());
  document.querySelectorAll('.draw-thickness-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      drawState.thickness = parseInt(b.dataset.thickness, 10);
      document.querySelectorAll('.draw-thickness-btn').forEach(x => x.classList.toggle('active', x === b));
    });
  });
  document.getElementById('drawUndoBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeTabId) { const t = tabs.find(x => x.id === activeTabId); if (t) { undoStroke(t); scheduleSessionSave(); } }
  });
  document.getElementById('drawClearBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeTabId && confirm('Clear all strokes on this canvas?')) {
      const t = tabs.find(x => x.id === activeTabId);
      if (t) { clearStrokes(t); scheduleSessionSave(); }
    }
  });
}
initDrawToolbar();
bindDrawSurface();

document.addEventListener('keydown', (e) => {
  if (!drawState.open) return;
  if (e.key === 'Escape') { e.preventDefault(); setDrawMode(false); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); document.getElementById('drawToolPen')?.click(); }
  else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); document.getElementById('drawToolEraser')?.click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (activeTabId) { const t = tabs.find(x => x.id === activeTabId); if (t) { undoStroke(t); scheduleSessionSave(); } }
  }
});

// ============== Find Panel ==============
const findPanel = document.getElementById('findPanel');
const findInput = document.getElementById('findInput');
const findCount = document.getElementById('findCount');
let findMatches = [], findCurrentIndex = -1, findLastTerm = '';
function clearFindHighlights(el) { if (!el) return; el.querySelectorAll('.find-match').forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); }); }
function performFind(term) {
  const editorEl = getActiveEditor();
  if (!editorEl) { findMatches = []; findCurrentIndex = -1; if (findCount) findCount.textContent = '0/0'; return; }
  clearFindHighlights(editorEl);
  if (!term) { findMatches = []; findCurrentIndex = -1; findLastTerm = ''; if (findCount) findCount.textContent = '0/0'; return; }
  findMatches = [];
  const lower = term.toLowerCase();
  const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) { const t = node.nodeValue; if (!t) continue; const lt = t.toLowerCase(); let pos = 0; while (pos < lt.length) { const idx = lt.indexOf(lower, pos); if (idx === -1) break; findMatches.push({ node, offset: idx, length: term.length }); pos = idx + term.length; } }
  if (findMatches.length === 0) { findCurrentIndex = -1; if (findCount) findCount.textContent = '0/0'; return; }
  findCurrentIndex = 0; findLastTerm = term;
  for (let i = 0; i < findMatches.length; i++) {
    const m = findMatches[i]; if (!m.node || !m.node.parentNode) continue;
    try { const range = document.createRange(); range.setStart(m.node, m.offset); range.setEnd(m.node, m.offset + m.length); const mark = document.createElement('span'); mark.className = 'find-match'; range.surroundContents(mark); } catch (e) {}
  }
  if (findCount) findCount.textContent = `1/${findMatches.length}`;
}
function toggleFind() { if (findPanel) { findPanel.classList.toggle('hidden'); if (!findPanel.classList.contains('hidden') && findInput) { findInput.focus(); findInput.select(); } } }
document.getElementById('menuFind')?.addEventListener('click', toggleFind);
document.getElementById('findCloseBtn')?.addEventListener('click', () => { if (findPanel) findPanel.classList.add('hidden'); });
let _findDebounce = null;
findInput?.addEventListener('input', () => { if (_findDebounce) clearTimeout(_findDebounce); _findDebounce = setTimeout(() => performFind(findInput.value.trim()), 100); });

// ============== Menu bar / bg ==============
document.querySelectorAll('.menu-label').forEach(label => {
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = label.parentElement;
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
  });
});
document.addEventListener('click', () => document.querySelectorAll('.menu').forEach(m => m.classList.remove('open')));
document.querySelectorAll('.menu-action').forEach(el => {
  el.addEventListener('click', (e) => e.stopPropagation());
});
document.getElementById('menuNew')?.addEventListener('click', () => createTab());
document.getElementById('menuOpen')?.addEventListener('click', async () => { const d = await window.api.openFile(); if (d) createTab(d); });
document.getElementById('menuSave')?.addEventListener('click', () => saveTab(activeTabId));
document.getElementById('menuSaveAs')?.addEventListener('click', () => saveTab(activeTabId, true));
document.getElementById('menuExit')?.addEventListener('click', () => window.api.windowClose());
document.getElementById('menuZoomIn')?.addEventListener('click', () => { zoomLevel = Math.min(300, zoomLevel + 10); updateZoom(); });
document.getElementById('menuZoomOut')?.addEventListener('click', () => { zoomLevel = Math.max(10, zoomLevel - 10); updateZoom(); });
document.getElementById('menuZoomReset')?.addEventListener('click', () => { zoomLevel = 100; updateZoom(); });
document.getElementById('menuBgSettings')?.addEventListener('click', () => { if (!activeTabId) return; document.getElementById('bgOverlay')?.classList.remove('hidden'); });
document.getElementById('bgCancelBtn')?.addEventListener('click', () => { document.getElementById('bgOverlay')?.classList.add('hidden'); });
document.getElementById('bgOkBtn')?.addEventListener('click', () => { document.getElementById('bgOverlay')?.classList.add('hidden'); });

// ============== Image Gallery ==============
function openGallery() {
  if (drawState.open) setDrawMode(false);
  const overlay = document.getElementById('galleryOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  updateGalleryGrid();
  updateToolbarState();
}
function closeGallery() {
  document.getElementById('galleryOverlay')?.classList.add('hidden');
  updateToolbarState();
}
document.getElementById('galleryClose')?.addEventListener('click', closeGallery);
document.getElementById('galleryAddBtn')?.addEventListener('click', () => {
  document.getElementById('galleryFileInput')?.click();
});
document.getElementById('galleryFileInput')?.addEventListener('change', (e) => {
  if (!activeTabId || !e.target.files?.length) return;
  for (const f of e.target.files) handleImageFile(f, null, true);
  e.target.value = '';
});

function updateGalleryGrid() {
  const tab = tabs.find(t => t.id === activeTabId);
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  const images = tab?.images || [];
  if (images.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">No images yet. Use + Add Image or drag images into the note.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const img of images) {
    const w = img.width || 1;
    const h = img.height || 1;
    const ratio = w / h;
    const item = document.createElement('div');
    item.className = 'gallery-item';
    if (ratio > 1.4) item.classList.add('span-wide');
    else if (ratio < 0.75) item.classList.add('span-tall');
    const sizeKB = img.size ? Math.round(img.size / 1024) : '—';
    const dims = (img.width && img.height) ? `${img.width}×${img.height}` : '';
    item.innerHTML =
      '<div class="gallery-thumb"><img src="' + img.data + '" alt="' + escapeAttr(img.name) + '" loading="lazy"></div>' +
      '<div class="gallery-item-info"><div class="img-name">' + escapeHtml(img.name) + '</div>' +
      '<div class="img-size">' + (dims ? dims + ' · ' : '') + sizeKB + ' KB</div></div>' +
      '<div class="gallery-item-actions">' +
      '<button type="button" class="gal-view" title="View / Zoom" style="font-size:12px;">🔍</button>' +
      '<button type="button" class="gal-delete" title="Remove from gallery">&#10005;</button></div>';
    // Click thumbnail or view button to open viewer
    const openViewer = (ev) => { ev.stopPropagation(); openImageViewer(img); };
    item.querySelector('.gallery-thumb')?.addEventListener('click', openViewer);
    item.querySelector('.gal-view')?.addEventListener('click', openViewer);
    item.querySelector('.gal-delete')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm('Remove this image from the gallery?')) return;
      if (!tab?.images) return;
      tab.images = tab.images.filter(x => x.id !== img.id);
      tab.isDirty = true;
      updateTabTitle(activeTabId);
      scheduleSessionSave();
      updateGalleryGrid();
    });
    grid.appendChild(item);
  }
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

// ============== Image Viewer (zoom/magnify) ==============
let viewerState = { open: false, scale: 1, panX: 0, panY: 0, dragging: false, dragStartX: 0, dragStartY: 0, imgData: null, viewerImgId: null };

function openImageViewer(imgObj) {
  const overlay = document.getElementById('imageViewerOverlay');
  const img = document.getElementById('imageViewerImg');
  const title = document.getElementById('imageViewerTitle');
  const label = document.getElementById('viewerZoomLabel');
  if (!overlay || !img) return;

  viewerState.open = true;
  viewerState.imgData = imgObj;
  viewerState.scale = 1;
  viewerState.panX = 0;
  viewerState.panY = 0;
  viewerState.viewerImgId = imgObj.id;

  img.src = imgObj.data;
  img.className = 'image-viewer-img';
  img.style.transform = 'scale(1) translate(0px, 0px)';
  if (title) title.textContent = imgObj.name || 'Image Viewer';
  if (label) label.textContent = '100%';

  overlay.classList.remove('hidden');

  img.onload = () => { fitImageToScreen(); img.onload = null; };
}

function closeImageViewer() {
  const overlay = document.getElementById('imageViewerOverlay');
  if (overlay) overlay.classList.add('hidden');
  viewerState.open = false;
  viewerState.imgData = null;
}

function fitImageToScreen() {
  const img = document.getElementById('imageViewerImg');
  const body = document.getElementById('imageViewerBody');
  if (!img || !body || !img.naturalWidth || !img.naturalHeight) return;
  const bodyRect = body.getBoundingClientRect();
  const scaleX = (bodyRect.width - 40) / img.naturalWidth;
  const scaleY = (bodyRect.height - 40) / img.naturalHeight;
  viewerState.scale = Math.min(scaleX, scaleY, 1);
  viewerState.panX = 0;
  viewerState.panY = 0;
  applyViewerTransform(true);
}

function applyViewerTransform(smooth) {
  const img = document.getElementById('imageViewerImg');
  const label = document.getElementById('viewerZoomLabel');
  if (!img) return;
  if (smooth) { img.classList.add('smooth'); setTimeout(() => img.classList.remove('smooth'), 200); }
  else img.classList.remove('smooth');
  img.style.transform = 'scale(' + viewerState.scale + ') translate(' + viewerState.panX + 'px, ' + viewerState.panY + 'px)';
  if (label) label.textContent = Math.round(viewerState.scale * 100) + '%';
}

function viewerZoom(delta) {
  viewerState.scale = Math.max(0.1, Math.min(20, viewerState.scale + delta));
  applyViewerTransform(false);
}

function viewerResetZoom() {
  viewerState.scale = 1;
  viewerState.panX = 0;
  viewerState.panY = 0;
  applyViewerTransform(true);
}

function viewerDeleteCurrentImage() {
  if (!viewerState.imgData || !activeTabId) return;
  const tab = tabs.find(function(t) { return t.id === activeTabId; });
  if (!tab || !tab.images) return;
  if (!confirm('Delete this image from the gallery?')) return;
  tab.images = tab.images.filter(function(x) { return x.id !== viewerState.viewerImgId; });
  tab.isDirty = true;
  updateTabTitle(activeTabId);
  scheduleSessionSave();
  closeImageViewer();
  refreshGalleryIfOpen();
}

document.getElementById('viewerCloseBtn')?.addEventListener('click', closeImageViewer);
document.getElementById('viewerZoomInBtn')?.addEventListener('click', function() { viewerZoom(0.25); });
document.getElementById('viewerZoomOutBtn')?.addEventListener('click', function() { viewerZoom(-0.25); });
document.getElementById('viewerFitBtn')?.addEventListener('click', fitImageToScreen);
document.getElementById('viewerResetBtn')?.addEventListener('click', viewerResetZoom);
document.getElementById('viewerDeleteBtn')?.addEventListener('click', viewerDeleteCurrentImage);

document.getElementById('imageViewerOverlay')?.addEventListener('click', function(e) {
  if (e.target.id === 'imageViewerOverlay' || e.target.id === 'imageViewerBody') closeImageViewer();
});

document.getElementById('imageViewerBody')?.addEventListener('wheel', function(e) {
  if (!viewerState.open) return;
  e.preventDefault();
  e.stopPropagation();
  viewerZoom(e.deltaY < 0 ? 0.15 : -0.15);
}, { passive: false });

(function initViewerPan() {
  var body = document.getElementById('imageViewerBody');
  if (!body) return;
  body.addEventListener('mousedown', function(e) {
    if (!viewerState.open || e.button !== 0) return;
    viewerState.dragging = true;
    viewerState.dragStartX = e.clientX - viewerState.panX * viewerState.scale;
    viewerState.dragStartY = e.clientY - viewerState.panY * viewerState.scale;
    body.classList.add('grabbing');
  });
  body.addEventListener('mousemove', function(e) {
    if (!viewerState.dragging) return;
    viewerState.panX = (e.clientX - viewerState.dragStartX) / viewerState.scale;
    viewerState.panY = (e.clientY - viewerState.dragStartY) / viewerState.scale;
    applyViewerTransform(false);
  });
  body.addEventListener('mouseup', function() { viewerState.dragging = false; body.classList.remove('grabbing'); });
  body.addEventListener('mouseleave', function() { viewerState.dragging = false; body.classList.remove('grabbing'); });
})();

document.addEventListener('keydown', function(e) {
  if (!viewerState.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeImageViewer(); return; }
  if (e.key === '+' || e.key === '=') { e.preventDefault(); viewerZoom(0.25); return; }
  if (e.key === '-') { e.preventDefault(); viewerZoom(-0.25); return; }
  if (e.key === '0') { e.preventDefault(); viewerResetZoom(); return; }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fitImageToScreen(); return; }
});

// ============== Formatting Toolbar ==============
// Track toggle modes
var formatModes = { codeBlock: false, quote: false };

function focusActiveEditor() {
  var el = getActiveEditor();
  if (el) { el.focus(); }
  return el;
}

function updateFormatButtonState() {
  document.getElementById('toolCodeBlock')?.classList.toggle('active', formatModes.codeBlock);
  document.getElementById('toolQuote')?.classList.toggle('active', formatModes.quote);
}

function isInsideTag(tagName) {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  var node = sel.anchorNode;
  while (node && node !== document.body) {
    if (node.nodeName && node.nodeName.toLowerCase() === tagName) return true;
    node = node.parentNode;
  }
  return false;
}

function insertBlockHtml(html) {
  var el = focusActiveEditor();
  if (!el) return;
  el.focus();
  insertHtmlAtCursor(html);
  updateActiveTabContent();
}

// ---- Code Block Toggle ----
document.getElementById('toolCodeBlock')?.addEventListener('click', function() {
  var el = focusActiveEditor();
  if (!el) return;

  var sel = window.getSelection();
  var text = (sel && sel.rangeCount > 0) ? sel.toString() : '';

  if (text) {
    // Wrap selected text in a code block
    var codeHtml = '<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;font-family:monospace;overflow-x:auto;margin:8px 0;white-space:pre;"><code>' + escapeHtml(text) + '</code></pre>';
    sel.getRangeAt(0).deleteContents();
    insertHtmlAtCursor(codeHtml);
    updateActiveTabContent();
  } else {
    // No selection — insert a code block at cursor position
    var pre = document.createElement('pre');
    pre.style.cssText = 'background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;font-family:monospace;overflow-x:auto;margin:8px 0;white-space:pre;';
    var code = document.createElement('code');
    code.textContent = '\u200B';
    pre.appendChild(code);
    var br = document.createElement('br');
    var sel2 = window.getSelection();
    if (sel2 && sel2.rangeCount > 0) {
      var range = sel2.getRangeAt(0);
      range.deleteContents();
      range.insertNode(br);
      range.insertNode(pre);
      // Place cursor inside the code element
      var newRange = document.createRange();
      newRange.setStart(code, 1);
      newRange.collapse(true);
      sel2.removeAllRanges();
      sel2.addRange(newRange);
    } else {
      el.appendChild(pre);
      el.appendChild(br);
    }
    updateActiveTabContent();
  }
});

// ---- Quote Block Toggle ----
document.getElementById('toolQuote')?.addEventListener('click', function() {
  var el = focusActiveEditor();
  if (!el) return;

  var sel = window.getSelection();
  var text = (sel && sel.rangeCount > 0) ? sel.toString() : '';

  if (text) {
    // Wrap selected text in a quote block
    var quoteHtml = '<blockquote style="border-left:4px solid #0078d4;margin:8px 0;padding:8px 16px;background:rgba(0,120,212,0.08);color:#ccc;border-radius:0 6px 6px 0;">' + escapeHtml(text) + '</blockquote>';
    sel.getRangeAt(0).deleteContents();
    insertHtmlAtCursor(quoteHtml);
    updateActiveTabContent();
  } else {
    // No selection — insert a blockquote at cursor position
    var bq = document.createElement('blockquote');
    bq.style.cssText = 'border-left:4px solid #0078d4;margin:8px 0;padding:8px 16px;background:rgba(0,120,212,0.08);color:#ccc;border-radius:0 6px 6px 0;';
    bq.textContent = '\u200B';
    var br2 = document.createElement('br');
    var sel3 = window.getSelection();
    if (sel3 && sel3.rangeCount > 0) {
      var range2 = sel3.getRangeAt(0);
      range2.deleteContents();
      range2.insertNode(br2);
      range2.insertNode(bq);
      // Place cursor inside the blockquote
      var newRange2 = document.createRange();
      newRange2.setStart(bq.firstChild, 1);
      newRange2.collapse(true);
      sel3.removeAllRanges();
      sel3.addRange(newRange2);
    } else {
      el.appendChild(bq);
      el.appendChild(br2);
    }
    updateActiveTabContent();
  }
});

// ---- Insert Table ----
document.getElementById('toolTable')?.addEventListener('click', function() {
  focusActiveEditor();
  var html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;">' +
    '<tr>' +
    '<td style="border:1px solid #555;padding:8px 12px;background:rgba(0,120,212,0.15);font-weight:600;">Header 1</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;background:rgba(0,120,212,0.15);font-weight:600;">Header 2</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;background:rgba(0,120,212,0.15);font-weight:600;">Header 3</td>' +
    '</tr>' +
    '<tr>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 1</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 2</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 3</td>' +
    '</tr>' +
    '<tr>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 4</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 5</td>' +
    '<td style="border:1px solid #555;padding:8px 12px;">Cell 6</td>' +
    '</tr>' +
    '</table><p><br></p>';
  insertBlockHtml(html);
});

// ---- Bold ----
document.getElementById('toolBold')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('bold', false, null);
  updateActiveTabContent();
});

// ---- Italic ----
document.getElementById('toolItalic')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('italic', false, null);
  updateActiveTabContent();
});

// ---- Underline ----
document.getElementById('toolUnderline')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('underline', false, null);
  updateActiveTabContent();
});

// ---- Strikethrough ----
document.getElementById('toolStrike')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('strikeThrough', false, null);
  updateActiveTabContent();
});

// ---- Bullet List ----
document.getElementById('toolBulletList')?.addEventListener('click', function() {
  focusActiveEditor();
  var sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    var text = sel.toString();
    if (text) {
      var lines = text.split('\n').filter(function(l) { return l.trim().length > 0; });
      var html = '<ul style="margin:8px 0;padding-left:24px;">';
      for (var i = 0; i < lines.length; i++) {
        html += '<li style="margin:4px 0;">' + escapeHtml(lines[i].trim()) + '</li>';
      }
      html += '</ul>';
      sel.getRangeAt(0).deleteContents();
      insertBlockHtml(html);
    } else {
      insertBlockHtml('<ul><li>Item</li></ul>');
    }
  }
});

// ---- Numbered List ----
document.getElementById('toolNumberList')?.addEventListener('click', function() {
  focusActiveEditor();
  var sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    var text = sel.toString();
    if (text) {
      var lines = text.split('\n').filter(function(l) { return l.trim().length > 0; });
      var html = '<ol style="margin:8px 0;padding-left:24px;">';
      for (var i = 0; i < lines.length; i++) {
        html += '<li style="margin:4px 0;">' + escapeHtml(lines[i].trim()) + '</li>';
      }
      html += '</ol>';
      sel.getRangeAt(0).deleteContents();
      insertBlockHtml(html);
    } else {
      insertBlockHtml('<ol><li>Item</li></ol>');
    }
  }
});

// ---- Heading 1 ----
document.getElementById('toolHeading1')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('formatBlock', false, 'h1');
  updateActiveTabContent();
});

// ---- Heading 2 ----
document.getElementById('toolHeading2')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('formatBlock', false, 'h2');
  updateActiveTabContent();
});

// ---- Heading 3 ----
document.getElementById('toolHeading3')?.addEventListener('click', function() {
  focusActiveEditor();
  document.execCommand('formatBlock', false, 'h3');
  updateActiveTabContent();
});

// ---- Toggle Markdown Preview ----
let markdownPreviewActive = false;
document.getElementById('toolMarkdown')?.addEventListener('click', function() {
  var el = getActiveEditor();
  if (!el) return;
  markdownPreviewActive = !markdownPreviewActive;
  document.getElementById('toolMarkdown')?.classList.toggle('active', markdownPreviewActive);
  if (markdownPreviewActive) {
    var raw = el.innerText || el.textContent || '';
    el.innerHTML = renderMarkdown(raw);
    el.contentEditable = 'false';
    el.style.whiteSpace = 'normal';
  } else {
    el.contentEditable = 'true';
    el.style.whiteSpace = 'pre-wrap';
    updateActiveTabContent();
  }
});

// ---- Track cursor position for active state ----
function updateFormatActiveState() {
  if (markdownPreviewActive) return;
  // Bold / Italic / Underline / Strikethrough — check document.queryCommandState
  document.getElementById('toolBold')?.classList.toggle('active', document.queryCommandState('bold'));
  document.getElementById('toolItalic')?.classList.toggle('active', document.queryCommandState('italic'));
  document.getElementById('toolUnderline')?.classList.toggle('active', document.queryCommandState('underline'));
  document.getElementById('toolStrike')?.classList.toggle('active', document.queryCommandState('strikeThrough'));
  // Heading state
  var inH1 = isInsideTag('h1');
  var inH2 = isInsideTag('h2');
  var inH3 = isInsideTag('h3');
  document.getElementById('toolHeading1')?.classList.toggle('active', inH1);
  document.getElementById('toolHeading2')?.classList.toggle('active', inH2);
  document.getElementById('toolHeading3')?.classList.toggle('active', inH3);
  // List state
  document.getElementById('toolBulletList')?.classList.toggle('active', isInsideTag('ul'));
  document.getElementById('toolNumberList')?.classList.toggle('active', isInsideTag('ol'));
  // Code state
  document.getElementById('toolCodeBlock')?.classList.toggle('active', formatModes.codeBlock || isInsideTag('pre'));
  // Quote state
  document.getElementById('toolQuote')?.classList.toggle('active', formatModes.quote || isInsideTag('blockquote'));
}

// Attach to editor events to track active state
document.addEventListener('selectionchange', function() {
  if (!activeTabId) return;
  if (drawState.open || markdownPreviewActive) return;
  updateFormatActiveState();
});

function renderMarkdown(text) {
  var html = escapeHtml(text);
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 style="color:#e0e0e0;margin:16px 0 8px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="color:#e0e0e0;margin:20px 0 10px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="color:#e0e0e0;margin:24px 0 12px;">$1</h1>');
  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#2d2d2d;color:#e06c75;padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>');
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;font-family:monospace;overflow-x:auto;"><code>$1</code></pre>');
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #0078d4;margin:8px 0;padding:8px 16px;background:rgba(0,120,212,0.08);color:#ccc;">$1</blockquote>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #555;margin:16px 0;">');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ============== Shortcuts Modal ==============
const SHORTCUT_GROUPS = [
  { title: 'File', items: [
    ['New tab', 'Ctrl+N'], ['Open file', 'Ctrl+O'], ['Save note', 'Ctrl+S'],
    ['Save as', 'Ctrl+Shift+S'], ['Close tab', 'Ctrl+W'], ['Exit app', 'Alt+F4']
  ]},
  { title: 'Edit', items: [
    ['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['Cut', 'Ctrl+X'], ['Copy', 'Ctrl+C'],
    ['Paste', 'Ctrl+V'], ['Select all', 'Ctrl+A'], ['Find in file', 'Ctrl+F'],
    ['Italic', 'Ctrl+I'], ['Image gallery', 'Ctrl+Shift+I']
  ]},
  { title: 'View', items: [
    ['Zoom in', 'Ctrl++'], ['Zoom out', 'Ctrl+-'], ['Reset zoom', 'Ctrl+0'],
    ['Background settings', 'View menu'], ['Next tab', 'Ctrl+Tab'], ['Previous tab', 'Ctrl+Shift+Tab']
  ]},
  { title: 'Toolbar (right side)', items: [
    ['Open draw canvas', 'Draw icon'], ['Image gallery', 'Grid icon'],
    ['Add image to gallery', '+ Add Image in gallery']
  ]},
  { title: 'Draw canvas', items: [
    ['Pen', 'P'], ['Eraser', 'E'], ['Undo stroke', 'Ctrl+Z'],
    ['Save & close (keeps vector strokes)', 'Done button'], ['Exit without toolbar', 'Escape']
  ]},
  { title: 'Formatting toolbar', items: [
    ['Bold / Italic / Underline / Strike', 'Toolbar B I U S'],
    ['Headings H1–H3', 'Toolbar'], ['Lists & tables', 'Toolbar'],
    ['Code block & markdown preview', 'Toolbar']
  ]}
];

function openShortcutsModal() {
  const grid = document.getElementById('shortcutsGrid');
  const overlay = document.getElementById('shortcutsOverlay');
  if (!grid || !overlay) return;
  grid.innerHTML = '';
  for (const g of SHORTCUT_GROUPS) {
    const title = document.createElement('div');
    title.className = 'shortcut-group-title';
    title.textContent = g.title;
    grid.appendChild(title);
    for (const [action, keys] of g.items) {
      const item = document.createElement('div');
      item.className = 'shortcut-item';
      item.innerHTML = '<span class="action-name">' + escapeHtml(action) + '</span><span class="action-keys">' + escapeHtml(keys) + '</span>';
      grid.appendChild(item);
    }
  }
  overlay.classList.remove('hidden');
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
}

document.getElementById('menuShortcuts')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openShortcutsModal();
});
document.getElementById('shortcutsCloseBtn')?.addEventListener('click', () => {
  document.getElementById('shortcutsOverlay')?.classList.add('hidden');
});
document.getElementById('shortcutsOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'shortcutsOverlay') document.getElementById('shortcutsOverlay')?.classList.add('hidden');
});

// ============== Init ==============
async function initApp() {
  try {
    const data = await window.api.loadSession?.();
    if (data && data.tabs && data.tabs.length > 0) {
      for (const t of data.tabs) {
        const id = createTab();
        const tab = tabs.find(x => x.id === id);
        if (tab) {
          tab.path = t.path;
          tab.title = t.title;
          tab.content = t.content || '';
          tab.bgSettings = t.bgSettings || { url: '', color: '' };
          tab.drawing = t.drawing || { strokes: [], history: [], historyIndex: -1 };
          tab.images = t.images || [];
          const el = document.getElementById('editor_' + id);
          if (el) el.innerHTML = tab.content;
          updateTabTitle(id);
        }
      }
      if (data.activeTabId && tabs.find(t => t.id === data.activeTabId)) setActiveTab(data.activeTabId);
    } else { createTab(); }
  } catch (e) { createTab(); }
}
initApp();

window.api.onRequestClose?.(async () => {
  const dirty = tabs.filter(t => t.isDirty);
  if (dirty.length > 0) {
    const r = await window.api.showMessageBox({ type: "question", buttons: ["Close Anyway", "Cancel"], title: "GhostNotepad", message: "You have unsaved tabs. Close anyway?", cancelId: 1 });
    if (r.response === 1) return;
  }
  if (window.api.saveSession) { syncTabsContent(); await window.api.saveSession({ tabs: tabs.map(tabSnapshot), activeTabId }); }
  window.api.forceClose();
});
