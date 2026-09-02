/**
 * Typewriter Studio - Application Core
 * Forward-Only Micro-Drafting Engine
 * Pure Local Storage + Direct File Save/Open
 */

// Global State
let state = {
  books: [],           // Array of { id, title, pages: [], createdAt: number }
  activeBookId: null,  // ID of currently open book
  currentPageId: null, // ID of currently open page
  buffer: '',
  settings: {
    maxChars: 200,
    wordsPerPage: 300,
    theme: 'cream',
    font: 'courier',
    volume: 50,
    soundEnabled: true
  }
};

// Web Audio API Context for Typewriter Sound Effects
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
}

function playKeyClickSound() {
  if (!state.settings.soundEnabled || state.settings.volume === 0) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const volume = (state.settings.volume / 100) * 0.4;
    const bufferSize = audioCtx.sampleRate * 0.03;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200 + Math.random() * 400, audioCtx.currentTime);
    filter.Q.setValueAtTime(3, audioCtx.currentTime);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    whiteNoise.start();
  } catch (e) {}
}

function playCarriageReturnBell() {
  if (!state.settings.soundEnabled || state.settings.volume === 0) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const volume = (state.settings.volume / 100) * 0.5;

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {}
}

// DOM Cache
let DOM = {};

function initDOM() {
  DOM = {
    btnBackupCloud: document.getElementById('btn-backup-cloud'),
    btnRestoreCloud: document.getElementById('btn-restore-cloud'),
    fileInputRestore: document.getElementById('file-input-restore'),

    selectBookSlot: document.getElementById('select-book-slot'),
    btnNewBook: document.getElementById('btn-new-book'),
    btnRenameBook: document.getElementById('btn-rename-book'),
    btnDeleteBook: document.getElementById('btn-delete-book'),
    currentBookTitleHeader: document.getElementById('current-book-title-header'),
    currentBookDisplayName: document.getElementById('current-book-display-name'),

    pagesList: document.getElementById('pages-list'),
    lockedInkStream: document.getElementById('locked-ink-stream'),
    draftInput: document.getElementById('draft-input'),
    btnCommit: document.getElementById('btn-commit'),
    charCount: document.getElementById('char-count'),
    charLimit: document.getElementById('char-limit'),
    charCounter: document.getElementById('char-counter'),
    statTotalWords: document.getElementById('stat-total-words'),
    statTotalPages: document.getElementById('stat-total-pages'),
    currentPageLabel: document.getElementById('current-page-label'),
    currentPageStatus: document.getElementById('current-page-status'),
    currentPageWords: document.getElementById('current-page-words'),
    targetPageWords: document.getElementById('target-page-words'),
    btnNewPage: document.getElementById('btn-new-page'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    soundIcon: document.getElementById('sound-icon'),
    btnSettingsToggle: document.getElementById('btn-settings-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
    btnCloseSettings: document.getElementById('btn-close-settings'),
    btnExportDropdown: document.getElementById('btn-export-dropdown'),
    exportMenu: document.getElementById('export-menu'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportMd: document.getElementById('btn-export-md'),
    btnCopyAll: document.getElementById('btn-copy-all'),
    btnClearAll: document.getElementById('btn-clear-all'),

    settingMaxChars: document.getElementById('setting-max-chars'),
    settingWordsPerPage: document.getElementById('setting-words-per-page'),
    settingTheme: document.getElementById('setting-theme'),
    settingFont: document.getElementById('setting-font'),
    settingVolume: document.getElementById('setting-volume'),
    draftingContainer: document.getElementById('drafting-container'),
    toast: document.getElementById('toast')
  };
}

// Storage Engine
function loadStorage() {
  try {
    const savedSettings = localStorage.getItem('typewriter_settings');
    if (savedSettings) state.settings = { ...state.settings, ...JSON.parse(savedSettings) };

    const savedBooks = localStorage.getItem('typewriter_books');
    if (savedBooks) state.books = JSON.parse(savedBooks);
  } catch (e) {}

  if (!state.books || state.books.length === 0) {
    createNewBook("My First Book", false);
  } else {
    state.activeBookId = localStorage.getItem('typewriter_active_book_id') || state.books[0].id;
    const currentBook = getActiveBook();
    if (currentBook && currentBook.pages.length > 0) {
      state.currentPageId = currentBook.pages[currentBook.pages.length - 1].id;
    } else if (currentBook) {
      createNewPage(false);
    }
  }
}

function saveStorage() {
  try {
    localStorage.setItem('typewriter_settings', JSON.stringify(state.settings));
    localStorage.setItem('typewriter_books', JSON.stringify(state.books));
    if (state.activeBookId) {
      localStorage.setItem('typewriter_active_book_id', state.activeBookId);
    }
  } catch (e) {}
}

// Direct File Save & Open (Save directly to PC / Google Drive / iCloud)
function saveFileBackup() {
  const backupData = JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    books: state.books,
    settings: state.settings
  }, null, 2);

  const filename = `typewriter_books_backup_${new Date().toISOString().slice(0,10)}.json`;
  const blob = new Blob([backupData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast("💾 File saved! (Save it in your Google Drive or iCloud folder)");
}

function loadFileBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (importedData && importedData.books && importedData.books.length > 0) {
        state.books = importedData.books;
        if (importedData.settings) {
          state.settings = { ...state.settings, ...importedData.settings };
        }
        state.activeBookId = state.books[0].id;
        state.currentPageId = state.books[0].pages[state.books[0].pages.length - 1].id;
        saveStorage();
        renderAll();
        showToast("📂 All books loaded successfully!");
      } else {
        alert("Invalid file. Please select a valid typewriter backup .json file.");
      }
    } catch (err) {
      alert("Error reading file.");
    }
  };
  reader.readAsText(file);
}

