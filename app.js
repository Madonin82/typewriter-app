/**
 * Typewriter Studio - Application Core
 * Forward-Only Micro-Drafting Engine with Firebase Auth & Firestore Sync
 * Firebase Project: typewriter-app-6e624
 */

// Firebase Configuration for Project: typewriter-app-6e624
const firebaseConfig = {
  apiKey: "AIzaSyB5UvSiArIv_YnmbWyjSG0so6MJc5S1A9E",
  authDomain: "typewriter-app-6e624.firebaseapp.com",
  projectId: "typewriter-app-6e624",
  storageBucket: "typewriter-app-6e624.firebasestorage.app",
  messagingSenderId: "1010879061490",
  appId: "1:1010879061490:web:83c43a410788f62d401f6b"
};

let auth = null;
let db = null;
let currentUser = null;
let googleAccessToken = sessionStorage.getItem('google_drive_access_token') || null;

// Global State
let state = {
  books: [],           // Array of { id, title, pages: [{ id, number, chunks: [], locked: boolean, createdAt }], createdAt }
  activeBookId: null,  // ID of currently open book
  currentPageId: null, // ID of currently open page
  buffer: '',
  settings: {
    maxChars: 200,
    wordsPerPage: 300,
    theme: 'cream',
    font: 'courier',
    commitKey: 'ctrl-enter', // 'ctrl-enter' | 'enter'
    volume: 50,
    soundEnabled: true
  }
};

let overlayOpen = false;
let hintTimer = null;
let deferredInstallPrompt = null;
let isAppInstalled = false;

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
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const volume = (state.settings.volume / 100) * 0.35;
    const bufferSize = audioCtx.sampleRate * 0.025;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + Math.random() * 300, audioCtx.currentTime);
    filter.Q.setValueAtTime(3.5, audioCtx.currentTime);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0008, audioCtx.currentTime + 0.025);

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
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const volume = (state.settings.volume / 100) * 0.45;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.55);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.55);
  } catch (e) {}
}

// DOM Cache
let DOM = {};

function initDOM() {
  DOM = {
    writingSurface: document.getElementById('writing-surface'),
    pageSheet: document.getElementById('page-sheet'),
    pageHeaderInfo: document.getElementById('page-header-info'),
    inkStream: document.getElementById('ink-stream'),
    draftInput: document.getElementById('draft-input'),
    charCounter: document.getElementById('char-counter'),
    commitHint: document.getElementById('commit-hint'),
    btnCommit: document.getElementById('btn-commit'),

    escOverlay: document.getElementById('esc-overlay'),
    escHint: document.getElementById('esc-hint'),
    btnResume: document.getElementById('btn-resume'),

    selectBookSlot: document.getElementById('select-book-slot'),
    btnNewBook: document.getElementById('btn-new-book'),
    btnRenameBook: document.getElementById('btn-rename-book'),
    btnDeleteBook: document.getElementById('btn-delete-book'),

    pagesList: document.getElementById('pages-list'),
    btnNewPage: document.getElementById('btn-new-page'),
    btnBackupCloud: document.getElementById('btn-backup-cloud'),
    btnRestoreCloud: document.getElementById('btn-restore-cloud'),
    fileInputRestore: document.getElementById('file-input-restore'),
    btnSafetyArchive: document.getElementById('btn-safety-archive'),
    safetyArchiveBadge: document.getElementById('safety-archive-badge'),
    safetyArchiveModal: document.getElementById('safety-archive-modal'),
    btnCloseArchiveModal: document.getElementById('btn-close-archive-modal'),
    btnClearSafetyArchive: document.getElementById('btn-clear-safety-archive'),
    archiveStatusSummary: document.getElementById('archive-status-summary'),
    archiveEmptyMessage: document.getElementById('archive-empty-message'),
    archiveFilesList: document.getElementById('archive-files-list'),

    btnGoogleSignIn: document.getElementById('btn-google-signin'),
    userProfile: document.getElementById('user-profile'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    syncStatus: document.getElementById('sync-status'),
    btnLogout: document.getElementById('btn-logout'),
    btnClearAll: document.getElementById('btn-clear-all'),

    settingMaxChars: document.getElementById('setting-max-chars'),
    settingWordsPerPage: document.getElementById('setting-words-per-page'),
    settingTheme: document.getElementById('setting-theme'),
    settingFont: document.getElementById('setting-font'),
    settingCommitKey: document.getElementById('setting-commit-key'),
    settingVolume: document.getElementById('setting-volume'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),

    statTotalWords: document.getElementById('stat-total-words'),
    statTotalPages: document.getElementById('stat-total-pages'),
    statTotalBooks: document.getElementById('stat-total-books'),

    exportModal: document.getElementById('export-modal'),
    btnExportModalToggle: document.getElementById('btn-export-modal-toggle'),
    btnCloseExportModal: document.getElementById('btn-close-export-modal'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportMd: document.getElementById('btn-export-md'),
    btnCopyAll: document.getElementById('btn-copy-all'),
    btnExportDriveDoc: document.getElementById('btn-export-drive-doc'),
    btnExportDriveTxt: document.getElementById('btn-export-drive-txt'),

    btnDriveBackup: document.getElementById('btn-drive-backup'),
    btnDriveManager: document.getElementById('btn-drive-manager'),

    btnInstallPwa: document.getElementById('btn-install-pwa'),
    btnPwaInstallLeft: document.getElementById('btn-pwa-install-left'),
    iosInstallModal: document.getElementById('ios-install-modal'),
    btnCloseIosModal: document.getElementById('btn-close-ios-modal'),
    btnCloseIosModalBtn: document.getElementById('btn-close-ios-modal-btn'),
    offlineBadge: document.getElementById('offline-badge'),

    driveModal: document.getElementById('drive-modal'),
    btnCloseDriveModal: document.getElementById('btn-close-drive-modal'),
    btnRefreshDrive: document.getElementById('btn-refresh-drive'),
    btnQuickBackupDrive: document.getElementById('btn-quick-backup-drive'),
    btnQuickExportDrive: document.getElementById('btn-quick-export-drive'),
    driveLoadingIndicator: document.getElementById('drive-loading-indicator'),
    driveFilesList: document.getElementById('drive-files-list'),
    driveEmptyMessage: document.getElementById('drive-empty-message'),

    toast: document.getElementById('toast')
  };
}

// ─── PWA & OFFLINE CONTROLS ──────────────────────────────────

function checkPwaInstallState() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true;
  isAppInstalled = isStandalone;

  if (isAppInstalled) {
    if (DOM.btnInstallPwa) DOM.btnInstallPwa.classList.add('hidden');
    if (DOM.btnPwaInstallLeft) DOM.btnPwaInstallLeft.classList.add('hidden');
  }
}

async function handleInstallPrompt() {
  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  if (isAppInstalled) {
    showToast("Typewriter is already running as an installed standalone app!");
    return;
  }

  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast("Typewriter installation started!");
        deferredInstallPrompt = null;
        isAppInstalled = true;
        checkPwaInstallState();
      } else {
        showToast("Installation postponed.");
      }
    } catch (err) {
      console.error("PWA install error:", err);
    }
  } else if (isIOS) {
    if (DOM.iosInstallModal) DOM.iosInstallModal.classList.remove('hidden');
  } else {
    showToast("To install on Windows or Mac, click the Install App icon (⊞ or 📥) in your browser's address bar.");
  }
}

