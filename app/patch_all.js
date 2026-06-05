const fs = require('fs');
let js = fs.readFileSync('renderer.js', 'utf8');

// 1. Fix Help > Shortcuts modal
if (!js.includes('menuShortcuts') && !js.includes('shortcutsGrid')) {
  const shortcutsCode = `
// ============== Shortcuts Modal ==============
document.getElementById('menuShortcuts')?.addEventListener('click', () => {
  const grid = document.getElementById('shortcutsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const groups = [
    { title: 'File', items: [
      ['New Tab', 'Ctrl+N'], ['Open File', 'Ctrl+O'], ['Save', 'Ctrl+S'],
      ['Save As', 'Ctrl+Shift+S'], ['Close Tab', 'Ctrl+W']
    ]},
    { title: 'Edit', items: [
      ['Find in File', 'Ctrl+F'], ['Italic', 'Ctrl+I'], ['Insert Image', 'Ctrl+Shift+I'],
      ['Paste Plain', 'Ctrl+Shift+V']
    ]},
    { title: 'View', items: [
      ['Zoom In', 'Ctrl++'], ['Zoom Out', 'Ctrl+-'], ['Reset Zoom', 'Ctrl+0'],
      ['Cycle Tabs Forward', 'Ctrl+Tab'], ['Cycle Tabs Backward', 'Ctrl+Shift+Tab']
    ]},
    { title: 'Draw Mode', items: [
      ['Open Draw Panel', 'Click pen icon'], ['Pen Tool', 'P'], ['Eraser', 'E'],
      ['Undo Stroke', 'Ctrl+Z'], ['Exit Draw', 'Escape']
    ]}
  ];
  for (const g of groups) {
    const title = document.createElement('div');
    title.className = 'shortcut-group-title';
    title.textContent = g.title;
    grid.appendChild(title);
    for (const [action, keys] of g.items) {
      const item = document.createElement('div');
      item.className = 'shortcut-item';
      item.innerHTML = '<span class="action-name">' + action + '</span><span class="action-keys">' + keys + '</span>';
      grid.appendChild(item);
    }
  }
  document.getElementById('shortcutsOverlay')?.classList.remove('hidden');
});
document.getElementById('shortcutsCloseBtn')?.addEventListener('click', () => {
  document.getElementById('shortcutsOverlay')?.classList.add('hidden');
});
`;
  js = js.replace('// ============== Init ==============', shortcutsCode + '\n// ==============');
  console.log('1. Added shortcuts modal');
}

// 2. Replace setDrawMode to use full overlay
js = js.replace(
  /function setDrawMode\(on\) \{[\s\S]*?\n\}/,
  `function setDrawMode(on) {
  drawState.open = on;
  const overlay = document.getElementById('drawOverlay');
  if (overlay) overlay.classList.toggle('hidden', !on);
  const tb = document.getElementById('toolDrawToggle');
  if (tb) tb.classList.toggle('active', on);
  if (on) {
    const c = document.getElementById('drawCanvasFull');
    if (c) {
      c.width = window.innerWidth;
      c.height = window.innerHeight - 60;
      const t = tabs.find(x => x.id === activeTabId);
      if (t && t.drawing) replayAllStrokes(c, t.drawing.strokes);
    }
  } else {
    const e = getActiveEditor();
    if (e) e.focus();
  }
}`
);
console.log('2. Replaced setDrawMode');

// 3. Replace getActiveDrawCanvas
js = js.replace(
  /function getActiveDrawCanvas\(\) \{[^}]*\}/,
  `function getActiveDrawCanvas() { return document.getElementById('drawCanvasFull'); }`
);
console.log('3. Replaced getActiveDrawCanvas');

// 4. Replace drawStart to remove canvas.active check
js = js.replace(
  /function drawStart\(e\) \{[\s\S]*?drawState\.currentStroke = \{[^}]*\};[\s\n]*\}/,
  `function drawStart(e) {
  if (!drawState.open || !activeTabId) return;
  const c = getActiveDrawCanvas();
  if (!c) return;
  e.preventDefault();
  const { x, y } = getOverlayCoords(c, e);
  drawState.drawing = true; drawState.lastX = x; drawState.lastY = y;
  drawState.currentStroke = { tool: drawState.tool, color: drawState.color, thickness: drawState.thickness, points: [{ x, y }] };
}`
);
console.log('4. Replaced drawStart');

// 5. Replace drawMove
js = js.replace(
  /function drawMove\(e\) \{[\s\S]*?drawState\.lastY = y;[\s\n]*\}/,
  `function drawMove(e) {
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
}`
);
console.log('5. Replaced drawMove');

// 6. Replace pointerdown handler
js = js.replace(
  /document\.addEventListener\('pointerdown'[\s\S]*?\}\);[\s\n]*document\.addEventListener\('pointermove'/,
  `document.addEventListener('pointerdown', (e) => {
  if (!drawState.open) return;
  if (e.target && e.target.closest && (e.target.closest('.draw-toolbar') || e.target.closest('.gallery-overlay') || e.target.closest('.settings-overlay'))) return;
  const c = getActiveDrawCanvas();
  if (c) drawStart(e);
});
document.addEventListener('pointermove'`
);
console.log('6. Replaced pointerdown handler');

// 7. Replace setActiveTab to not reference per-tab draw canvases
js = js.replace(
  /document\.querySelectorAll\('\.draw-canvas-overlay'\)\.forEach\(c => c\.removeClass\('active'\)\);/,
  `// draw canvas is now a single shared overlay`
);
js = js.replace(
  /const drawCanvas = document\.getElementById\(`drawOverlay_\$\{id\}`\);[\s\S]*?if \(drawCanvas && drawState\.open\) \{[\s\S]*?replayAllStrokes\(drawCanvas, tab\.drawing\.strokes\);[\s\S]*?\}/,
  `// draw canvas is now shared`
);
console.log('7. Fixed setActiveTab');