// Book Management
function createNewBook(titlePrompt = null, showNotification = true) {
  const title = titlePrompt || prompt("Enter a name for your new book slot:", `Book ${state.books.length + 1}`);
  if (!title || !title.trim()) return;

  const newBook = {
    id: 'book_' + Date.now(),
    title: title.trim(),
    pages: [],
    createdAt: Date.now()
  };

  const firstPage = {
    id: 'page_' + Date.now(),
    number: 1,
    chunks: [],
    locked: false,
    createdAt: Date.now()
  };
  newBook.pages.push(firstPage);

  state.books.push(newBook);
  state.activeBookId = newBook.id;
  state.currentPageId = firstPage.id;

  saveStorage();
  renderAll();

  if (showNotification) {
    showToast(`Switched to "${newBook.title}"`);
    playCarriageReturnBell();
  }
}

function getActiveBook() {
  if (!state.books || state.books.length === 0) return null;
  return state.books.find(b => b.id === state.activeBookId) || state.books[0];
}

function renameCurrentBook() {
  const book = getActiveBook();
  if (!book) return;
  const newTitle = prompt("Rename this book slot:", book.title);
  if (newTitle && newTitle.trim()) {
    book.title = newTitle.trim();
    saveStorage();
    renderAll();
    showToast(`Renamed to "${book.title}"`);
  }
}

function deleteCurrentBook() {
  if (state.books.length <= 1) {
    alert("You must keep at least one book open!");
    return;
  }

  const book = getActiveBook();
  if (confirm(`Delete "${book.title}"?`)) {
    state.books = state.books.filter(b => b.id !== book.id);
    state.activeBookId = state.books[0].id;
    const newActive = getActiveBook();
    state.currentPageId = newActive.pages[newActive.pages.length - 1].id;
    saveStorage();
    renderAll();
    showToast("Book deleted.");
  }
}

// Page Management
function createNewPage(showNotification = true) {
  const book = getActiveBook();
  if (!book) return;

  const newNum = book.pages.length + 1;
  const newPage = {
    id: 'page_' + Date.now(),
    number: newNum,
    chunks: [],
    locked: false,
    createdAt: Date.now()
  };
  
  const current = getCurrentPage();
  if (current) current.locked = true;

  book.pages.push(newPage);
  state.currentPageId = newPage.id;
  saveStorage();
  renderAll();

  if (showNotification) {
    showToast(`Page ${newNum} created!`);
    playCarriageReturnBell();
  }
}

