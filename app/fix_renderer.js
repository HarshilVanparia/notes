const fs = require('fs');
let c = fs.readFileSync('renderer.js', 'utf8');
let lines = c.split('\n');
const newEnd = [
  '        const id = createTab();',
  '        const tab = tabs.find(x => x.id === id);',
  '        if (tab) {',
  '          tab.path = t.path;',
  '          tab.title = t.title;',
  '          tab.content = t.content || "";',
  '          tab.bgSettings = t.bgSettings || { url: "", color: "" };',
  '          const el = document.getElementById("editor_" + id);',
  '          if (el) el.innerHTML = tab.content;',
  '          updateTabTitle(id);',
  '        }',
  '      }',
  '      if (data.activeTabId && tabs.find(t => t.id === data.activeTabId)) setActiveTab(data.activeTabId);',
  '    } else { createTab(); }',
  '  } catch (e) { createTab(); }',
  '}',
  'initApp();',
  '',
  'window.api.onRequestClose?.(async () => {',
  '  const dirty = tabs.filter(t => t.isDirty);',
  '  if (dirty.length > 0) {',
  '    const r = await window.api.showMessageBox({ type: "question", buttons: ["Close Anyway", "Cancel"], title: "Notes", message: "You have unsaved tabs. Close anyway?", cancelId: 1 });',
  '    if (r.response === 1) return;',
  '  }',
  '  if (window.api.saveSession) { syncTabsContent(); await window.api.saveSession({ tabs: tabs.map(t => ({ path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings })), activeTabId }); }',
  '  window.api.forceClose();',
  '});',
  '',
  '// Remove any trailing incomplete const id lines',
  'const finalLines = fs.readFileSync("renderer.js", "utf8").split("\\n").filter(l => !l.match(/^\\s*const\\s+id\\s*$/));',
  'fs.writeFileSync("renderer.js", finalLines.join("\\n"));'
];
lines = lines.slice(0, 638).concat(newEnd);
fs.writeFileSync('renderer.js', lines.join('\n'));
console.log('Fixed! Lines: ' + lines.length);

// Verify
try {
  new Function(fs.readFileSync('renderer.js', 'utf8'));
  console.log('Syntax check: OK');
} catch(e) {
  console.log('Syntax check ERROR:', e.message);
}