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

const MIN_ZOOM = 10;
const MAX_ZOOM = 300;

// Window Controls
document.getElementById('minBtn')?.addEventListener('click', () => window.api.windowMin());
document.getElementById('maxBtn')?.addEventListener('click', () => window.api.windowMax());
document.getElementById('closeBtn')?.addEventListener('click', () => window.api.windowClose());

function createTab(fileData = null) {
  const id = 'tab_' + (++tabCounter);
  const tab = {
    id,
    path: fileData ? fileData.path : null,
    title: fileData ? getFileName(fileData.path) : 'Untitled',
    content: fileData ? fileData.content : '',
    isDirty: false,
    bgSettings: { url: '', opacity: 0.2 }
  };
  tabs.push(tab);
  
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `tab_el_${id}`;
  tabEl.innerHTML = `
    <div class="tab-title" id="title_${id}">${tab.title}</div>
    <div class="tab-close" data-id="${id}">&#x2715;</div>
  `;
  tabEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab-close')) setActiveTab(id);
  });
  
  const closeBtn = tabEl.querySelector('.tab-close');
  closeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeTab(id);
  });
  
  tabsList.appendChild(tabEl);
  
  const editorEl = document.createElement('div');
  editorEl.className = 'editor';
  editorEl.id = `editor_${id}`;
  editorEl.contentEditable = 'true';
  editorEl.spellcheck = true;
  editorEl.innerHTML = tab.content;
  editorContainer.appendChild(editorEl);
  
  editorEl.addEventListener('input', () => {
    tab.isDirty = true;
    tab.content = editorEl.innerHTML;
    updateTabTitle(id);
    updateStatus();
  });
  
  editorEl.addEventListener('keyup', updateStatus);
  editorEl.addEventListener('click', updateStatus);
  
  // Image drop
  editorEl.addEventListener('dragover', (e) => e.preventDefault());
  editorEl.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0], editorEl);
    }
  });

  // Paste image
  editorEl.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        e.preventDefault();
        const blob = item.getAsFile();
        handleImageFile(blob, editorEl);
      }
    }
  });

  setActiveTab(id);
  return id;
}

function handleImageFile(file, editorEl) {
  if (!file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.execCommand('insertImage', false, e.target.result);
  };
  reader.readAsDataURL(file);
}