function getCurrentPage() {
  const book = getActiveBook();
  if (!book || !book.pages || book.pages.length === 0) return null;
  return book.pages.find(p => p.id === state.currentPageId) || book.pages[book.pages.length - 1];
}

function countWords(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function getPageWordCount(page) {
  if (!page || !page.chunks) return 0;
  return page.chunks.reduce((sum, chunk) => sum + countWords(chunk), 0);
}

function getBookTotalWordCount(book) {
  if (!book || !book.pages) return 0;
  return book.pages.reduce((sum, page) => sum + getPageWordCount(page), 0);
}

// Drafting Buffer
function commitCurrentChunk() {
  if (!DOM.draftInput) return;
  const text = DOM.draftInput.value.trim();
  if (!text) return;

  const page = getCurrentPage();
  if (!page || page.locked) {
    createNewPage(false);
  }

  const activePage = getCurrentPage();
  if (activePage) {
    activePage.chunks.push(text);
    DOM.draftInput.value = '';
    state.buffer = '';

    playKeyClickSound();

    const pageWords = getPageWordCount(activePage);
    if (pageWords >= state.settings.wordsPerPage) {
      activePage.locked = true;
      showToast(`Target of ${state.settings.wordsPerPage} words reached! Page locked.`);
      createNewPage(true);
    } else {
      saveStorage();
      renderAll();
    }
  }

  DOM.draftInput.focus();
}

// Event Listeners
function setupEventListeners() {
  if (DOM.btnBackupCloud) DOM.btnBackupCloud.onclick = saveFileBackup;
  if (DOM.btnRestoreCloud) DOM.btnRestoreCloud.onclick = () => DOM.fileInputRestore && DOM.fileInputRestore.click();
  if (DOM.fileInputRestore) DOM.fileInputRestore.onchange = loadFileBackup;

  if (DOM.selectBookSlot) {
    DOM.selectBookSlot.onchange = (e) => {
      state.activeBookId = e.target.value;
      const book = getActiveBook();
      if (book && book.pages.length > 0) {
        state.currentPageId = book.pages[book.pages.length - 1].id;
      }
      saveStorage();
      renderAll();
      showToast(`Opened "${book.title}"`);
    };
  }

  if (DOM.btnNewBook) DOM.btnNewBook.onclick = () => createNewBook();
  if (DOM.btnRenameBook) DOM.btnRenameBook.onclick = () => renameCurrentBook();
  if (DOM.btnDeleteBook) DOM.btnDeleteBook.onclick = () => deleteCurrentBook();

  if (DOM.draftInput) {
    DOM.draftInput.oninput = (e) => {
      state.buffer = e.target.value;
      playKeyClickSound();

      if (state.buffer.length >= state.settings.maxChars) {
        commitCurrentChunk();
      } else {
        updateCharCounter();
      }
    };

    DOM.draftInput.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitCurrentChunk();
      }
    };
  }

  if (DOM.btnCommit) DOM.btnCommit.onclick = () => commitCurrentChunk();
  if (DOM.btnNewPage) DOM.btnNewPage.onclick = () => createNewPage();

  if (DOM.btnSoundToggle) {
    DOM.btnSoundToggle.onclick = () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      if (DOM.soundIcon) DOM.soundIcon.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
      saveStorage();
      showToast(state.settings.soundEnabled ? 'Sound ON' : 'Sound OFF');
    };
  }

  if (DOM.btnSettingsToggle) {
    DOM.btnSettingsToggle.onclick = () => {
      if (DOM.settingsPanel) DOM.settingsPanel.classList.toggle('hidden');
      if (DOM.exportMenu) DOM.exportMenu.classList.add('hidden');
    };
  }

  if (DOM.btnCloseSettings) {
    DOM.btnCloseSettings.onclick = () => {
      if (DOM.settingsPanel) DOM.settingsPanel.classList.add('hidden');
    };
  }

  if (DOM.btnExportDropdown) {
    DOM.btnExportDropdown.onclick = () => {
      if (DOM.exportMenu) DOM.exportMenu.classList.toggle('hidden');
      if (DOM.settingsPanel) DOM.settingsPanel.classList.add('hidden');
    };
  }

  if (DOM.btnExportTxt) DOM.btnExportTxt.onclick = () => exportManuscript('txt');
  if (DOM.btnExportMd) DOM.btnExportMd.onclick = () => exportManuscript('md');
  if (DOM.btnCopyAll) DOM.btnCopyAll.onclick = copyManuscriptToClipboard;

  if (DOM.settingMaxChars) {
    DOM.settingMaxChars.onchange = (e) => {
      state.settings.maxChars = parseInt(e.target.value, 10) || 200;
      saveStorage();
      renderAll();
    };
  }

  if (DOM.settingWordsPerPage) {
    DOM.settingWordsPerPage.onchange = (e) => {
      state.settings.wordsPerPage = parseInt(e.target.value, 10) || 300;
      saveStorage();
      renderAll();
    };
  }

  if (DOM.settingTheme) {
    DOM.settingTheme.onchange = (e) => {
      state.settings.theme = e.target.value;
      applyTheme();
      saveStorage();
    };
  }

  if (DOM.settingFont) {
    DOM.settingFont.onchange = (e) => {
      state.settings.font = e.target.value;
      applyFont();
      saveStorage();
    };
  }

  if (DOM.settingVolume) {
    DOM.settingVolume.oninput = (e) => {
      state.settings.volume = parseInt(e.target.value, 10);
      saveStorage();
    };
  }

  if (DOM.btnClearAll) {
    DOM.btnClearAll.onclick = () => {
      if (confirm("Reset everything?")) {
        state.books = [];
        localStorage.clear();
        createNewBook("My First Book", false);
        if (DOM.settingsPanel) DOM.settingsPanel.classList.add('hidden');
        showToast("Reset complete.");
      }
    };
  }

  document.addEventListener('click', (e) => {
    if (DOM.exportMenu && DOM.btnExportDropdown && !DOM.exportMenu.contains(e.target) && !DOM.btnExportDropdown.contains(e.target)) {
      DOM.exportMenu.classList.add('hidden');
    }
  });
}