function updateNetworkStatus(online) {
  if (DOM.offlineBadge) {
    if (!online) {
      DOM.offlineBadge.classList.add('visible');
    } else {
      DOM.offlineBadge.classList.remove('visible');
    }
  }
}

// ─── OVERLAY SYSTEM (ESC) ───────────────────────────────────

function openOverlay() {
  overlayOpen = true;
  if (DOM.escOverlay) DOM.escOverlay.classList.add('open');
  if (DOM.writingSurface) DOM.writingSurface.classList.add('blurred');
  if (DOM.escHint) DOM.escHint.classList.remove('fade');
}

function closeOverlay() {
  overlayOpen = false;
  if (DOM.escOverlay) DOM.escOverlay.classList.remove('open');
  if (DOM.writingSurface) DOM.writingSurface.classList.remove('blurred');
  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  if (DOM.driveModal) DOM.driveModal.classList.add('hidden');
  if (DOM.safetyArchiveModal) DOM.safetyArchiveModal.classList.add('hidden');

  setTimeout(() => {
    if (DOM.draftInput) DOM.draftInput.focus();
  }, 100);

  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    if (DOM.escHint) DOM.escHint.classList.add('fade');
  }, 2000);
}

function updateCommitHint() {
  if (!DOM.commitHint) return;
  const isCtrl = state.settings.commitKey === 'ctrl-enter';
  DOM.commitHint.innerHTML = isCtrl
    ? 'Commit with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>'
    : 'Commit with <kbd>Enter</kbd>';
}

// ─── FIREBASE AUTH & FIRESTORE SYNC ─────────────────────────

function initFirebase() {
  if (typeof firebase !== 'undefined' && firebase.initializeApp) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      auth = firebase.auth();
      db = firebase.firestore();

      auth.onAuthStateChanged((user) => {
        if (user) {
          currentUser = user;
          renderUserUI();
          loadFromFirestore(user.uid);
        } else {
          currentUser = null;
          renderUserUI();
        }
      });
    } catch (e) {
      console.warn("Firebase Init:", e);
    }
  }
}

function handleGoogleSignIn() {
  if (!auth) initFirebase();
  if (auth) {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'consent' });
    auth.signInWithPopup(provider).then((result) => {
      if (result.credential && result.credential.accessToken) {
        googleAccessToken = result.credential.accessToken;
        sessionStorage.setItem('google_drive_access_token', googleAccessToken);
      }
      showToast(`Welcome, ${result.user.displayName || 'Author'}! Synced with Firestore & Google Drive.`);
      renderUserUI();
    }).catch((error) => {
      console.error("Auth error:", error);
      showToast(`Sign in error: ${error.message}`);
    });
  } else {
    showToast("Firebase Auth initializing...");
  }
}

function handleSignOut() {
  googleAccessToken = null;
  sessionStorage.removeItem('google_drive_access_token');
  if (auth) {
    auth.signOut().then(() => {
      showToast("Signed out.");
      renderUserUI();
    });
  }
}

async function getGoogleDriveToken() {
  if (googleAccessToken) return googleAccessToken;

  if (!auth) initFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ prompt: 'consent' });

  try {
    const result = await auth.signInWithPopup(provider);
    if (result.credential && result.credential.accessToken) {
      googleAccessToken = result.credential.accessToken;
      sessionStorage.setItem('google_drive_access_token', googleAccessToken);
      renderUserUI();
      return googleAccessToken;
    }
    throw new Error("Google Drive access token was not provided by Google. Please check your project's OAuth configuration.");
  } catch (err) {
    console.error("Google Drive Auth error:", err);
    showToast(`Google Drive Auth: ${err.message || 'Authorization failed'}`);
    throw err;
  }
}