function getFileName(filePath) {
  if (!filePath) return 'Untitled';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

window.api.onOpenInitialFile?.(async (filePath) => {
  // Check if file is already open
  const existingTab = tabs.find(t => t.path === filePath);
  if (existingTab) {
    setActiveTab(existingTab.id);
    return;
  }
  
  try {
    const fileData = await window.api.openFileSpecific(filePath);
    if (fileData) {
      createTab(fileData);
    }
  } catch (e) {}
});

// Since I need to read file without dialog, I'll add file:read to preload


function setActiveTab(id) {
  activeTabId = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.editor').forEach(e => e.classList.remove('active'));
  
  const tabEl = document.getElementById(`tab_el_${id}`);
  const editorEl = document.getElementById(`editor_${id}`);
  
  if (tabEl) tabEl.classList.add('active');
  if (editorEl) {
    editorEl.classList.add('active');
    editorEl.focus();
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      if (tab.bgSettings.url) {
        editorEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,${1 - tab.bgSettings.opacity}), rgba(0,0,0,${1 - tab.bgSettings.opacity})), url('${tab.bgSettings.url}')`;
      } else {
        editorEl.style.backgroundImage = 'none';
      }
    }
  }
  
  updateStatus();
  updateZoom();
}

function getActiveTabIndex() {
  return tabs.findIndex(t => t.id === activeTabId);
}

function cycleTab(direction) {
  if (tabs.length < 2) return;

  const currentIndex = getActiveTabIndex();
  if (currentIndex === -1) return;

  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  setActiveTab(tabs[nextIndex].id);
}

function setZoomLevel(nextZoom) {
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
  updateZoom();
}

function changeZoom(delta) {
  setZoomLevel(zoomLevel + delta);
}

function showInfoPopup(message) {
  window.api.showMessageBox?.({
    type: 'info',
    buttons: ['OK'],
    title: 'Notes',
    message,
  });
}

function restoreSavedSelection() {
  if (!savedSelectionRange) return null;

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedSelectionRange);
  return selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
}

function getSelectionRange() {
  if (savedSelectionRange) {
    return restoreSavedSelection();
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0);
}

function applySelectionFontSize(delta) {
  const range = getSelectionRange();
  if (!range || range.collapsed) return;

  const selection = window.getSelection();
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  const computedSize = parseFloat(window.getComputedStyle(container || document.body).fontSize) || 14;
  const nextSize = Math.max(8, computedSize + (delta * 2));

  const span = document.createElement('span');
  span.style.fontSize = `${nextSize}px`;
  span.appendChild(range.extractContents());
  range.insertNode(span);

  if (selection) {
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
    savedSelectionRange = nextRange.cloneRange();
  }

  updateActiveTabContent();
}

async function closeTab(id) {
  const tabIndex = tabs.findIndex(t => t.id === id);
  if (tabIndex === -1) return;
  const tab = tabs[tabIndex];
  
  if (tab.isDirty) {
    const response = await window.api.showMessageBox({
      type: 'question',
      buttons: ['Save', 'Don\'t Save', 'Cancel'],
      title: 'Notes',
      message: `Save changes to ${tab.title}?`,
      cancelId: 2
    });
    
    if (response.response === 0) {
      await saveTab(id);
    } else if (response.response === 2) {
      return;
    }
  }
  
  document.getElementById(`tab_el_${id}`).remove();
  document.getElementById(`editor_${id}`).remove();
  tabs.splice(tabIndex, 1);
  
  if (tabs.length === 0) {
    createTab();
  } else if (activeTabId === id) {
    const nextTab = tabs[Math.max(0, tabIndex - 1)];
    setActiveTab(nextTab.id);
  }
}

function updateTabTitle(id) {
  const tab = tabs.find(t => t.id === id);
  if (tab) {
    const titleEl = document.getElementById(`title_${id}`);
    titleEl.textContent = tab.title + (tab.isDirty ? ' *' : '');
  }
}

function updateStatus() {
  if (!activeTabId) return;
  const editorEl = document.getElementById(`editor_${activeTabId}`);
  const text = editorEl.innerText || '';
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const chars = text.length;
  wordCount.textContent = `Words: ${words} | Chars: ${chars}`;
}

async function saveTab(id, saveAs = false) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return false;
  
  const editorEl = document.getElementById(`editor_${id}`);
  const content = editorEl.innerHTML;
  
  const newPath = await window.api.saveFile(content, saveAs ? null : tab.path);
  if (newPath) {
    tab.path = newPath;
    tab.title = getFileName(newPath);
    tab.isDirty = false;
    tab.content = content;
    updateTabTitle(id);
    statusInfo.textContent = `Saved: ${tab.title}`;
    return true;
  }
  return false;
}

addTabBtn.addEventListener('click', () => createTab());

// Shortcuts
document.addEventListener('keydown', async (e) => {
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
    return;
  }

  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); createTab(); }
  if (e.ctrlKey && e.key === 'o') { 
    e.preventDefault(); 
    const data = await window.api.openFile();
    if (data) createTab(data);
  }
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    if (e.shiftKey) saveTab(activeTabId, true);
    else saveTab(activeTabId, false);
  }
  if (e.ctrlKey && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
  if (e.ctrlKey && e.key === 'f') { e.preventDefault(); toggleFind(); }
  if (e.ctrlKey && e.key === 'i') { 
    e.preventDefault(); 
    document.getElementById('menuInsertImage').click();
  }
  
  if (e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); changeZoom(10); }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); changeZoom(-10); }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); setZoomLevel(100); }
});

document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;

  e.preventDefault();
  changeZoom(e.deltaY < 0 ? 10 : -10);
}, { passive: false });

function updateZoom() {
  if (activeTabId) {
    const editorEl = document.getElementById(`editor_${activeTabId}`);
    if (editorEl) editorEl.style.fontSize = `${14 * (zoomLevel / 100)}px`;
  }
  zoomInfo.textContent = `${zoomLevel}%`;
}

// Menu Handlers
document.querySelectorAll('.menu-label').forEach(label => {
  label.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = label.parentElement;
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
});

// File Menu
document.getElementById('menuNew').addEventListener('click', () => createTab());
document.getElementById('menuOpen').addEventListener('click', async () => {
  const data = await window.api.openFile();
  if (data) createTab(data);
});
document.getElementById('menuSave').addEventListener('click', () => saveTab(activeTabId));
document.getElementById('menuSaveAs').addEventListener('click', () => saveTab(activeTabId, true));
document.getElementById('menuExit').addEventListener('click', () => window.api.windowClose());

document.getElementById('menuInsertImage').addEventListener('click', () => {
  if (!activeTabId) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    if (e.target.files.length > 0) {
      handleImageFile(e.target.files[0], document.getElementById(`editor_${activeTabId}`));
    }
  };
  input.click();
});

// View Menu
document.getElementById('menuZoomIn').addEventListener('click', () => { zoomLevel += 10; updateZoom(); });
document.getElementById('menuZoomOut').addEventListener('click', () => { zoomLevel = Math.max(10, zoomLevel - 10); updateZoom(); });
document.getElementById('menuZoomReset').addEventListener('click', () => { zoomLevel = 100; updateZoom(); });

// Formatting Panel
const formatPanel = document.getElementById('formatPanel');
document.addEventListener('contextmenu', (e) => {
  const selection = window.getSelection();
  if (!selection.isCollapsed && e.target.closest('.editor')) {
    e.preventDefault();
    savedSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    formatPanel.style.left = `${e.pageX}px`;
    formatPanel.style.top = `${e.pageY}px`;
    formatPanel.classList.remove('hidden');
  } else {
    savedSelectionRange = null;
    formatPanel.classList.add('hidden');
  }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#formatPanel') && !e.target.closest('.menu')) {
    formatPanel.classList.add('hidden');
  }
});

document.getElementById('fmtBold').addEventListener('click', () => { document.execCommand('bold', false, null); updateActiveTabContent(); });
document.getElementById('fmtItalic').addEventListener('click', () => { document.execCommand('italic', false, null); updateActiveTabContent(); });
document.getElementById('fmtUnderline').addEventListener('click', () => { document.execCommand('underline', false, null); updateActiveTabContent(); });
document.getElementById('fmtColor').addEventListener('input', (e) => { document.execCommand('foreColor', false, e.target.value); updateActiveTabContent(); });
document.getElementById('fmtHighlight').addEventListener('input', (e) => { document.execCommand('hiliteColor', false, e.target.value); updateActiveTabContent(); });
document.getElementById('fmtHighlightClear').addEventListener('click', () => { document.execCommand('hiliteColor', false, 'transparent'); updateActiveTabContent(); });

document.getElementById('fmtSizeInc').addEventListener('click', () => {
  applySelectionFontSize(1);
});
document.getElementById('fmtSizeDec').addEventListener('click', () => {
  applySelectionFontSize(-1);
});

function updateActiveTabContent() {
  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    const editorEl = document.getElementById(`editor_${activeTabId}`);
    if (tab && editorEl) {
      tab.content = editorEl.innerHTML;
      tab.isDirty = true;
      updateTabTitle(activeTabId);
    }
  }
}

// Background Customization
const bgOverlay = document.getElementById('bgOverlay');
const bgFileInput = document.getElementById('bgFileInput');
const bgOpacityInput = document.getElementById('bgOpacityInput');
const bgOpacityVal = document.getElementById('bgOpacityVal');

bgOpacityInput.addEventListener('input', (e) => {
  bgOpacityVal.textContent = e.target.value;
  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.bgSettings.url) {
      const editorEl = document.getElementById(`editor_${activeTabId}`);
      editorEl.style.backgroundImage = `linear-gradient(rgba(10,10,10,${1 - e.target.value}), rgba(10,10,10,${1 - e.target.value})), url('${tab.bgSettings.url}')`;
    }
  }
});

let tempBgDataUrl = null;
bgFileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      tempBgDataUrl = event.target.result;
      if (activeTabId) {
        const editorEl = document.getElementById(`editor_${activeTabId}`);
        const opacity = bgOpacityInput.value;
        editorEl.style.backgroundImage = `linear-gradient(rgba(10,10,10,${1 - opacity}), rgba(10,10,10,${1 - opacity})), url('${tempBgDataUrl}')`;
      }
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('menuBgSettings').addEventListener('click', () => {
  if (!activeTabId) return;
  const tab = tabs.find(t => t.id === activeTabId);
  bgFileInput.value = '';
  tempBgDataUrl = tab.bgSettings.url || null;
  bgOpacityInput.value = tab.bgSettings.opacity !== undefined ? tab.bgSettings.opacity : 0.2;
  bgOpacityVal.textContent = bgOpacityInput.value;
  bgOverlay.classList.remove('hidden');
});
document.getElementById('bgCancelBtn').addEventListener('click', () => {
  if (activeTabId) setActiveTab(activeTabId); // restore original
  bgOverlay.classList.add('hidden');
});
document.getElementById('bgOkBtn').addEventListener('click', () => {
  if (!activeTabId) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (tempBgDataUrl) tab.bgSettings.url = tempBgDataUrl;
  tab.bgSettings.opacity = parseFloat(bgOpacityInput.value);
  setActiveTab(activeTabId);
  bgOverlay.classList.add('hidden');
});

// Session
async function initApp() {
  const sessionData = await window.api.loadSession?.();
  if (sessionData && sessionData.tabs && sessionData.tabs.length > 0) {
    sessionData.tabs.forEach(t => {
      const id = createTab();
      const tab = tabs.find(x => x.id === id);
      tab.path = t.path;
      tab.title = t.title;
      tab.content = t.content;
      tab.bgSettings = t.bgSettings || { url: '', opacity: 0.2 };
      document.getElementById(`editor_${id}`).innerHTML = t.content;
      updateTabTitle(id);
    });
    setActiveTab(sessionData.activeTabId || tabs[0].id);
  } else {
    createTab();
  }
}
initApp();

window.api.onRequestClose?.(async () => {
  const dirtyTabs = tabs.filter(t => t.isDirty);
  if (dirtyTabs.length > 0) {
    const response = await window.api.showMessageBox({
      type: 'question',
      buttons: ['Close Anyway', 'Cancel'],
      title: 'Notes',
      message: `You have ${dirtyTabs.length} unsaved tabs. Are you sure you want to close? Unsaved changes will be lost (although session might persist them).`,
      cancelId: 1
    });
    if (response.response === 1) return;
  }
  
  if (window.api.saveSession) {
    syncTabsContent();
    await window.api.saveSession({
      tabs: tabs.map(t => ({
        path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings
      })),
      activeTabId: activeTabId
    });
  }
  
  window.api.forceClose();
});

function syncTabsContent() {
  tabs.forEach(t => {
    const el = document.getElementById(`editor_${t.id}`);
    if (el) t.content = el.innerHTML;
  });
}

setInterval(() => {
  if (window.api.saveSession) {
    syncTabsContent();
    window.api.saveSession({
      tabs: tabs.map(t => ({
        path: t.path, title: t.title, content: t.content, bgSettings: t.bgSettings
      })),
      activeTabId: activeTabId
    });
  }
}, 5000);

// Find Panel
const findPanel = document.getElementById('findPanel');
function toggleFind() {
  findPanel.classList.toggle('hidden');
  if (!findPanel.classList.contains('hidden')) {
    document.getElementById('findInput').focus();
  }
}
document.getElementById('menuFind').addEventListener('click', toggleFind);
document.getElementById('findCloseBtn').addEventListener('click', () => findPanel.classList.add('hidden'));
document.getElementById('findNextBtn').addEventListener('click', () => {
  const term = document.getElementById('findInput').value.trim();
  if (!term) return showInfoPopup('Enter text to find.');

  const editorEl = document.getElementById(`editor_${activeTabId}`);
  if (editorEl) editorEl.focus();

  if (!window.find(term, false, false, true, false, true, false)) {
    showInfoPopup(`No matches found for "${term}".`);
  }
});
document.getElementById('findPrevBtn').addEventListener('click', () => {
  const term = document.getElementById('findInput').value.trim();
  if (!term) return showInfoPopup('Enter text to find.');

  const editorEl = document.getElementById(`editor_${activeTabId}`);
  if (editorEl) editorEl.focus();

  if (!window.find(term, false, true, true, false, true, false)) {
    showInfoPopup(`No matches found for "${term}".`);
  }
});