// Render Functions
function renderAll() {
  applyTheme();
  applyFont();
  renderBookSlotsDropdown();
  renderSidebarPages();
  renderActivePage();
  updateStats();
  updateCharCounter();
}

function renderBookSlotsDropdown() {
  if (!DOM.selectBookSlot) return;
  DOM.selectBookSlot.innerHTML = '';
  state.books.forEach(book => {
    const opt = document.createElement('option');
    opt.value = book.id;
    opt.textContent = `${book.title} (${getBookTotalWordCount(book)}w)`;
    if (book.id === state.activeBookId) opt.selected = true;
    DOM.selectBookSlot.appendChild(opt);
  });

  const activeBook = getActiveBook();
  if (activeBook) {
    if (DOM.currentBookTitleHeader) DOM.currentBookTitleHeader.textContent = activeBook.title;
    if (DOM.currentBookDisplayName) DOM.currentBookDisplayName.textContent = activeBook.title;
  }
}

function updateCharCounter() {
  if (!DOM.draftInput || !DOM.charCount || !DOM.charLimit) return;
  const currentLen = DOM.draftInput.value.length;
  const maxLen = state.settings.maxChars;

  DOM.charCount.textContent = currentLen;
  DOM.charLimit.textContent = maxLen;

  if (DOM.charCounter) {
    DOM.charCounter.classList.remove('near-limit', 'at-limit');
    if (currentLen >= maxLen) DOM.charCounter.classList.add('at-limit');
    else if (currentLen >= maxLen * 0.85) DOM.charCounter.classList.add('near-limit');
  }
}

function renderSidebarPages() {
  if (!DOM.pagesList) return;
  DOM.pagesList.innerHTML = '';
  const book = getActiveBook();
  if (!book) return;

  book.pages.forEach(page => {
    const li = document.createElement('li');
    li.className = page.id === state.currentPageId ? 'active' : '';
    const words = getPageWordCount(page);
    li.innerHTML = `
      <span>Page ${page.number} ${page.locked ? '🔒' : '✍️'}</span>
      <span class="page-word-badge">${words}w</span>
    `;

    li.onclick = () => {
      state.currentPageId = page.id;
      renderAll();
    };

    DOM.pagesList.appendChild(li);
  });
}