function renderUserUI() {
  if (currentUser) {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.add('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.remove('hidden');
    if (DOM.userName) DOM.userName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    if (DOM.userAvatar && currentUser.photoURL) DOM.userAvatar.src = currentUser.photoURL;
    if (DOM.syncStatus) {
      DOM.syncStatus.textContent = googleAccessToken ? "☁️ Firestore + Drive Active" : "☁️ Firestore Synced";
    }
  } else {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.remove('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.add('hidden');
  }
}

function syncToFirestore() {
  if (!db || !currentUser) return;
  if (DOM.syncStatus) DOM.syncStatus.textContent = "🔄 Syncing...";

  db.collection("users").doc(currentUser.uid).set({
    books: state.books,
    settings: state.settings,
    lastSynced: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).then(() => {
    if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Firestore Synced";
  }).catch((e) => {
    console.warn("Firestore sync error:", e);
    if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Local (Sync paused)";
  });
}

function loadFromFirestore(uid) {
  if (!db) return;
  db.collection("users").doc(uid).get().then((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.books && data.books.length > 0) {
        state.books = data.books;
        if (data.settings) state.settings = { ...state.settings, ...data.settings };
        state.activeBookId = state.books[0].id;
        state.currentPageId = state.books[0].pages[state.books[0].pages.length - 1].id;
        saveStorage(false);
        renderAll();
        showToast("Loaded your manuscripts from Firestore!");
      }
    } else {
      syncToFirestore();
    }
  }).catch((e) => {
    console.warn("Firestore load error:", e);
  });
}

// ─── LOCAL STORAGE ENGINE ───────────────────────────────────

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

function saveStorage(syncCloud = true) {
  try {
    localStorage.setItem('typewriter_settings', JSON.stringify(state.settings));
    localStorage.setItem('typewriter_books', JSON.stringify(state.books));
    if (state.activeBookId) {
      localStorage.setItem('typewriter_active_book_id', state.activeBookId);
    }
  } catch (e) {}

  if (syncCloud && currentUser) {
    syncToFirestore();
  }
}

// ─── BACKUP & RESTORE / SAFETY ARCHIVE ──────────────────────

function triggerFileDownload(filename, textContent, mimeType = 'application/json') {
  try {
    const blob = new Blob([textContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error("File download error:", e);
  }
}

function calculateBookStats(book) {
  let words = 0;
  if (book && book.pages) {
    book.pages.forEach(p => {
      if (p.chunks) {
        p.chunks.forEach(c => {
          words += (c.text.trim().match(/\S+/g) || []).length;
        });
      }
    });
  }
  return { words, pages: (book && book.pages) ? book.pages.length : 0 };
}

function getSafetyArchive() {
  try {
    const raw = localStorage.getItem('typewriter_safety_archive');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSafetyArchive(archive) {
  try {
    localStorage.setItem('typewriter_safety_archive', JSON.stringify(archive));
    updateSafetyArchiveBadge();
  } catch (e) {
    console.warn("Save safety archive failed:", e);
  }
}

function updateSafetyArchiveBadge() {
  const archive = getSafetyArchive();
  if (DOM.safetyArchiveBadge) {
    DOM.safetyArchiveBadge.textContent = archive.length;
  }
}

function createSafetyBackupForBook(book, reason = 'Deleted Book') {
  if (!book) return;

  const stats = calculateBookStats(book);
  const now = new Date();
  const dateIso = now.toISOString();
  const dateFormatted = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const cleanTitle = (book.title || 'Untitled').replace(/[^a-z0-9]/gi, '_');
  const fileDate = dateIso.slice(0, 10);
  const filename = `Typewriter_Backup_DELETED_${cleanTitle}_${fileDate}.json`;

  const backupPayload = {
    version: 1,
    type: 'safety_backup_single_book',
    reason: reason,
    backupDate: dateIso,
    bookTitle: book.title,
    stats: stats,
    books: [JSON.parse(JSON.stringify(book))],
    settings: { ...state.settings }
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);

  // 1. Automatically download local backup file
  triggerFileDownload(filename, jsonStr, 'application/json');

  // 2. Add to localStorage safety archive
  const archive = getSafetyArchive();
  const archiveItem = {
    id: 'safety_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    type: 'single_book',
    reason: reason,
    date: dateFormatted,
    isoDate: dateIso,
    title: book.title,
    stats: stats,
    filename: filename,
    data: backupPayload
  };
  archive.unshift(archiveItem);
  if (archive.length > 30) archive.pop();
  saveSafetyArchive(archive);

  // 3. Upload to Google Drive if authorized
  if (googleAccessToken) {
    uploadToGoogleDrive({
      name: filename,
      content: jsonStr,
      mimeType: 'application/json',
      isDoc: false
    }).then(res => {
      console.log("Safety backup saved to Google Drive:", res.name);
    }).catch(err => {
      console.warn("Drive safety backup error:", err);
    });
  }

  // 4. Firestore safety backup if authorized
  if (db && currentUser) {
    db.collection("users").doc(currentUser.uid).collection("safety_backups").add({
      type: 'single_book',
      reason: reason,
      title: book.title,
      stats: stats,
      book: book,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.warn("Firestore safety backup error:", e));
  }
}

function createSafetyBackupForReset(books, settings, reason = 'Full Studio Reset') {
  if (!books || books.length === 0) return;

  let totalWords = 0;
  let totalPages = 0;
  books.forEach(b => {
    const s = calculateBookStats(b);
    totalWords += s.words;
    totalPages += s.pages;
  });

  const now = new Date();
  const dateIso = now.toISOString();
  const dateFormatted = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fileDate = dateIso.slice(0, 10);
  const filename = `Typewriter_Backup_FULL_RESET_${books.length}_BOOKS_${fileDate}.json`;

  const backupPayload = {
    version: 1,
    type: 'safety_backup_full_reset',
    reason: reason,
    backupDate: dateIso,
    totalBooks: books.length,
    stats: { words: totalWords, pages: totalPages, books: books.length },
    books: JSON.parse(JSON.stringify(books)),
    settings: { ...settings }
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);

  // 1. Automatically download complete safety backup file
  triggerFileDownload(filename, jsonStr, 'application/json');

  // 2. Add to localStorage safety archive
  const archive = getSafetyArchive();
  const archiveItem = {
    id: 'safety_reset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    type: 'full_reset',
    reason: reason,
    date: dateFormatted,
    isoDate: dateIso,
    title: `All Manuscripts (${books.length} Books)`,
    stats: { words: totalWords, pages: totalPages, books: books.length },
    filename: filename,
    data: backupPayload
  };
  archive.unshift(archiveItem);
  if (archive.length > 30) archive.pop();
  saveSafetyArchive(archive);

  // 3. Upload to Google Drive if authorized
  if (googleAccessToken) {
    uploadToGoogleDrive({
      name: filename,
      content: jsonStr,
      mimeType: 'application/json',
      isDoc: false
    }).catch(err => console.warn("Drive reset safety backup error:", err));
  }

  // 4. Firestore safety backup if authorized
  if (db && currentUser) {
    db.collection("users").doc(currentUser.uid).collection("safety_backups").add({
      type: 'full_reset',
      reason: reason,
      totalBooks: books.length,
      stats: { words: totalWords, pages: totalPages },
      books: books,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.warn("Firestore reset safety backup error:", e));
  }
}

function openSafetyArchiveModal() {
  if (DOM.safetyArchiveModal) {
    DOM.safetyArchiveModal.classList.remove('hidden');
    renderSafetyArchiveList();
  }
}

function closeSafetyArchiveModal() {
  if (DOM.safetyArchiveModal) {
    DOM.safetyArchiveModal.classList.add('hidden');
  }
}

function renderSafetyArchiveList() {
  const archive = getSafetyArchive();
  updateSafetyArchiveBadge();

  if (DOM.archiveStatusSummary) {
    DOM.archiveStatusSummary.textContent = `${archive.length} safety backup${archive.length === 1 ? '' : 's'} stored locally`;
  }

  if (!DOM.archiveFilesList || !DOM.archiveEmptyMessage) return;

  if (archive.length === 0) {
    DOM.archiveEmptyMessage.classList.remove('hidden');
    DOM.archiveFilesList.classList.add('hidden');
    DOM.archiveFilesList.innerHTML = '';
    return;
  }

  DOM.archiveEmptyMessage.classList.add('hidden');
  DOM.archiveFilesList.classList.remove('hidden');
  DOM.archiveFilesList.innerHTML = '';

  archive.forEach(item => {
    const li = document.createElement('li');
    li.className = 'drive-file-item';

    const isReset = item.type === 'full_reset';
    const iconEmoji = isReset ? '📚' : '📖';
    const wordsCount = item.stats?.words ?? 0;
    const pagesCount = item.stats?.pages ?? 0;
    const subtext = `${item.date} • ${item.reason} • ${wordsCount} words • ${pagesCount} pages`;

    li.innerHTML = `
      <div class="drive-file-main">
        <span class="drive-file-icon">${iconEmoji}</span>
        <div class="drive-file-details">
          <span class="drive-file-name" title="${item.title}">${item.title}</span>
          <span class="drive-file-subtext">${subtext}</span>
        </div>
      </div>
      <div class="drive-file-actions">
        <button class="drive-pill-btn btn-restore-archive" data-id="${item.id}" title="Restore into Studio" style="background:#1b3d22; border-color:#2a7238; color:#7ee896;">
          📥 Restore
        </button>
        <button class="drive-pill-btn btn-download-archive" data-id="${item.id}" title="Download JSON Backup">
          💾 Download
        </button>
        <button class="drive-pill-btn btn-delete-archive" data-id="${item.id}" title="Delete this safety copy permanently" style="color:#ff6b6b; border-color:rgba(255,107,107,0.3);">
          🗑️
        </button>
      </div>
    `;

    li.querySelector('.btn-restore-archive').onclick = () => restoreSafetyArchiveItem(item.id);
    li.querySelector('.btn-download-archive').onclick = () => downloadSafetyArchiveItem(item.id);
    li.querySelector('.btn-delete-archive').onclick = () => deleteSafetyArchiveItem(item.id);

    DOM.archiveFilesList.appendChild(li);
  });
}

function restoreSafetyArchiveItem(id) {
  const archive = getSafetyArchive();
  const item = archive.find(x => x.id === id);
  if (!item || !item.data) {
    showToast("Unable to restore: backup data not found.");
    return;
  }

  if (item.type === 'single_book' && item.data.books && item.data.books.length > 0) {
    const bookToRestore = JSON.parse(JSON.stringify(item.data.books[0]));
    // Check if book with this ID already exists, generate fresh ID if so
    const existingIndex = state.books.findIndex(b => b.id === bookToRestore.id);
    if (existingIndex !== -1) {
      bookToRestore.id = 'book_' + Date.now();
      bookToRestore.title = bookToRestore.title + ' (Restored)';
    }

    state.books.push(bookToRestore);
    state.activeBookId = bookToRestore.id;
    const lastPage = bookToRestore.pages && bookToRestore.pages.length > 0
      ? bookToRestore.pages[bookToRestore.pages.length - 1]
      : null;
    state.currentPageId = lastPage ? lastPage.id : null;

    saveStorage();
    renderAll();
    closeSafetyArchiveModal();
    closeOverlay();
    showToast(`Restored "${bookToRestore.title}" to active books!`);
    playCarriageReturnBell();
  } else if (item.type === 'full_reset' && item.data.books && item.data.books.length > 0) {
    if (confirm(`Restore all ${item.data.books.length} books from this snapshot? (This will add them to your studio)`)) {
      item.data.books.forEach(b => {
        const copy = JSON.parse(JSON.stringify(b));
        copy.id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        state.books.push(copy);
      });
      state.activeBookId = state.books[state.books.length - 1].id;
      const lastBook = state.books[state.books.length - 1];
      const lastPage = (lastBook && lastBook.pages && lastBook.pages.length > 0) ? lastBook.pages[lastBook.pages.length - 1] : null;
      state.currentPageId = lastPage ? lastPage.id : null;

      saveStorage();
      renderAll();
      closeSafetyArchiveModal();
      closeOverlay();
      showToast(`Restored ${item.data.books.length} manuscripts from snapshot!`);
      playCarriageReturnBell();
    }
  }
}

function downloadSafetyArchiveItem(id) {
  const archive = getSafetyArchive();
  const item = archive.find(x => x.id === id);
  if (!item || !item.data) return;

  const jsonStr = JSON.stringify(item.data, null, 2);
  triggerFileDownload(item.filename || `Typewriter_Backup_${id}.json`, jsonStr, 'application/json');
  showToast(`Downloaded safety backup: ${item.title}`);
}

function deleteSafetyArchiveItem(id) {
  let archive = getSafetyArchive();
  const item = archive.find(x => x.id === id);
  if (!item) return;

  if (confirm(`Permanently delete this local safety backup for "${item.title}"?`)) {
    archive = archive.filter(x => x.id !== id);
    saveSafetyArchive(archive);
    renderSafetyArchiveList();
    showToast("Safety backup copy deleted.");
  }
}

function clearSafetyArchive() {
  const archive = getSafetyArchive();
  if (archive.length === 0) {
    showToast("Safety archive is already empty.");
    return;
  }

  if (confirm(`Permanently remove all ${archive.length} automatic safety backups from your local storage?`)) {
    saveSafetyArchive([]);
    renderSafetyArchiveList();
    showToast("Safety archive cleared.");
  }
}

function exportBackupFile() {
  const backupData = JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    books: state.books,
    settings: state.settings
  }, null, 2);

  const filename = `typewriter_backup_${new Date().toISOString().slice(0, 10)}.json`;
  triggerFileDownload(filename, backupData, 'application/json');
  showToast("Saved backup file!");
}

function importBackupFile(event) {
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
        showToast("Backup restored successfully!");
        closeOverlay();
      } else {
        alert("Invalid backup file format.");
      }
    } catch (err) {
      alert("Error reading backup file.");
    }
  };
  reader.readAsText(file);
}

// ─── BOOK & PAGE MANAGEMENT ─────────────────────────────────

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
    showToast(`Created & opened "${newBook.title}"`);
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
  if (!book) return;

  if (confirm(`Delete "${book.title}"?\n\n(A safety backup will automatically be saved and downloaded to your files in case this was an accident.)`)) {
    // Automatically create safety backup
    createSafetyBackupForBook(book, 'Deleted Book');

    state.books = state.books.filter(b => b.id !== book.id);
    state.activeBookId = state.books[0].id;
    const newActive = getActiveBook();
    state.currentPageId = newActive.pages[newActive.pages.length - 1].id;
    saveStorage();
    renderAll();
    showToast(`Deleted "${book.title}". Safety backup auto-saved & downloaded.`);
  }
}

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
    showToast(`Page ${newNum} inserted!`);
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

// ─── DRAFTING BUFFER & FORWARD-ONLY INK STREAM ──────────────

function commitDraft() {
  if (!DOM.draftInput) return;
  const rawText = DOM.draftInput.value;
  if (!rawText) return;
  if (rawText.trim().length === 0 && !rawText.includes('\t')) return;

  const text = rawText.replace(/\s+$/, '');
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
      showToast(`Target of ${state.settings.wordsPerPage} words reached! Page turned.`);
      createNewPage(true);
    } else {
      saveStorage();
      renderAll(true);
    }
  }

  if (DOM.writingSurface) {
    requestAnimationFrame(() => {
      DOM.writingSurface.scrollTo({
        top: DOM.writingSurface.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  DOM.draftInput.focus();
}

function updateCharCounter() {
  if (!DOM.draftInput || !DOM.charCounter) return;
  const len = DOM.draftInput.value.length;
  const max = state.settings.maxChars;

  DOM.charCounter.textContent = `${len} / ${max}`;
  DOM.charCounter.className = 'char-counter';

  if (len >= max) {
    DOM.charCounter.classList.add('full');
  } else if (len >= max * 0.85) {
    DOM.charCounter.classList.add('near');
  }
}

// ─── RENDERING & UI SYNC ────────────────────────────────────

function renderAll(lastChunkIsNew = false) {
  applyTheme();
  applyFont();
  updateCommitHint();
  renderBookSlotsDropdown();
  renderSidebarPages();
  renderActivePage(lastChunkIsNew);
  updateStats();
  updateCharCounter();
  renderUserUI();
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
      <span>${page.locked ? '🔒' : '✍️'} Page ${page.number}</span>
      <span class="page-badge">${words}w</span>
    `;

    li.onclick = () => {
      state.currentPageId = page.id;
      renderAll(false);
      closeOverlay();
    };

    DOM.pagesList.appendChild(li);
  });
}

function renderActivePage(lastChunkIsNew = false) {
  const book = getActiveBook();
  const page = getCurrentPage();
  if (!page || !book) return;

  const totalPages = book.pages.length;
  if (DOM.pageHeaderInfo) {
    DOM.pageHeaderInfo.textContent = `Page ${page.number}/${totalPages} • ${book.title}${page.locked ? ' (Locked)' : ''}`;
  }

  if (DOM.pageSheet) {
    DOM.pageSheet.classList.toggle('is-locked', Boolean(page.locked));
  }

  if (DOM.inkStream) {
    DOM.inkStream.innerHTML = '';

    const count = page.chunks.length;
    page.chunks.forEach((chunkText, idx) => {
      const span = document.createElement('span');
      span.className = 'ink-chunk';
      if (lastChunkIsNew && idx === count - 1) {
        span.classList.add('new-strike');
      }
      span.textContent = chunkText;
      DOM.inkStream.appendChild(span);
    });

    if (!page.locked) {
      const cursor = document.createElement('span');
      cursor.className = 'ink-cursor';
      cursor.id = 'ink-cursor';
      DOM.inkStream.appendChild(cursor);
    }
  }

  if (DOM.writingSurface) {
    requestAnimationFrame(() => {
      if (page.locked) {
        DOM.writingSurface.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'smooth' });
      }
    });
  }

  const draftOverlay = document.getElementById('draft-overlay');
  if (draftOverlay) {
    if (page.locked) {
      draftOverlay.classList.add('hidden');
    } else {
      draftOverlay.classList.remove('hidden');
    }
  }
}

function updateStats() {
  const book = getActiveBook();
  if (DOM.statTotalWords) DOM.statTotalWords.textContent = getBookTotalWordCount(book);
  if (DOM.statTotalPages) DOM.statTotalPages.textContent = book ? book.pages.length : 0;
  if (DOM.statTotalBooks) DOM.statTotalBooks.textContent = state.books.length;
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

function updateCommitHint() {
  if (!DOM.commitHint) return;
  if (state.settings.commitKey === 'enter') {
    DOM.commitHint.innerHTML = 'Commit with <kbd>Enter</kbd> (Shift+Enter for line break)';
  } else {
    DOM.commitHint.innerHTML = 'Commit with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>';
  }
}

function applySettingsUI() {
  if (DOM.settingMaxChars) DOM.settingMaxChars.value = state.settings.maxChars;
  if (DOM.settingWordsPerPage) DOM.settingWordsPerPage.value = state.settings.wordsPerPage;
  if (DOM.settingCommitKey) DOM.settingCommitKey.value = state.settings.commitKey;
  if (DOM.settingVolume) DOM.settingVolume.value = state.settings.volume;
  if (DOM.btnSoundToggle) DOM.btnSoundToggle.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
  updateCommitHint();
}

function showToast(msg) {
  if (!DOM.toast) return;
  DOM.toast.textContent = msg;
  DOM.toast.classList.add('show');
  setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 2600);
}

// ─── EXPORT MECHANICS ───────────────────────────────────────

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
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  showToast(`Exported ${filename}`);
}

function copyManuscriptToClipboard() {
  const content = compileManuscriptText('txt');
  navigator.clipboard.writeText(content).then(() => {
    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    showToast("Manuscript copied to clipboard!");
  }).catch(() => {
    showToast("Failed to copy to clipboard.");
  });
}

// ─── GOOGLE DRIVE REST API INTEGRATION ───────────────────────

async function uploadToGoogleDrive({ name, content, mimeType = 'text/plain', isDoc = false }) {
  const token = await getGoogleDriveToken();
  showToast(isDoc ? "Creating Google Doc..." : "Uploading to Google Drive...");

  const metadata = {
    name: name,
    mimeType: isDoc ? 'application/vnd.google-apps.document' : mimeType,
    description: 'Created by Typewriter Studio'
  };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + (isDoc ? 'text/plain; charset=UTF-8' : mimeType) + '\r\n\r\n' +
    content +
    closeDelim;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
  });

  if (!response.ok) {
    if (response.status === 401) {
      googleAccessToken = null;
      sessionStorage.removeItem('google_drive_access_token');
      renderUserUI();
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Google Drive error (${response.status})`);
  }

  return await response.json();
}

async function saveCurrentBookToDrive(asDoc = false) {
  const book = getActiveBook();
  if (!book) return;

  try {
    const rawContent = compileManuscriptText(asDoc ? 'txt' : 'txt');
    const cleanTitle = (book.title || 'manuscript').replace(/[^a-z0-9]/gi, '_');
    const fileName = asDoc 
      ? `${book.title} (Manuscript)`
      : `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.txt`;

    const result = await uploadToGoogleDrive({
      name: fileName,
      content: rawContent,
      mimeType: 'text/plain',
      isDoc: asDoc
    });

    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    showToast(`Saved "${result.name}" to Google Drive!`);
    
    // If open in new tab link is available, notify
    if (result.webViewLink) {
      console.log("Drive document created:", result.webViewLink);
    }
  } catch (err) {
    console.error("Save to Drive error:", err);
    showToast(`Google Drive: ${err.message || 'Failed to save.'}`);
  }
}

async function saveBackupToDrive() {
  try {
    const backupData = JSON.stringify({
      version: 1,
      exportDate: new Date().toISOString(),
      books: state.books,
      settings: state.settings
    }, null, 2);

    const fileName = `typewriter_backup_${new Date().toISOString().slice(0, 10)}.json`;

    const result = await uploadToGoogleDrive({
      name: fileName,
      content: backupData,
      mimeType: 'application/json',
      isDoc: false
    });

    showToast(`Backup saved to Google Drive as "${result.name}"!`);
  } catch (err) {
    console.error("Drive backup error:", err);
    showToast(`Drive backup: ${err.message || 'Failed to save.'}`);
  }
}

async function fetchDriveFiles() {
  const token = await getGoogleDriveToken();
  const url = `https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=modifiedTime%20desc&pageSize=50`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    if (response.status === 401) {
      googleAccessToken = null;
      sessionStorage.removeItem('google_drive_access_token');
      renderUserUI();
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to fetch files (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
}

async function downloadDriveFile(fileId) {
  const token = await getGoogleDriveToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download file from Google Drive (${response.status})`);
  }

  return await response.text();
}

async function deleteDriveFile(fileId, fileName) {
  if (!confirm(`Delete "${fileName}" from your Google Drive?`)) return;

  try {
    const token = await getGoogleDriveToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok || response.status === 204) {
      showToast(`Deleted "${fileName}" from Google Drive.`);
      refreshDriveFiles();
    } else {
      throw new Error(`Delete failed (${response.status})`);
    }
  } catch (err) {
    showToast(`Could not delete: ${err.message}`);
  }
}

async function restoreDriveBackup(fileId) {
  try {
    showToast("Downloading backup from Google Drive...");
    const raw = await downloadDriveFile(fileId);
    const importedData = JSON.parse(raw);

    if (importedData && importedData.books && importedData.books.length > 0) {
      if (confirm("Restore this backup? This will update your current books and studio settings.")) {
        state.books = importedData.books;
        if (importedData.settings) {
          state.settings = { ...state.settings, ...importedData.settings };
        }
        state.activeBookId = state.books[0].id;
        state.currentPageId = state.books[0].pages[state.books[0].pages.length - 1].id;
        saveStorage();
        renderAll();
        closeDriveModal();
        closeOverlay();
        showToast("Studio state restored from Google Drive!");
      }
    } else {
      showToast("Selected file is not a valid studio backup JSON.");
    }
  } catch (err) {
    console.error("Restore error:", err);
    showToast(`Failed to restore backup: ${err.message}`);
  }
}

function openDriveModal() {
  if (DOM.driveModal) DOM.driveModal.classList.remove('hidden');
  refreshDriveFiles();
}

function closeDriveModal() {
  if (DOM.driveModal) DOM.driveModal.classList.add('hidden');
}

async function refreshDriveFiles() {
  if (!DOM.driveFilesList || !DOM.driveLoadingIndicator || !DOM.driveEmptyMessage) return;

  DOM.driveLoadingIndicator.classList.remove('hidden');
  DOM.driveFilesList.classList.add('hidden');
  DOM.driveEmptyMessage.classList.add('hidden');

  try {
    const files = await fetchDriveFiles();
    DOM.driveLoadingIndicator.classList.add('hidden');

    if (!files || files.length === 0) {
      DOM.driveEmptyMessage.classList.remove('hidden');
      return;
    }

    renderDriveFilesList(files);
  } catch (err) {
    DOM.driveLoadingIndicator.classList.add('hidden');
    DOM.driveEmptyMessage.textContent = `Could not load Google Drive files: ${err.message}`;
    DOM.driveEmptyMessage.classList.remove('hidden');
  }
}

function renderDriveFilesList(files) {
  if (!DOM.driveFilesList) return;
  DOM.driveFilesList.innerHTML = '';
  DOM.driveFilesList.classList.remove('hidden');

  files.forEach(file => {
    const li = document.createElement('li');
    li.className = 'drive-file-item';

    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
    const isJson = file.name.endsWith('.json') || file.mimeType === 'application/json';
    const icon = isDoc ? '📄' : isJson ? '💾' : '📝';
    const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '';

    li.innerHTML = `
      <div class="drive-file-main">
        <span class="drive-file-icon">${icon}</span>
        <div class="drive-file-details">
          <span class="drive-file-name" title="${file.name}">${file.name}</span>
          <span class="drive-file-subtext">${isDoc ? 'Google Doc' : isJson ? 'Studio Backup' : 'Text File'} • ${dateStr}</span>
        </div>
      </div>
      <div class="drive-file-actions">
        ${isJson ? `<button class="btn-drive-action primary btn-restore-item" title="Restore this backup into Studio">Restore</button>` : ''}
        ${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" rel="noopener noreferrer" class="btn-drive-action" title="Open file in Google Drive">Open ↗</a>` : ''}
        <button class="btn-drive-action btn-delete-item" title="Delete file">🗑️</button>
      </div>
    `;

    const btnRestore = li.querySelector('.btn-restore-item');
    if (btnRestore) {
      btnRestore.onclick = () => restoreDriveBackup(file.id);
    }

    const btnDel = li.querySelector('.btn-delete-item');
    if (btnDel) {
      btnDel.onclick = () => deleteDriveFile(file.id, file.name);
    }

    DOM.driveFilesList.appendChild(li);
  });
}

// ─── EVENT LISTENERS ────────────────────────────────────────

function setupEventListeners() {
  // ESC Key Listener & Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.driveModal && !DOM.driveModal.classList.contains('hidden')) {
        DOM.driveModal.classList.add('hidden');
        return;
      }
      if (DOM.iosInstallModal && !DOM.iosInstallModal.classList.contains('hidden')) {
        DOM.iosInstallModal.classList.add('hidden');
        return;
      }
      if (DOM.exportModal && !DOM.exportModal.classList.contains('hidden')) {
        DOM.exportModal.classList.add('hidden');
        return;
      }
      if (overlayOpen) closeOverlay();
      else openOverlay();
      return;
    }

    if (!overlayOpen && document.activeElement === DOM.draftInput) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = DOM.draftInput.selectionStart;
        const end = DOM.draftInput.selectionEnd;
        const val = DOM.draftInput.value;
        const tabChar = '\t';

        DOM.draftInput.value = val.substring(0, start) + tabChar + val.substring(end);
        DOM.draftInput.selectionStart = DOM.draftInput.selectionEnd = start + tabChar.length;
        state.buffer = DOM.draftInput.value;
        playKeyClickSound();

        if (state.buffer.length >= state.settings.maxChars) {
          commitDraft();
        } else {
          updateCharCounter();
        }
        return;
      }

      const isCtrlMode = state.settings.commitKey === 'ctrl-enter';
      const commitTriggered = isCtrlMode
        ? (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
        : (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey);

      if (commitTriggered) {
        e.preventDefault();
        commitDraft();
      }
    }
  });

  // ESC Hint Click / Auto fade
  if (DOM.escHint) {
    DOM.escHint.onclick = () => {
      if (overlayOpen) closeOverlay();
      else openOverlay();
    };
  }

  hintTimer = setTimeout(() => {
    if (DOM.escHint) DOM.escHint.classList.add('fade');
  }, 3000);

  // Overlay Backdrop Click to close
  if (DOM.escOverlay) {
    DOM.escOverlay.onclick = (e) => {
      if (e.target === DOM.escOverlay) closeOverlay();
    };
  }

  if (DOM.btnResume) DOM.btnResume.onclick = closeOverlay;

  // Draft Input events
  if (DOM.draftInput) {
    DOM.draftInput.oninput = (e) => {
      state.buffer = e.target.value;
      playKeyClickSound();

      if (state.buffer.length >= state.settings.maxChars) {
        commitDraft();
      } else {
        updateCharCounter();
      }
    };
  }

  if (DOM.btnCommit) DOM.btnCommit.onclick = commitDraft;

  // Book selectors
  if (DOM.selectBookSlot) {
    DOM.selectBookSlot.onchange = (e) => {
      state.activeBookId = e.target.value;
      const book = getActiveBook();
      if (book && book.pages.length > 0) {
        state.currentPageId = book.pages[book.pages.length - 1].id;
      }
      saveStorage();
      renderAll();
      showToast(`Switched to "${book.title}"`);
    };
  }

  if (DOM.btnNewBook) DOM.btnNewBook.onclick = () => createNewBook();
  if (DOM.btnRenameBook) DOM.btnRenameBook.onclick = () => renameCurrentBook();
  if (DOM.btnDeleteBook) DOM.btnDeleteBook.onclick = () => deleteCurrentBook();

  // Pages
  if (DOM.btnNewPage) {
    DOM.btnNewPage.onclick = () => {
      createNewPage();
      closeOverlay();
    };
  }

  // Auth & Cloud
  if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.onclick = handleGoogleSignIn;
  if (DOM.btnLogout) DOM.btnLogout.onclick = handleSignOut;

  if (DOM.btnBackupCloud) DOM.btnBackupCloud.onclick = exportBackupFile;
  if (DOM.btnRestoreCloud) DOM.btnRestoreCloud.onclick = () => DOM.fileInputRestore && DOM.fileInputRestore.click();
  if (DOM.fileInputRestore) DOM.fileInputRestore.onchange = importBackupFile;

  // Google Drive buttons
  if (DOM.btnDriveBackup) DOM.btnDriveBackup.onclick = saveBackupToDrive;
  if (DOM.btnDriveManager) DOM.btnDriveManager.onclick = openDriveModal;
  if (DOM.btnQuickBackupDrive) DOM.btnQuickBackupDrive.onclick = saveBackupToDrive;
  if (DOM.btnQuickExportDrive) DOM.btnQuickExportDrive.onclick = () => saveCurrentBookToDrive(true);
  if (DOM.btnRefreshDrive) DOM.btnRefreshDrive.onclick = refreshDriveFiles;
  if (DOM.btnCloseDriveModal) DOM.btnCloseDriveModal.onclick = closeDriveModal;

  // PWA Install buttons & modals
  if (DOM.btnInstallPwa) DOM.btnInstallPwa.onclick = handleInstallPrompt;
  if (DOM.btnPwaInstallLeft) DOM.btnPwaInstallLeft.onclick = handleInstallPrompt;
  if (DOM.btnCloseIosModal) DOM.btnCloseIosModal.onclick = () => DOM.iosInstallModal && DOM.iosInstallModal.classList.add('hidden');
  if (DOM.btnCloseIosModalBtn) DOM.btnCloseIosModalBtn.onclick = () => DOM.iosInstallModal && DOM.iosInstallModal.classList.add('hidden');

  if (DOM.iosInstallModal) {
    DOM.iosInstallModal.onclick = (e) => {
      if (e.target === DOM.iosInstallModal) DOM.iosInstallModal.classList.add('hidden');
    };
  }

  // Network Online / Offline Events
  window.addEventListener('online', () => {
    updateNetworkStatus(true);
    showToast("Back online. Cloud sync active.");
  });
  window.addEventListener('offline', () => {
    updateNetworkStatus(false);
    showToast("Offline mode. Auto-saving to local disk.");
  });

  // PWA Prompt Listeners
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    checkPwaInstallState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    isAppInstalled = true;
    checkPwaInstallState();
    showToast("Typewriter installed to desktop!");
  });

  if (DOM.driveModal) {
    DOM.driveModal.onclick = (e) => {
      if (e.target === DOM.driveModal) closeDriveModal();
    };
  }

  // Safety Archive Modal
  if (DOM.btnSafetyArchive) DOM.btnSafetyArchive.onclick = openSafetyArchiveModal;
  if (DOM.btnCloseArchiveModal) DOM.btnCloseArchiveModal.onclick = closeSafetyArchiveModal;
  if (DOM.btnClearSafetyArchive) DOM.btnClearSafetyArchive.onclick = clearSafetyArchive;
  if (DOM.safetyArchiveModal) {
    DOM.safetyArchiveModal.onclick = (e) => {
      if (e.target === DOM.safetyArchiveModal) closeSafetyArchiveModal();
    };
  }

  // Clear all
  if (DOM.btnClearAll) {
    DOM.btnClearAll.onclick = () => {
      if (confirm("Reset all books, pages, and preferences?\n\n(An automatic safety backup of ALL your manuscripts will be created and downloaded first in case this was an accident.)")) {
        // Automatically back up all manuscripts before resetting
        createSafetyBackupForReset(state.books, state.settings, 'Full Studio Reset');

        // Retain safety archive and reset other items
        const savedArchive = localStorage.getItem('typewriter_safety_archive');
        localStorage.clear();
        if (savedArchive) {
          localStorage.setItem('typewriter_safety_archive', savedArchive);
        }

        state.books = [];
        state.settings = {
          maxChars: 200,
          wordsPerPage: 300,
          theme: 'cream',
          font: 'courier',
          commitKey: 'ctrl-enter',
          soundEnabled: true,
          volume: 50
        };
        applyTheme();
        applyFont();
        applySettingsUI();
        createNewBook("My First Book", false);
        closeSafetyArchiveModal();
        closeOverlay();
        showToast("Studio data reset. Safety backup of all books was saved & downloaded.");
      }
    };
  }

  // Settings
  if (DOM.settingMaxChars) {
    DOM.settingMaxChars.onchange = (e) => {
      state.settings.maxChars = Math.max(20, parseInt(e.target.value, 10) || 200);
      saveStorage();
      renderAll();
    };
  }

  if (DOM.settingWordsPerPage) {
    DOM.settingWordsPerPage.onchange = (e) => {
      state.settings.wordsPerPage = Math.max(50, parseInt(e.target.value, 10) || 300);
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

  if (DOM.settingCommitKey) {
    DOM.settingCommitKey.onchange = (e) => {
      state.settings.commitKey = e.target.value;
      updateCommitHint();
      saveStorage();
    };
  }

  if (DOM.settingVolume) {
    DOM.settingVolume.oninput = (e) => {
      state.settings.volume = parseInt(e.target.value, 10);
      saveStorage();
    };
  }

  if (DOM.btnSoundToggle) {
    DOM.btnSoundToggle.onclick = () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      DOM.btnSoundToggle.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
      saveStorage();
      showToast(state.settings.soundEnabled ? 'Sound ON' : 'Sound Muted');
    };
  }

  // Export Modal
  if (DOM.btnExportModalToggle) {
    DOM.btnExportModalToggle.onclick = () => {
      if (DOM.exportModal) DOM.exportModal.classList.remove('hidden');
    };
  }

  if (DOM.btnCloseExportModal) {
    DOM.btnCloseExportModal.onclick = () => {
      if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    };
  }

  if (DOM.exportModal) {
    DOM.exportModal.onclick = (e) => {
      if (e.target === DOM.exportModal) {
        DOM.exportModal.classList.add('hidden');
      }
    };
  }

  if (DOM.btnExportDriveDoc) DOM.btnExportDriveDoc.onclick = () => saveCurrentBookToDrive(true);
  if (DOM.btnExportDriveTxt) DOM.btnExportDriveTxt.onclick = () => saveCurrentBookToDrive(false);
  if (DOM.btnExportTxt) DOM.btnExportTxt.onclick = () => exportManuscript('txt');
  if (DOM.btnExportMd) DOM.btnExportMd.onclick = () => exportManuscript('md');
  if (DOM.btnCopyAll) DOM.btnCopyAll.onclick = copyManuscriptToClipboard;
}

// ─── INITIALIZATION ─────────────────────────────────────────

function init() {
  initDOM();
  loadStorage();
  setupEventListeners();
  applySettingsUI();
  initFirebase();
  renderAll();
  updateSafetyArchiveBadge();
  checkPwaInstallState();
  updateNetworkStatus(navigator.onLine);

  // Register PWA Service Worker for offline & standalone support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('PWA ServiceWorker registered successfully with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err);
      });
  }

  // Focus drafting input on start
  setTimeout(() => {
    if (DOM.draftInput) DOM.draftInput.focus();
  }, 150);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