// 8. Remove per-tab draw canvas creation from createTab
js = js.replace(
  /\n  \/\/ draw canvas overlay \(CRITICAL.*?\n  const drawCanvas[\s\S]*?editorContainer\.appendChild\(drawCanvas\);\n/,
  '\n'
);
console.log('8. Removed per-tab canvas creation from createTab');

// 9. Remove drawOverlay removal from closeTab
js = js.replace(
  /document\.getElementById\(`drawOverlay_\$\{id\}`\)\?\.remove\(\);/,
  '// draw canvas is shared, no per-tab removal needed'
);
console.log('9. Fixed closeTab');

// 10. Replace old side-panel draggable code
js = js.replace(
  /\/\/ ============== Make panel draggable ==============[\s\S]*?\}\)\(\);/,
  `// ============== Draw Save & Close ==============
document.getElementById('drawSaveBtn')?.addEventListener('click', () => {
  scheduleSessionSave();
  setDrawMode(false);
});

// ============== Image Gallery ==============
document.getElementById('toolGallery')?.addEventListener('click', () => {
  const overlay = document.getElementById('galleryOverlay');
  if (overlay) { overlay.classList.toggle('hidden'); updateGalleryGrid(); }
});
document.getElementById('galleryClose')?.addEventListener('click', () => {
  document.getElementById('galleryOverlay')?.classList.add('hidden');
});
document.getElementById('galleryAddBtn')?.addEventListener('click', () => {
  document.getElementById('galleryFileInput')?.click();
});
document.getElementById('galleryFileInput')?.addEventListener('change', (e) => {
  if (!activeTabId || !e.target.files) return;
  const tab = tabs.find(x => x.id === activeTabId);
  if (!tab) return;
  if (!tab.images) tab.images = [];
  for (const f of e.target.files) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      tab.images.push({
        id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
        name: f.name, data: ev.target.result, size: f.size, type: f.type
      });
      scheduleSessionSave();
      updateGalleryGrid();
    };
    reader.readAsDataURL(f);
  }
  e.target.value = '';
});
function updateGalleryGrid() {
  const tab = tabs.find(x => x.id === activeTabId);
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  const images = tab?.images || [];
  if (images.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">No images yet. Use + Add Image to add one.</div>';
    return;
  }
  grid.innerHTML = '';
  for (const img of images) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const sizeKB = Math.round(img.size / 1024);
    item.innerHTML =
      '<img src="' + img.data + '" alt="' + img.name + '" loading="lazy">' +
      '<div class="gallery-item-info"><div class="img-name">' + img.name + '</div><div class="img-size">' + sizeKB + ' KB</div></div>' +
      '<div class="gallery-item-actions"><button class="gal-insert" title="Insert in note">&#8615;</button><button class="gal-delete" title="Delete">&#10005;</button></div>';
    item.querySelector('.gal-insert')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!activeTabId) return;
      const ed = getActiveEditor();
      if (ed) { ed.focus(); document.execCommand('insertImage', false, img.data); updateActiveTabContent(); scheduleSessionSave(); }
      document.getElementById('galleryOverlay')?.classList.add('hidden');
    });
    item.querySelector('.gal-delete')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm('Delete this image?')) return;
      if (!tab?.images) return;
      tab.images = tab.images.filter(x => x.id !== img.id);
      scheduleSessionSave();
      updateGalleryGrid();
    });
    grid.appendChild(item);
  }
}`
);
console.log('10. Added draw save + image gallery');

// 11. Update initApp to restore drawing and images
js = js.replace(
  /tab\.bgSettings = t\.bgSettings \|\| \{ url: "", color: "" \};/,
  `tab.bgSettings = t.bgSettings || { url: '', color: '' };
          tab.drawing = t.drawing || { strokes: [], history: [], historyIndex: -1 };
          tab.images = t.images || [];`
);
console.log('11. Updated initApp to restore drawing + images');

// 12. Update session save to include drawing and images
js = js.replace(
  /tabs: tabs\.map\(t => \(\{ path: t\.path, title: t\.title, content: t\.content, bgSettings: t\.bgSettings \}\)\)/g,
  `tabs: tabs.map(t => ({ path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings, drawing: t.drawing, images: t.images }))`
);
console.log('12. Updated session save');

// 13. Update createTab to include images array
js = js.replace(
  /drawing: \{ strokes: \[\], history: \[\], historyIndex: -1 \}[\s\n]*\};/,
  `drawing: { strokes: [], history: [], historyIndex: -1 },
    images: []
  };`
);
console.log('13. Added images to tab object');

// 14. Add scheduleSessionSave if missing
if (!js.includes('function scheduleSessionSave')) {
  js = js.replace(
    'function syncTabsContent',
    `function scheduleSessionSave() {
  if (_saveSessionTimer) clearTimeout(_saveSessionTimer);
  _saveSessionTimer = setTimeout(async () => {
    if (!window.api.saveSession || _saveSessionInFlight) return;
    _saveSessionInFlight = true;
    try {
      syncTabsContent();
      await window.api.saveSession({ tabs: tabs.map(t => ({ path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings, drawing: t.drawing, images: t.images })), activeTabId });
    } catch (e) {} finally { _saveSessionInFlight = false; }
  }, 2000);
}
function syncTabsContent`
  );
  console.log('14. Added scheduleSessionSave');
}

// Write the patched file
fs.writeFileSync('renderer.js', js);
console.log('Done! Lines: ' + js.split('\n').length);

// Verify syntax
try { new Function(js); console.log('Syntax check: PASSED'); } catch(e) { console.log('Syntax error: ' + e.message); }