function renderActivePage() {
  const page = getCurrentPage();
  if (!page) return;

  if (DOM.currentPageLabel) DOM.currentPageLabel.textContent = `Page ${page.number}`;
  
  if (page.locked) {
    if (DOM.currentPageStatus) {
      DOM.currentPageStatus.textContent = "Locked";
      DOM.currentPageStatus.className = "status-badge status-locked";
    }
    if (DOM.draftingContainer) DOM.draftingContainer.classList.add('hidden');
  } else {
    if (DOM.currentPageStatus) {
      DOM.currentPageStatus.textContent = "Active";
      DOM.currentPageStatus.className = "status-badge status-active";
    }
    if (DOM.draftingContainer) DOM.draftingContainer.classList.remove('hidden');
  }

  const pageWords = getPageWordCount(page);
  if (DOM.currentPageWords) DOM.currentPageWords.textContent = pageWords;
  if (DOM.targetPageWords) DOM.targetPageWords.textContent = state.settings.wordsPerPage;

  if (DOM.lockedInkStream) {
    DOM.lockedInkStream.innerHTML = '';
    page.chunks.forEach(chunkText => {
      const chunkSpan = document.createElement('span');
      chunkSpan.className = 'ink-chunk';
      chunkSpan.textContent = chunkText;
      DOM.lockedInkStream.appendChild(chunkSpan);
    });
  }
}

function updateStats() {
  const book = getActiveBook();
  if (DOM.statTotalWords) DOM.statTotalWords.textContent = getBookTotalWordCount(book);
  if (DOM.statTotalPages) DOM.statTotalPages.textContent = book ? book.pages.length : 0;
}

function applyTheme() {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${state.settings.theme}`);
  if (DOM.settingTheme) DOM.settingTheme.value = state.settings.theme;
}

function applyFont() {
  document.body.className = document.body.className.replace(/\bfont-\S+/g, '');
  document.body.classList.add(`font-${state.settings.font}`);
  if (DOM.settingFont) DOM.settingFont.value = state.settings.font;
}

function applySettingsUI() {
  if (DOM.settingMaxChars) DOM.settingMaxChars.value = state.settings.maxChars;
  if (DOM.settingWordsPerPage) DOM.settingWordsPerPage.value = state.settings.wordsPerPage;
  if (DOM.settingVolume) DOM.settingVolume.value = state.settings.volume;
  if (DOM.soundIcon) DOM.soundIcon.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
}

function showToast(msg) {
  if (!DOM.toast) return;
  DOM.toast.textContent = msg;
  DOM.toast.classList.remove('hidden');
  setTimeout(() => {
    DOM.toast.classList.add('hidden');
  }, 2500);
}

function compileManuscriptText(format = 'txt') {
  const book = getActiveBook();
  if (!book) return '';
  let fullText = `# ${book.title}\n\n`;
  book.pages.forEach(page => {
    if (format === 'md') fullText += `## Page ${page.number}\n\n`;
    else fullText += `--- PAGE ${page.number} ---\n\n`;
    fullText += page.chunks.join(' ') + '\n\n';
  });
  return fullText.trim();
}

function exportManuscript(format) {
  const book = getActiveBook();
  const content = compileManuscriptText(format);
  const ext = format === 'md' ? 'md' : 'txt';
  const cleanTitle = (book ? book.title : 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0,10)}.${ext}`;
  
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (DOM.exportMenu) DOM.exportMenu.classList.add('hidden');
  showToast(`Exported ${filename}`);
}

function copyManuscriptToClipboard() {
  const content = compileManuscriptText('txt');
  navigator.clipboard.writeText(content).then(() => {
    if (DOM.exportMenu) DOM.exportMenu.classList.add('hidden');
    showToast("Manuscript copied to clipboard!");
  }).catch(() => {
    showToast("Failed to copy to clipboard.");
  });
}

function init() {
  initDOM();
  loadStorage();
  setupEventListeners();
  applySettingsUI();
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
