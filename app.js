/**
 * Typewriter Studio - Application Core
 * Forward-Only Micro-Drafting Engine with Firebase Auth & Firestore Sync
 * Firebase Project: gen-lang-client-0081756947
 */

// Firebase Configuration for Project
const firebaseConfig = {
  projectId: "gen-lang-client-0081756947",
  appId: "1:757537539472:web:f4cd43fd3f2d55f16d5f15",
  apiKey: "AIzaSyBlYBw9rVhOSCAFNco2tK7iu7TWvGnv3wk",
  authDomain: "gen-lang-client-0081756947.firebaseapp.com",
  storageBucket: "gen-lang-client-0081756947.firebasestorage.app",
  messagingSenderId: "757537539472"
};

let auth = null;
let db = null;
let currentUser = null;
let googleAccessToken = sessionStorage.getItem('google_drive_access_token') || null;
let lastRenderedPageId = null;

// Chunk Data Helpers for Timestamping
function getChunkText(chunk) {
  if (chunk === null || chunk === undefined) return '';
  if (typeof chunk === 'string') return chunk;
  return chunk.text || '';
}

function getChunkTimestamp(chunk) {
  if (chunk === null || chunk === undefined) return null;
  if (typeof chunk === 'string') return null;
  return chunk.timestamp || null;
}

function formatChunkTime(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const dateStr = `${month}/${day}/${year}`;
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${dateStr} ${timeStr}`;
  } catch (e) {
    return '';
  }
}

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
    soundEnabled: true,
    showTimestamps: false,
    typewriterAnim: false,
    autoAddSpace: false,
    settingsVersion: 2
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
    pageWordCounter: document.getElementById('page-word-counter'),
    inkStream: document.getElementById('ink-stream'),
    draftBox: document.getElementById('draft-box'),
    draftInput: document.getElementById('draft-input'),
    draftInputBackdrop: document.getElementById('draft-input-backdrop'),
    charCounter: document.getElementById('char-counter'),
    commitHint: document.getElementById('commit-hint'),
    btnCommit: document.getElementById('btn-commit'),

    escOverlay: document.getElementById('esc-overlay'),
    escHint: document.getElementById('esc-hint'),
    btnResume: document.getElementById('btn-resume'),

    selectBookSlot: document.getElementById('select-book-slot'),
    btnNewBook: document.getElementById('btn-new-book'),
    btnImportBookQuick: document.getElementById('btn-import-book-quick'),
    btnRenameBook: document.getElementById('btn-rename-book'),
    btnDeleteBook: document.getElementById('btn-delete-book'),

    pagesList: document.getElementById('pages-list'),
    btnNewPage: document.getElementById('btn-new-page'),
    btnImportManuscript: document.getElementById('btn-import-manuscript'),
    fileInputImportManuscript: document.getElementById('file-input-import-manuscript'),
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

    // Tabbed Menu Elements
    menuTabsNav: document.getElementById('menu-tabs-nav'),
    tabBtnReadDraft: document.getElementById('tab-btn-read-draft'),
    tabBtnNewDraft: document.getElementById('tab-btn-new-draft'),
    tabBtnLoadDraft: document.getElementById('tab-btn-load-draft'),
    tabBtnDeleteDraft: document.getElementById('tab-btn-delete-draft'),
    tabBtnNewPage: document.getElementById('tab-btn-new-page'),
    tabBtnOpenEpubReader: document.getElementById('tab-btn-open-epub-reader'),
    fileInputEpubReader: document.getElementById('file-input-epub-reader'),
    tabBtnLoadJson: document.getElementById('tab-btn-load-json'),
    tabBtnImportDrive: document.getElementById('tab-btn-import-drive'),
    tabBtnImportLocal: document.getElementById('tab-btn-import-local'),
    tabBtnSafetyArchive: document.getElementById('tab-btn-safety-archive'),
    tabBtnExportPdf: document.getElementById('tab-btn-export-pdf'),
    tabBtnExportEpub: document.getElementById('tab-btn-export-epub'),
    tabBtnExportDriveDoc: document.getElementById('tab-btn-export-drive-doc'),
    tabBtnExportAllDialog: document.getElementById('tab-btn-export-all-dialog'),
    tabBtnDownloadJsonBackup: document.getElementById('tab-btn-download-json-backup'),
    tabBtnToggleDrive: document.getElementById('tab-btn-toggle-drive'),
    tabDriveToggleTitle: document.getElementById('tab-drive-toggle-title'),
    tabDriveToggleDesc: document.getElementById('tab-drive-toggle-desc'),
    tabBtnDriveManager: document.getElementById('tab-btn-drive-manager'),
    settingFirebaseSync: document.getElementById('setting-firebase-sync'),
    tabSyncStatusDesc: document.getElementById('tab-sync-status-desc'),
    btnOpenEreaderMini: document.getElementById('btn-open-ereader-mini'),

    settingMaxChars: document.getElementById('setting-max-chars'),
    settingWordsPerPage: document.getElementById('setting-words-per-page'),
    settingTheme: document.getElementById('setting-theme'),
    settingFont: document.getElementById('setting-font'),
    settingCommitKey: document.getElementById('setting-commit-key'),
    settingVolume: document.getElementById('setting-volume'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    settingTypewriterAnim: document.getElementById('setting-typewriter-anim'),
    settingAutoSpace: document.getElementById('setting-auto-space'),
    settingShowTimestamps: document.getElementById('setting-show-timestamps'),
    btnToggleTimestamps: document.getElementById('btn-toggle-timestamps'),

    statTotalWords: document.getElementById('stat-total-words'),
    statTotalPages: document.getElementById('stat-total-pages'),
    statTotalBooks: document.getElementById('stat-total-books'),

    exportModal: document.getElementById('export-modal'),
    btnExportModalToggle: document.getElementById('btn-export-modal-toggle'),
    btnCloseExportModal: document.getElementById('btn-close-export-modal'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportMd: document.getElementById('btn-export-md'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportEpub: document.getElementById('btn-export-epub'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnCopyAll: document.getElementById('btn-copy-all'),
    btnExportDriveDoc: document.getElementById('btn-export-drive-doc'),
    btnExportDriveTxt: document.getElementById('btn-export-drive-txt'),

    btnDriveBackup: document.getElementById('btn-drive-backup'),
    btnDriveImport: document.getElementById('btn-drive-import'),
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
    btnQuickImportDrive: document.getElementById('btn-quick-import-drive'),
    btnQuickRestoreDrive: document.getElementById('btn-quick-restore-drive'),
    driveLoadingIndicator: document.getElementById('drive-loading-indicator'),
    driveFilesList: document.getElementById('drive-files-list'),
    driveEmptyMessage: document.getElementById('drive-empty-message'),

    backupInspectModal: document.getElementById('backup-inspect-modal'),
    backupInspectTitle: document.getElementById('backup-inspect-title'),
    btnCloseBackupInspect: document.getElementById('btn-close-backup-inspect'),
    btnCancelBackupInspect: document.getElementById('btn-cancel-backup-inspect'),
    btnConfirmBackupRestore: document.getElementById('btn-confirm-backup-restore'),
    btnMergeBackupInspect: document.getElementById('btn-merge-backup-inspect'),
    backupInspectDate: document.getElementById('backup-inspect-date'),
    backupInspectBooks: document.getElementById('backup-inspect-books'),
    backupInspectPages: document.getElementById('backup-inspect-pages'),
    backupInspectWords: document.getElementById('backup-inspect-words'),
    backupInspectSource: document.getElementById('backup-inspect-source'),
    backupInspectBooksList: document.getElementById('backup-inspect-books-list'),

    // Import Manuscript Modal
    importManuscriptModal: document.getElementById('import-manuscript-modal'),
    importManuscriptTitle: document.getElementById('import-manuscript-title'),
    importManuscriptDesc: document.getElementById('import-manuscript-desc'),
    importManuscriptList: document.getElementById('import-manuscript-list'),
    btnCloseImportManuscript: document.getElementById('btn-close-import-manuscript'),
    btnCancelImportManuscript: document.getElementById('btn-cancel-import-manuscript'),
    btnImportAllToSession: document.getElementById('btn-import-all-to-session'),

    // Page Description Modal
    pageDescModal: document.getElementById('page-desc-modal'),
    pageDescModalTitle: document.getElementById('page-desc-modal-title'),
    pageDescModalSubtitle: document.getElementById('page-desc-modal-subtitle'),
    inputPageDesc: document.getElementById('input-page-desc'),
    btnClosePageDesc: document.getElementById('btn-close-page-desc'),
    btnCancelPageDesc: document.getElementById('btn-cancel-page-desc'),
    btnClearPageDesc: document.getElementById('btn-clear-page-desc'),
    btnSavePageDesc: document.getElementById('btn-save-page-desc'),

    // Manuscript Search
    inputBookSearch: document.getElementById('input-book-search'),
    btnClearBookSearch: document.getElementById('btn-clear-book-search'),
    searchResultsModal: document.getElementById('search-results-modal'),
    searchModalTitle: document.getElementById('search-modal-title'),
    inputModalSearch: document.getElementById('input-modal-search'),
    searchResultsCountBadge: document.getElementById('search-results-count-badge'),
    searchResultsContainer: document.querySelector('.search-results-container'),
    searchResultsList: document.getElementById('search-results-list'),
    searchEmptyState: document.getElementById('search-empty-state'),
    btnCloseSearchModal: document.getElementById('btn-close-search-modal'),
    btnDismissSearchModal: document.getElementById('btn-dismiss-search-modal'),

    // E-Reader Overlay DOM Elements
    ereaderOverlay: document.getElementById('ereader-overlay'),
    btnEreaderExit: document.getElementById('btn-ereader-exit'),
    btnEreaderToc: document.getElementById('btn-ereader-toc'),
    btnEreaderBookmarks: document.getElementById('btn-ereader-bookmarks'),
    ereaderBookTitle: document.getElementById('ereader-book-title'),
    ereaderChapterTitle: document.getElementById('ereader-chapter-title'),
    btnEreaderOpenEpub: document.getElementById('btn-ereader-open-epub'),
    btnEreaderSearch: document.getElementById('btn-ereader-search'),
    btnEreaderStyle: document.getElementById('btn-ereader-style'),
    btnEreaderFullscreen: document.getElementById('btn-ereader-fullscreen'),
    ereaderFsIcon: document.getElementById('ereader-fs-icon'),
    ereaderSidebar: document.getElementById('ereader-sidebar'),
    btnCloseEreaderSidebar: document.getElementById('btn-close-ereader-sidebar'),
    ereaderTabToc: document.getElementById('ereader-tab-toc'),
    ereaderTabBm: document.getElementById('ereader-tab-bm'),
    ereaderBmCount: document.getElementById('ereader-bm-count'),
    ereaderSidebarTocPanel: document.getElementById('ereader-sidebar-toc-panel'),
    ereaderSidebarBmPanel: document.getElementById('ereader-sidebar-bm-panel'),
    ereaderCoverPreview: document.getElementById('ereader-cover-preview'),
    ereaderMetaTitle: document.getElementById('ereader-meta-title'),
    ereaderMetaAuthor: document.getElementById('ereader-meta-author'),
    ereaderMetaStats: document.getElementById('ereader-meta-stats'),
    ereaderTocList: document.getElementById('ereader-toc-list'),
    btnAddBookmark: document.getElementById('btn-add-bookmark'),
    ereaderBookmarksList: document.getElementById('ereader-bookmarks-list'),
    ereaderSearchBar: document.getElementById('ereader-search-bar'),
    ereaderSearchInput: document.getElementById('ereader-search-input'),
    ereaderSearchCount: document.getElementById('ereader-search-count'),
    btnEreaderSearchPrev: document.getElementById('btn-ereader-search-prev'),
    btnEreaderSearchNext: document.getElementById('btn-ereader-search-next'),
    btnCloseEreaderSearch: document.getElementById('btn-close-ereader-search'),
    ereaderStylePopover: document.getElementById('ereader-style-popover'),
    btnCloseEreaderStyle: document.getElementById('btn-close-ereader-style'),
    ereaderOptPublisherDefaults: document.getElementById('ereader-opt-publisher-defaults'),
    ereaderCustomStylesSection: document.getElementById('ereader-custom-styles-section'),
    btnFontDec: document.getElementById('btn-font-dec'),
    btnFontInc: document.getElementById('btn-font-inc'),
    ereaderFontSizeVal: document.getElementById('ereader-font-size-val'),
    ereaderOptTwoPage: document.getElementById('ereader-opt-two-page'),
    ereaderStage: document.getElementById('ereader-stage'),
    btnEreaderPrev: document.getElementById('btn-ereader-prev'),
    btnEreaderNext: document.getElementById('btn-ereader-next'),
    ereaderViewportWrapper: document.getElementById('ereader-viewport-wrapper'),
    ereaderViewport: document.getElementById('ereader-viewport'),
    ereaderLoading: document.getElementById('ereader-loading'),
    ereaderContentContainer: document.getElementById('ereader-content-container'),
    ereaderFooter: document.getElementById('ereader-footer'),
    ereaderProgressTrack: document.getElementById('ereader-progress-track'),
    ereaderProgressFill: document.getElementById('ereader-progress-fill'),
    btnFooterPrevChap: document.getElementById('btn-footer-prev-chap'),
    btnFooterNextChap: document.getElementById('btn-footer-next-chap'),
    ereaderChapterIndexLabel: document.getElementById('ereader-chapter-index-label'),
    ereaderBookProgressPct: document.getElementById('ereader-book-progress-pct'),
    ereaderReadingTimeEst: document.getElementById('ereader-reading-time-est'),
    ereaderChapterWordCount: document.getElementById('ereader-chapter-word-count'),

    // EPUB Choice Modal
    epubChoiceModal: document.getElementById('epub-choice-modal'),
    epubChoiceTitle: document.getElementById('epub-choice-title'),
    epubChoiceDesc: document.getElementById('epub-choice-desc'),
    btnEpubChoiceReader: document.getElementById('btn-epub-choice-reader'),
    btnEpubChoiceTypewriter: document.getElementById('btn-epub-choice-typewriter'),
    btnCloseEpubChoice: document.getElementById('btn-close-epub-choice'),
    btnCancelEpubChoice: document.getElementById('btn-cancel-epub-choice'),

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
  applySettingsUI();
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
  if (DOM.backupInspectModal) DOM.backupInspectModal.classList.add('hidden');
  if (DOM.pageDescModal) DOM.pageDescModal.classList.add('hidden');
  if (DOM.searchResultsModal) DOM.searchResultsModal.classList.add('hidden');

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
    provider.addScope('https://www.googleapis.com/auth/drive');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account consent' });
    return auth.signInWithPopup(provider).then((result) => {
      if (result.credential && result.credential.accessToken) {
        googleAccessToken = result.credential.accessToken;
        sessionStorage.setItem('google_drive_access_token', googleAccessToken);
      }
      showToast(`Welcome, ${result.user.displayName || 'Author'}! Synced with Firestore & Google Drive.`);
      renderUserUI();
      return googleAccessToken;
    }).catch((error) => {
      console.error("Auth error:", error);
      showToast(`Sign in error: ${error.message}`);
      throw error;
    });
  } else {
    showToast("Firebase Auth initializing...");
    return Promise.reject(new Error("Firebase Auth initializing..."));
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
  provider.addScope('https://www.googleapis.com/auth/drive');
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ prompt: 'select_account consent' });

  try {
    const result = await auth.signInWithPopup(provider);
    if (result.credential && result.credential.accessToken) {
      googleAccessToken = result.credential.accessToken;
      sessionStorage.setItem('google_drive_access_token', googleAccessToken);
      renderUserUI();
      return googleAccessToken;
    }
    throw new Error("Google Drive access token was not provided by Google. Please ensure popup blocker is disabled and try again.");
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
    if (DOM.tabDriveToggleTitle) DOM.tabDriveToggleTitle.textContent = "Disconnect Google Drive";
    if (DOM.tabDriveToggleDesc) DOM.tabDriveToggleDesc.textContent = `Connected as ${currentUser.displayName || currentUser.email || 'User'}`;
    if (DOM.tabSyncStatusDesc) DOM.tabSyncStatusDesc.textContent = (state.settings.firebaseSyncEnabled !== false) ? "Persistent Firestore cloud sync active" : "Cloud sync paused (Local mode)";
  } else {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.remove('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.add('hidden');
    if (DOM.tabDriveToggleTitle) DOM.tabDriveToggleTitle.textContent = "Connect Google Drive";
    if (DOM.tabDriveToggleDesc) DOM.tabDriveToggleDesc.textContent = "Sign in with Google to sync and manage Drive files";
    if (DOM.tabSyncStatusDesc) DOM.tabSyncStatusDesc.textContent = "Sign in to enable Firestore multi-device synchronization";
  }

  if (DOM.settingFirebaseSync) {
    DOM.settingFirebaseSync.checked = (state.settings.firebaseSyncEnabled !== false);
  }
}

function syncToFirestore() {
  if (!db || !currentUser || state.settings.firebaseSyncEnabled === false) return;
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
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      if (!parsed.settingsVersion || parsed.settingsVersion < 2) {
        parsed.typewriterAnim = false;
        parsed.settingsVersion = 2;
      }
      state.settings = { ...state.settings, ...parsed };
    }

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
    state.settings.settingsVersion = 2;
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
    const blob = (textContent instanceof Blob) ? textContent : new Blob([textContent], { type: mimeType });
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
      words += getPageWordCount(p);
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
    sessionType: 'full_session_instance',
    books: state.books,
    settings: state.settings
  }, null, 2);

  const filename = `typewriter_full_session_${new Date().toISOString().slice(0, 10)}.json`;
  triggerFileDownload(filename, backupData, 'application/json');
  showToast("Saved full session/instance backup file!");
}

// Pending Backup Inspection State
let pendingBackupPayload = null;
let pendingBackupSourceLabel = '';

function scanBackupPayload(payload) {
  if (!payload || !payload.books || !Array.isArray(payload.books) || payload.books.length === 0) {
    return null;
  }

  let totalWords = 0;
  let totalPages = 0;
  const bookSummaries = [];

  payload.books.forEach(b => {
    let bookWords = 0;
    const pages = b.pages || [];
    pages.forEach(p => {
      bookWords += getPageWordCount(p);
    });
    totalWords += bookWords;
    totalPages += pages.length;
    bookSummaries.push({
      id: b.id,
      title: b.title || 'Untitled Book',
      pagesCount: pages.length,
      wordsCount: bookWords
    });
  });

  return {
    raw: payload,
    date: payload.exportDate || payload.backupDate || null,
    booksCount: payload.books.length,
    totalPages: totalPages,
    totalWords: totalWords,
    bookSummaries: bookSummaries
  };
}

function openBackupInspectModal(payload, sourceLabel = 'Local File') {
  const scan = scanBackupPayload(payload);
  if (!scan) {
    alert("Invalid backup file: The selected file does not contain a valid Typewriter book library.");
    return;
  }

  pendingBackupPayload = payload;
  pendingBackupSourceLabel = sourceLabel;

  if (DOM.backupInspectModal) {
    DOM.backupInspectModal.classList.remove('hidden');

    if (DOM.backupInspectSource) {
      DOM.backupInspectSource.textContent = sourceLabel;
    }

    if (DOM.backupInspectDate) {
      if (scan.date) {
        try {
          const d = new Date(scan.date);
          DOM.backupInspectDate.textContent = isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          DOM.backupInspectDate.textContent = 'Unknown';
        }
      } else {
        DOM.backupInspectDate.textContent = 'Unspecified';
      }
    }

    if (DOM.backupInspectBooks) DOM.backupInspectBooks.textContent = scan.booksCount;
    if (DOM.backupInspectPages) DOM.backupInspectPages.textContent = scan.totalPages;
    if (DOM.backupInspectWords) DOM.backupInspectWords.textContent = scan.totalWords.toLocaleString();

    if (DOM.backupInspectBooksList) {
      DOM.backupInspectBooksList.innerHTML = '';
      scan.bookSummaries.forEach((b, idx) => {
        const li = document.createElement('li');
        li.className = 'backup-inspect-book-item';
        li.innerHTML = `
          <div class="backup-inspect-book-main">
            <span style="font-size:14px; opacity:0.8;">📖</span>
            <span class="backup-inspect-book-title" title="${b.title}">${idx + 1}. ${b.title}</span>
          </div>
          <span class="backup-inspect-book-meta">${b.pagesCount} pgs • ${b.wordsCount.toLocaleString()} wds</span>
        `;
        DOM.backupInspectBooksList.appendChild(li);
      });
    }
  }
}

function closeBackupInspectModal() {
  if (DOM.backupInspectModal) {
    DOM.backupInspectModal.classList.add('hidden');
  }
  pendingBackupPayload = null;
  if (DOM.fileInputRestore) {
    DOM.fileInputRestore.value = '';
  }
}

function executeBackupRestore(replaceMode = true) {
  if (!pendingBackupPayload || !pendingBackupPayload.books || pendingBackupPayload.books.length === 0) {
    showToast("No valid backup loaded to restore.");
    closeBackupInspectModal();
    return;
  }

  // 1. Safety Archive of current active workspace before any modification
  if (state.books && state.books.length > 0) {
    createSafetyBackupForReset(state.books, state.settings, `Automatic Backup Before Restoring (${pendingBackupSourceLabel || 'Backup File'})`);
  }

  const incomingBooks = pendingBackupPayload.books;

  if (replaceMode) {
    // Replace current workspace with the backup
    state.books = incomingBooks;
    if (pendingBackupPayload.settings) {
      state.settings = { ...state.settings, ...pendingBackupPayload.settings };
      applyTheme();
      applyFont();
      applySettingsUI();
    }
    state.activeBookId = state.books[0].id;
    const lastBook = state.books[0];
    const lastPage = (lastBook.pages && lastBook.pages.length > 0)
      ? lastBook.pages[lastBook.pages.length - 1]
      : null;
    state.currentPageId = lastPage ? lastPage.id : null;

    saveStorage();
    renderAll();
    closeBackupInspectModal();
    closeOverlay();
    showToast(`Restored full session (${state.books.length} books) from backup! Previous session preserved in Safety Archive.`);
    playCarriageReturnBell();
  } else {
    // Append / merge books into current session
    let addedCount = 0;
    incomingBooks.forEach(b => {
      const copy = JSON.parse(JSON.stringify(b));
      // Give fresh ID if clash or to preserve individuality
      const exists = state.books.some(curr => curr.id === copy.id);
      if (exists) {
        copy.id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        copy.title = copy.title + ' (Imported)';
      }
      state.books.push(copy);
      addedCount++;
    });

    state.activeBookId = state.books[state.books.length - 1].id;
    const activeBook = state.books[state.books.length - 1];
    const lastPage = (activeBook.pages && activeBook.pages.length > 0)
      ? activeBook.pages[activeBook.pages.length - 1]
      : null;
    state.currentPageId = lastPage ? lastPage.id : null;

    saveStorage();
    renderAll();
    closeBackupInspectModal();
    closeOverlay();
    showToast(`Appended ${addedCount} book${addedCount === 1 ? '' : 's'} to your current session!`);
    playCarriageReturnBell();
  }
}

function importBackupFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (importedData && importedData.books && importedData.books.length > 0) {
        openBackupInspectModal(importedData, file.name || 'Local File');
      } else {
        alert("Invalid backup file: The selected file does not contain a recognized Typewriter full session/instance backup.");
        if (DOM.fileInputRestore) DOM.fileInputRestore.value = '';
      }
    } catch (err) {
      alert("Could not read backup file. Please ensure it is a valid JSON full session backup from Typewriter Studio.");
      if (DOM.fileInputRestore) DOM.fileInputRestore.value = '';
    }
  };
  reader.readAsText(file);
}

// ─── SINGLE BOOK / MANUSCRIPT IMPORT & EXPORT ───────────────

let pendingImportMultiBooks = null;

function parseManuscriptFile(rawText, filename) {
  const isJsonExt = /\.json$/i.test(filename);
  const trimmed = (rawText || '').trim();

  // 1. Try JSON parsing if file is .json or begins with JSON object/array markers
  if (isJsonExt || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);

      // Case A: Single manuscript export format { type: 'single_manuscript', book: { ... } }
      if (data && data.type === 'single_manuscript' && data.book) {
        return { type: 'single', book: data.book };
      }
      // Case B: Safety backup single book { type: 'safety_backup_single_book', books: [ ... ] }
      if (data && data.type === 'safety_backup_single_book' && Array.isArray(data.books) && data.books.length > 0) {
        return { type: 'single', book: data.books[0] };
      }
      // Case C: Object having book property
      if (data && data.book && (data.book.title || data.book.pages)) {
        return { type: 'single', book: data.book };
      }
      // Case D: Direct Book object { id, title, pages }
      if (data && (Array.isArray(data.pages) || (data.title && (data.chunks || Array.isArray(data.pages))))) {
        return { type: 'single', book: data };
      }
      // Case E: Session backup with array of books
      if (data && Array.isArray(data.books) && data.books.length > 0) {
        if (data.books.length === 1) {
          return { type: 'single', book: data.books[0] };
        } else {
          return { type: 'multiple', books: data.books, filename: filename };
        }
      }
      // Case F: Array of book objects directly
      if (Array.isArray(data) && data.length > 0 && data[0] && (data[0].title || data[0].pages)) {
        if (data.length === 1) {
          return { type: 'single', book: data[0] };
        } else {
          return { type: 'multiple', books: data, filename: filename };
        }
      }
      // Case G: Simple note/document object { title, content / text }
      if (data && (data.title || data.content || data.text)) {
        return {
          type: 'single',
          book: {
            title: data.title || filename.replace(/\.json$/i, ''),
            pages: [{ number: 1, text: data.content || data.text || '', chunks: [] }]
          }
        };
      }
    } catch (jsonErr) {
      if (isJsonExt) {
        throw new Error("Could not parse JSON manuscript file. Ensure the file contains valid JSON.");
      }
    }
  }

  // 2. Plain Text (.txt) or Markdown (.md) Parsing
  let title = filename.replace(/\.(txt|md|text|markdown)$/i, '').replace(/[_-]/g, ' ').trim();
  let text = trimmed;

  // Extract top-level Markdown title (# Title)
  const titleMatch = text.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
    text = text.replace(/^#\s+.+$/m, '').trim();
  }

  // Detect explicit page divider lines:
  // e.g. "--- PAGE 1 (Title) ---", "## Page 1 (Title)", "=== PAGE 1 ===", or FormFeed "\f"
  const pageSepRegex = /(?:^|\n)(?:---+\s*PAGE\s+\d+(?:\s*\((.*?)\))?\s*---+|##+\s*Page\s+\d+(?:\s*\((.*?)\))?|===+\s*PAGE\s+\d+\s*===+|\f)/gi;
  const hasPageMarkers = pageSepRegex.test(text);
  pageSepRegex.lastIndex = 0;

  const pages = [];

  if (hasPageMarkers) {
    const parts = [];
    let match;
    let lastIndex = 0;
    let prevDesc = '';

    while ((match = pageSepRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex || lastIndex === 0) {
        const chunk = text.slice(lastIndex, matchIndex).trim();
        if (chunk.length > 0) {
          parts.push({ desc: prevDesc, content: chunk });
        }
      }
      prevDesc = (match[1] || match[2] || '').trim();
      lastIndex = pageSepRegex.lastIndex;
    }
    const finalChunk = text.slice(lastIndex).trim();
    if (finalChunk.length > 0) {
      parts.push({ desc: prevDesc, content: finalChunk });
    }

    if (parts.length > 0) {
      parts.forEach((p, idx) => {
        const paragraphs = p.content.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
        const chunks = paragraphs.map(pGraph => ({ text: pGraph }));
        pages.push({
          number: idx + 1,
          description: p.desc || '',
          chunks: chunks.length > 0 ? chunks : [{ text: p.content }]
        });
      });
    }
  }

  // If no explicit page markers, split text into pages naturally by paragraph & word count
  if (pages.length === 0) {
    const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const targetWordsPerPage = (state && state.settings && state.settings.wordsPerPage) || 300;

    let currentPageChunks = [];
    let currentWordCount = 0;

    paragraphs.forEach((pGraph) => {
      const wordsInP = pGraph.split(/\s+/).filter(Boolean).length;
      if (currentWordCount + wordsInP > targetWordsPerPage && currentPageChunks.length > 0) {
        pages.push({
          number: pages.length + 1,
          description: '',
          chunks: currentPageChunks
        });
        currentPageChunks = [];
        currentWordCount = 0;
      }
      currentPageChunks.push({ text: pGraph });
      currentWordCount += wordsInP;
    });

    if (currentPageChunks.length > 0 || pages.length === 0) {
      pages.push({
        number: pages.length + 1,
        description: '',
        chunks: currentPageChunks.length > 0 ? currentPageChunks : [{ text: '' }]
      });
    }
  }

  return {
    type: 'single',
    book: {
      title: title || 'Imported Manuscript',
      pages: pages
    }
  };
}

function addSingleManuscriptToSession(rawBook, sourceName = '') {
  if (!rawBook) return;

  // 1. Sanitize title
  let title = (rawBook.title || sourceName || `Manuscript ${state.books.length + 1}`).trim();
  if (state.books.some(b => b.title.toLowerCase() === title.toLowerCase())) {
    title = `${title} (Imported)`;
  }

  // 2. Sanitize pages
  const rawPages = Array.isArray(rawBook.pages) && rawBook.pages.length > 0
    ? rawBook.pages
    : [{ number: 1, chunks: [], description: '' }];

  const sanitizedPages = rawPages.map((p, pIdx) => {
    let rawChunks = [];
    if (Array.isArray(p.chunks)) {
      rawChunks = p.chunks;
    } else if (typeof p.text === 'string' && p.text.trim()) {
      rawChunks = [{ text: p.text }];
    } else if (typeof p.content === 'string' && p.content.trim()) {
      rawChunks = [{ text: p.content }];
    }

    const sanitizedChunks = rawChunks.map((c, cIdx) => {
      const text = typeof c === 'string' ? c : (c.text || '');
      return {
        id: 'chunk_' + Date.now() + '_' + pIdx + '_' + cIdx + '_' + Math.random().toString(36).substr(2, 4),
        text: text,
        createdAt: (c && c.createdAt) || Date.now(),
        wpm: (c && c.wpm) || 0,
        timeStr: (c && c.timeStr) || ''
      };
    }).filter(c => c.text.length > 0);

    return {
      id: 'page_' + Date.now() + '_' + pIdx + '_' + Math.random().toString(36).substr(2, 4),
      number: pIdx + 1,
      description: (p.description || '').trim(),
      chunks: sanitizedChunks,
      locked: Boolean(p.locked),
      createdAt: p.createdAt || Date.now()
    };
  });

  const newBook = {
    id: 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    title: title,
    pages: sanitizedPages,
    createdAt: Date.now()
  };

  // 3. Append to session without altering existing books
  state.books.push(newBook);
  state.activeBookId = newBook.id;
  state.currentPageId = newBook.pages[0].id;

  saveStorage();
  renderAll();

  let totalWords = 0;
  newBook.pages.forEach(pg => {
    totalWords += getPageWordCount(pg);
  });

  showToast(`Added manuscript "${newBook.title}" (${newBook.pages.length} pg${newBook.pages.length === 1 ? '' : 's'}, ${totalWords.toLocaleString()} wds) to session!`);
  playCarriageReturnBell();
}

function xmlEscape(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function parseEpubFile(arrayBuffer, filename) {
  if (typeof JSZip === 'undefined') {
    throw new Error("JSZip library is not loaded.");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Locate package document (.opf) via META-INF/container.xml
  let opfPath = null;
  const containerEntry = zip.file("META-INF/container.xml") || zip.file("meta-inf/container.xml");
  const parser = new DOMParser();

  if (containerEntry) {
    try {
      const containerText = await containerEntry.async("text");
      const containerDoc = parser.parseFromString(containerText, "application/xml");
      const rootfileEl = containerDoc.querySelector("rootfile");
      if (rootfileEl) {
        opfPath = rootfileEl.getAttribute("full-path");
      }
    } catch (e) {
      console.warn("Could not parse META-INF/container.xml:", e);
    }
  }

  // Fallback: search zip entries for any .opf file
  if (!opfPath) {
    const allFiles = Object.keys(zip.files);
    opfPath = allFiles.find(f => /\.opf$/i.test(f));
  }

  if (!opfPath || !zip.file(opfPath)) {
    throw new Error("Could not find package document (.opf) inside EPUB archive.");
  }

  const opfText = await zip.file(opfPath).async("text");
  const opfDoc = parser.parseFromString(opfText, "application/xml");
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  function resolveZipPath(base, rel) {
    if (!rel) return '';
    rel = decodeURIComponent(rel.split('#')[0]);
    if (rel.startsWith('/')) return rel.slice(1);
    const stack = base ? base.split('/').filter(Boolean) : [];
    const parts = rel.split('/');
    for (const p of parts) {
      if (p === '.' || !p) continue;
      if (p === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(p);
      }
    }
    return stack.join('/');
  }

  // 2. Extract title
  let title = '';
  const dcTitle = opfDoc.getElementsByTagName('dc:title')[0] || opfDoc.getElementsByTagName('title')[0];
  if (dcTitle && dcTitle.textContent) {
    title = dcTitle.textContent.trim();
  }
  if (!title) {
    title = filename.replace(/\.epub$/i, '').replace(/[_-]/g, ' ').trim() || 'Imported EPUB';
  }

  // 3. Manifest item map
  const manifest = new Map();
  const items = opfDoc.getElementsByTagName('item');
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    const mediaType = (it.getAttribute('media-type') || '').toLowerCase();
    if (id && href) {
      manifest.set(id, {
        path: resolveZipPath(opfDir, href),
        mediaType: mediaType
      });
    }
  }

  // 4. Reading order via spine
  const itemrefs = opfDoc.getElementsByTagName('itemref');
  const chapterPaths = [];
  for (let i = 0; i < itemrefs.length; i++) {
    const idref = itemrefs[i].getAttribute('idref');
    const mItem = manifest.get(idref);
    if (mItem) {
      if (mItem.mediaType.includes('html') || mItem.mediaType.includes('xml') || /\.(xhtml|html|htm)$/i.test(mItem.path)) {
        chapterPaths.push(mItem.path);
      }
    }
  }

  if (chapterPaths.length === 0) {
    manifest.forEach(mItem => {
      if (mItem.mediaType.includes('html') || /\.(xhtml|html|htm)$/i.test(mItem.path)) {
        chapterPaths.push(mItem.path);
      }
    });
  }

  if (chapterPaths.length === 0) {
    throw new Error("No readable XHTML or HTML chapters found in the EPUB file.");
  }

  // 5. Parse chapters into typewriter pages
  const pages = [];
  const targetWordsPerPage = (state && state.settings && state.settings.wordsPerPage) || 300;

  for (let cIdx = 0; cIdx < chapterPaths.length; cIdx++) {
    const cPath = chapterPaths[cIdx];
    const cEntry = zip.file(cPath);
    if (!cEntry) continue;

    const cText = await cEntry.async("text");
    const cDoc = parser.parseFromString(cText, "text/html");

    // Clean out non-content elements
    const unwanted = cDoc.querySelectorAll('script, style, link, meta, head');
    unwanted.forEach(el => el.remove());

    // Extract chapter title or header
    let chapterTitle = '';
    const hEl = cDoc.querySelector('h1, h2, h3');
    if (hEl && hEl.textContent.trim()) {
      chapterTitle = hEl.textContent.trim().replace(/\s+/g, ' ');
    } else {
      const docTitle = cDoc.querySelector('title');
      if (docTitle && docTitle.textContent.trim()) {
        chapterTitle = docTitle.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    // Extract paragraphs and content blocks
    const contentEls = Array.from(cDoc.body ? cDoc.body.querySelectorAll('p, blockquote, li, pre, h1, h2, h3, h4, h5, h6') : []);
    let paragraphs = [];

    if (contentEls.length > 0) {
      contentEls.forEach(el => {
        const t = el.textContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (t.length > 0) {
          paragraphs.push(t);
        }
      });
    } else if (cDoc.body && cDoc.body.textContent.trim()) {
      paragraphs = cDoc.body.textContent.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    }

    if (paragraphs.length === 0) {
      continue; // Skip empty sections (covers/placeholders)
    }

    // If chapter is large, split into pages according to word count
    const totalWordsInChapter = paragraphs.reduce((acc, p) => acc + p.split(/\s+/).filter(Boolean).length, 0);

    if (totalWordsInChapter > targetWordsPerPage * 2 && paragraphs.length > 3) {
      let currentChunks = [];
      let currentWordCount = 0;
      let partIdx = 1;

      paragraphs.forEach((pText) => {
        const pWords = pText.split(/\s+/).filter(Boolean).length;
        if (currentWordCount + pWords > targetWordsPerPage && currentChunks.length > 0) {
          pages.push({
            number: pages.length + 1,
            description: chapterTitle ? `${chapterTitle} (Part ${partIdx})` : '',
            chunks: currentChunks
          });
          currentChunks = [];
          currentWordCount = 0;
          partIdx++;
        }
        currentChunks.push({ text: pText });
        currentWordCount += pWords;
      });

      if (currentChunks.length > 0) {
        pages.push({
          number: pages.length + 1,
          description: chapterTitle ? (partIdx > 1 ? `${chapterTitle} (Part ${partIdx})` : chapterTitle) : '',
          chunks: currentChunks
        });
      }
    } else {
      pages.push({
        number: pages.length + 1,
        description: chapterTitle,
        chunks: paragraphs.map(pText => ({ text: pText }))
      });
    }
  }

  if (pages.length === 0) {
    pages.push({
      number: 1,
      description: '',
      chunks: [{ text: '' }]
    });
  }

  return {
    title: title,
    pages: pages
  };
}

// ─── E-READER MODE ENGINE & PUBLISHER FORMATTING ────────────

const ereaderState = {
  isOpen: false,
  isPublishedEpub: false,
  bookId: null,
  bookTitle: 'Published Book',
  author: 'Unknown Author',
  publisher: '',
  coverDataUrl: null,
  chapters: [],
  toc: [],
  currentChapterIndex: 0,
  settings: {
    usePublisherDefaults: true,
    theme: 'paper',
    fontFamily: 'publisher',
    fontSize: 18,
    lineHeight: 1.65,
    textAlign: 'justify',
    pageWidth: 780,
    twoPageSpread: false
  },
  bookmarks: [],
  search: {
    query: '',
    matches: [],
    currentMatchIndex: 0
  }
};

let pendingEpubData = null; // Holds { arrayBuffer, filename } for choice modal

async function parseEpubForReader(arrayBuffer, filename) {
  if (typeof JSZip === 'undefined') {
    throw new Error("JSZip library is not loaded.");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const parser = new DOMParser();

  // 1. Locate package document (.opf)
  let opfPath = null;
  const containerEntry = zip.file("META-INF/container.xml") || zip.file("meta-inf/container.xml");

  if (containerEntry) {
    try {
      const containerText = await containerEntry.async("text");
      const containerDoc = parser.parseFromString(containerText, "application/xml");
      const rootfileEl = containerDoc.querySelector("rootfile");
      if (rootfileEl) {
        opfPath = rootfileEl.getAttribute("full-path");
      }
    } catch (e) {
      console.warn("Could not parse META-INF/container.xml:", e);
    }
  }

  if (!opfPath) {
    const allFiles = Object.keys(zip.files);
    opfPath = allFiles.find(f => /\.opf$/i.test(f));
  }

  if (!opfPath || !zip.file(opfPath)) {
    throw new Error("Could not find package document (.opf) inside EPUB archive.");
  }

  const opfText = await zip.file(opfPath).async("text");
  const opfDoc = parser.parseFromString(opfText, "application/xml");
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  function normalizeZipPath(path) {
    if (!path) return '';
    path = decodeURIComponent(path.split('#')[0]);
    if (path.startsWith('/')) path = path.slice(1);
    const parts = path.split('/');
    const stack = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(p);
      }
    }
    return stack.join('/');
  }

  function resolveZipPath(base, rel) {
    if (!rel) return '';
    rel = decodeURIComponent(rel.split('#')[0]);
    if (rel.startsWith('/')) return normalizeZipPath(rel);
    const combined = base ? (base + rel) : rel;
    return normalizeZipPath(combined);
  }

  // 2. Extract Metadata
  let bookTitle = '';
  const dcTitle = opfDoc.getElementsByTagName('dc:title')[0] || opfDoc.getElementsByTagName('title')[0];
  if (dcTitle && dcTitle.textContent) {
    bookTitle = dcTitle.textContent.trim();
  }
  if (!bookTitle) {
    bookTitle = filename.replace(/\.epub$/i, '').replace(/[_-]/g, ' ').trim() || 'Published eBook';
  }

  let author = 'Unknown Author';
  const dcCreator = opfDoc.getElementsByTagName('dc:creator')[0] || opfDoc.getElementsByTagName('creator')[0];
  if (dcCreator && dcCreator.textContent) {
    author = dcCreator.textContent.trim();
  }

  let publisher = '';
  const dcPublisher = opfDoc.getElementsByTagName('dc:publisher')[0] || opfDoc.getElementsByTagName('publisher')[0];
  if (dcPublisher && dcPublisher.textContent) {
    publisher = dcPublisher.textContent.trim();
  }

  let identifier = '';
  const dcId = opfDoc.getElementsByTagName('dc:identifier')[0] || opfDoc.getElementsByTagName('identifier')[0];
  if (dcId && dcId.textContent) {
    identifier = dcId.textContent.trim();
  }
  if (!identifier) {
    identifier = `epub_${bookTitle.replace(/\s+/g, '_')}`;
  }

  // 3. Extract all image assets into base64 data URLs
  const imageMap = new Map();
  let coverDataUrl = null;
  let coverManifestId = null;

  // Check meta tag for cover
  const metaTags = opfDoc.getElementsByTagName('meta');
  for (let i = 0; i < metaTags.length; i++) {
    const m = metaTags[i];
    if (m.getAttribute('name') === 'cover') {
      coverManifestId = m.getAttribute('content');
      break;
    }
  }

  const manifestItems = opfDoc.getElementsByTagName('item');
  const manifestMap = new Map();

  for (let i = 0; i < manifestItems.length; i++) {
    const it = manifestItems[i];
    const id = it.getAttribute('id');
    const href = it.getAttribute('href');
    const mediaType = (it.getAttribute('media-type') || '').toLowerCase();
    const properties = it.getAttribute('properties') || '';

    if (id && href) {
      const fullPath = resolveZipPath(opfDir, href);
      manifestMap.set(id, { id, href, fullPath, mediaType, properties });

      if (properties.includes('cover-image') || id === 'cover-image' || id === 'cover' || id === coverManifestId) {
        coverManifestId = id;
      }
    }
  }

  // Load all images in zip
  const allZipKeys = Object.keys(zip.files);
  for (const zipKey of allZipKeys) {
    if (/\.(jpe?g|png|gif|svg|webp|bmp|ico)$/i.test(zipKey)) {
      try {
        const fileEntry = zip.file(zipKey);
        if (fileEntry) {
          const base64 = await fileEntry.async("base64");
          let mime = 'image/jpeg';
          if (/\.png$/i.test(zipKey)) mime = 'image/png';
          else if (/\.svg$/i.test(zipKey)) mime = 'image/svg+xml';
          else if (/\.gif$/i.test(zipKey)) mime = 'image/gif';
          else if (/\.webp$/i.test(zipKey)) mime = 'image/webp';

          const dataUrl = `data:${mime};base64,${base64}`;
          imageMap.set(normalizeZipPath(zipKey), dataUrl);

          // Check if this is the cover
          if (!coverDataUrl && (coverManifestId && manifestMap.has(coverManifestId) && manifestMap.get(coverManifestId).fullPath === normalizeZipPath(zipKey))) {
            coverDataUrl = dataUrl;
          } else if (!coverDataUrl && /cover\.(jpe?g|png|webp|svg)$/i.test(zipKey)) {
            coverDataUrl = dataUrl;
          }
        }
      } catch (err) {
        console.warn("Could not load image entry:", zipKey, err);
      }
    }
  }

  // 4. Extract all CSS stylesheets into map and rewrite relative image URLs
  const cssMap = new Map();
  for (const zipKey of allZipKeys) {
    if (/\.css$/i.test(zipKey)) {
      try {
        const fileEntry = zip.file(zipKey);
        if (fileEntry) {
          let cssText = await fileEntry.async("text");
          const cssDir = zipKey.includes('/') ? zipKey.substring(0, zipKey.lastIndexOf('/') + 1) : '';

          // Rewrite url(...) inside CSS to base64 images if found
          cssText = cssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, relUrl) => {
            if (relUrl.startsWith('data:') || relUrl.startsWith('http')) return match;
            const resolvedImg = resolveZipPath(cssDir, relUrl);
            if (imageMap.has(resolvedImg)) {
              return `url("${imageMap.get(resolvedImg)}")`;
            }
            return match;
          });

          cssMap.set(normalizeZipPath(zipKey), cssText);
        }
      } catch (err) {
        console.warn("Could not load CSS entry:", zipKey, err);
      }
    }
  }

  // Helper to scope CSS to #ereader-content-container
  function scopeCss(rawCss) {
    if (!rawCss) return '';
    try {
      // Remove @import, @charset, and comments
      let cleaned = rawCss
        .replace(/@charset[^;]+;/gi, '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      // Scope body, html, :root rules
      cleaned = cleaned.replace(/(?:^|\})\s*(?:html|body|:root)\s*\{/gi, '} #ereader-content-container {');

      // Prefix other rules
      const rules = cleaned.split('}');
      const scopedRules = [];

      for (let rule of rules) {
        rule = rule.trim();
        if (!rule) continue;

        if (rule.includes('{')) {
          const parts = rule.split('{');
          const selector = parts[0].trim();
          const body = parts.slice(1).join('{').trim();

          if (selector.startsWith('@keyframes') || selector.startsWith('@font-face') || selector.startsWith('@media')) {
            scopedRules.push(`${selector} { ${body} }`);
          } else {
            const selectors = selector.split(',').map(s => {
              s = s.trim();
              if (!s) return '';
              if (s.startsWith('#ereader-content-container')) return s;
              return `#ereader-content-container ${s}`;
            }).filter(Boolean);

            if (selectors.length > 0) {
              scopedRules.push(`${selectors.join(', ')} { ${body} }`);
            }
          }
        }
      }
      return scopedRules.join('\n');
    } catch (e) {
      return rawCss;
    }
  }

  // 5. Extract Table of Contents
  const toc = [];

  // Try EPUB 3 Navigation Document
  let navItem = Array.from(manifestMap.values()).find(it => it.properties.includes('nav'));
  if (navItem && zip.file(navItem.fullPath)) {
    try {
      const navText = await zip.file(navItem.fullPath).async("text");
      const navDoc = parser.parseFromString(navText, "text/html");
      const navTocEl = navDoc.querySelector('nav[epub\\:type="toc"], nav#toc, nav');
      if (navTocEl) {
        const navDir = navItem.fullPath.includes('/') ? navItem.fullPath.substring(0, navItem.fullPath.lastIndexOf('/') + 1) : '';
        const links = navTocEl.querySelectorAll('a');
        links.forEach(a => {
          const title = a.textContent.trim();
          const href = a.getAttribute('href');
          if (title && href) {
            const targetPath = resolveZipPath(navDir, href.split('#')[0]);
            const anchor = href.includes('#') ? href.split('#')[1] : '';
            toc.push({
              title: title,
              path: targetPath,
              anchor: anchor,
              level: a.closest('ol, ul')?.parentElement?.tagName === 'LI' ? 1 : 0
            });
          }
        });
      }
    } catch (e) {
      console.warn("Could not parse EPUB 3 nav document:", e);
    }
  }

  // Fallback: Try EPUB 2 NCX
  if (toc.length === 0) {
    let ncxItem = Array.from(manifestMap.values()).find(it => it.mediaType === 'application/x-dtbncx+xml' || it.fullPath.endsWith('.ncx'));
    if (!ncxItem) {
      const allFiles = Object.keys(zip.files);
      const ncxPath = allFiles.find(f => /\.ncx$/i.test(f));
      if (ncxPath) ncxItem = { fullPath: ncxPath };
    }

    if (ncxItem && zip.file(ncxItem.fullPath)) {
      try {
        const ncxText = await zip.file(ncxItem.fullPath).async("text");
        const ncxDoc = parser.parseFromString(ncxText, "application/xml");
        const ncxDir = ncxItem.fullPath.includes('/') ? ncxItem.fullPath.substring(0, ncxItem.fullPath.lastIndexOf('/') + 1) : '';
        const navPoints = ncxDoc.querySelectorAll('navPoint');

        navPoints.forEach(np => {
          const textEl = np.querySelector('navLabel > text');
          const contentEl = np.querySelector('content');
          if (textEl && contentEl) {
            const title = textEl.textContent.trim();
            const src = contentEl.getAttribute('src');
            if (title && src) {
              const targetPath = resolveZipPath(ncxDir, src.split('#')[0]);
              const anchor = src.includes('#') ? src.split('#')[1] : '';
              toc.push({
                title: title,
                path: targetPath,
                anchor: anchor,
                level: np.parentElement?.tagName === 'navPoint' ? 1 : 0
              });
            }
          }
        });
      } catch (e) {
        console.warn("Could not parse NCX document:", e);
      }
    }
  }

  // 6. Extract Chapters via Spine
  const spineItemRefs = opfDoc.getElementsByTagName('itemref');
  const chapterPaths = [];

  for (let i = 0; i < spineItemRefs.length; i++) {
    const idref = spineItemRefs[i].getAttribute('idref');
    const mItem = manifestMap.get(idref);
    if (mItem) {
      if (mItem.mediaType.includes('html') || mItem.mediaType.includes('xml') || /\.(xhtml|html|htm)$/i.test(mItem.fullPath)) {
        chapterPaths.push(mItem.fullPath);
      }
    }
  }

  if (chapterPaths.length === 0) {
    manifestMap.forEach(mItem => {
      if (mItem.mediaType.includes('html') || /\.(xhtml|html|htm)$/i.test(mItem.fullPath)) {
        chapterPaths.push(mItem.fullPath);
      }
    });
  }

  if (chapterPaths.length === 0) {
    throw new Error("No readable XHTML or HTML chapters found in the EPUB file.");
  }

  // 7. Parse and Build Chapters
  const chapters = [];
  let totalBookWords = 0;

  for (let cIdx = 0; cIdx < chapterPaths.length; cIdx++) {
    const cPath = chapterPaths[cIdx];
    const cEntry = zip.file(cPath);
    if (!cEntry) continue;

    const cText = await cEntry.async("text");
    const cDoc = parser.parseFromString(cText, "text/html");
    const cDir = cPath.includes('/') ? cPath.substring(0, cPath.lastIndexOf('/') + 1) : '';

    // Extract Title
    let chapterTitle = '';
    const matchingToc = toc.find(t => t.path === cPath);
    if (matchingToc) {
      chapterTitle = matchingToc.title;
    } else {
      const hEl = cDoc.querySelector('h1, h2, h3');
      if (hEl && hEl.textContent.trim()) {
        chapterTitle = hEl.textContent.trim().replace(/\s+/g, ' ');
      } else {
        const docTitle = cDoc.querySelector('title');
        if (docTitle && docTitle.textContent.trim()) {
          chapterTitle = docTitle.textContent.trim().replace(/\s+/g, ' ');
        }
      }
    }

    if (!chapterTitle) {
      chapterTitle = `Section ${cIdx + 1}`;
    }

    // Collect Publisher CSS
    let combinedCss = '';

    // Linked stylesheets
    const linkEls = cDoc.querySelectorAll('link[rel="stylesheet"]');
    linkEls.forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const fullCssPath = resolveZipPath(cDir, href);
        if (cssMap.has(fullCssPath)) {
          combinedCss += '\n' + cssMap.get(fullCssPath);
        }
      }
      link.remove();
    });

    // Inline <style> tags
    const styleEls = cDoc.querySelectorAll('style');
    styleEls.forEach(st => {
      combinedCss += '\n' + st.textContent;
      st.remove();
    });

    // Remove scripts for safety
    cDoc.querySelectorAll('script').forEach(s => s.remove());

    // Resolve Image sources to data URLs
    const imgEls = cDoc.querySelectorAll('img, image');
    imgEls.forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href');
      if (src && !src.startsWith('data:')) {
        const fullImgPath = resolveZipPath(cDir, src);
        if (imageMap.has(fullImgPath)) {
          const resolvedDataUrl = imageMap.get(fullImgPath);
          if (img.tagName.toLowerCase() === 'image') {
            img.setAttribute('xlink:href', resolvedDataUrl);
            img.setAttribute('href', resolvedDataUrl);
          } else {
            img.setAttribute('src', resolvedDataUrl);
          }
          // Check if cover
          if (!coverDataUrl && (src.includes('cover') || cIdx === 0)) {
            coverDataUrl = resolvedDataUrl;
          }
        }
      }
    });

    // Resolve inline style background images
    const elementsWithStyle = cDoc.querySelectorAll('[style*="url("]');
    elementsWithStyle.forEach(el => {
      let st = el.getAttribute('style') || '';
      st = st.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, relUrl) => {
        if (relUrl.startsWith('data:') || relUrl.startsWith('http')) return match;
        const resolvedImg = resolveZipPath(cDir, relUrl);
        if (imageMap.has(resolvedImg)) {
          return `url("${imageMap.get(resolvedImg)}")`;
        }
        return match;
      });
      el.setAttribute('style', st);
    });

    // Resolve internal anchor links
    const anchorEls = cDoc.querySelectorAll('a[href]');
    anchorEls.forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
        if (href.startsWith('#')) {
          a.setAttribute('data-ereader-anchor', href.slice(1));
          a.removeAttribute('href');
        } else {
          const targetPath = resolveZipPath(cDir, href.split('#')[0]);
          const targetAnchor = href.includes('#') ? href.split('#')[1] : '';
          a.setAttribute('data-ereader-target-path', targetPath);
          if (targetAnchor) a.setAttribute('data-ereader-anchor', targetAnchor);
          a.removeAttribute('href');
        }
      }
    });

    const bodyHtml = cDoc.body ? cDoc.body.innerHTML : cDoc.documentElement.innerHTML;
    const wordCount = (cDoc.body ? cDoc.body.textContent : '').split(/\s+/).filter(Boolean).length;
    totalBookWords += wordCount;

    chapters.push({
      index: chapters.length,
      path: cPath,
      title: chapterTitle,
      contentHtml: bodyHtml,
      publisherCss: scopeCss(combinedCss),
      wordCount: wordCount
    });
  }

  // Link TOC items to actual chapter index
  toc.forEach(item => {
    const chIdx = chapters.findIndex(c => c.path === item.path);
    item.targetChapterIndex = chIdx >= 0 ? chIdx : 0;
  });

  return {
    bookTitle: bookTitle,
    author: author,
    publisher: publisher,
    identifier: identifier,
    coverDataUrl: coverDataUrl,
    chapters: chapters,
    toc: toc,
    totalWords: totalBookWords
  };
}

// ─── OPEN & RENDER E-READER ──────────────────────────────────

async function openEpubInReader(arrayBuffer, filename) {
  try {
    showToast("Parsing book layout & publisher styles...");
    if (DOM.ereaderLoading) DOM.ereaderLoading.classList.remove('hidden');

    const bookData = await parseEpubForReader(arrayBuffer, filename);

    ereaderState.isOpen = true;
    ereaderState.isPublishedEpub = true;
    ereaderState.bookId = bookData.identifier;
    ereaderState.bookTitle = bookData.bookTitle;
    ereaderState.author = bookData.author;
    ereaderState.publisher = bookData.publisher;
    ereaderState.coverDataUrl = bookData.coverDataUrl;
    ereaderState.chapters = bookData.chapters;
    ereaderState.toc = bookData.toc;
    ereaderState.currentChapterIndex = 0;

    // Load saved bookmarks and position
    loadEreaderStorage();

    // Show Overlay
    if (DOM.ereaderOverlay) {
      DOM.ereaderOverlay.classList.remove('hidden');
    }

    // Close any other open modals
    closeOverlay();
    if (DOM.epubChoiceModal) DOM.epubChoiceModal.classList.add('hidden');
    if (DOM.driveModal) DOM.driveModal.classList.add('hidden');

    // Populate TOC Drawer
    renderEreaderTocList();
    renderEreaderBookmarksList();

    // Render Initial Chapter
    renderEreaderChapter(ereaderState.currentChapterIndex);

    showToast(`📖 "${bookData.bookTitle}" loaded in E-Reader`);
    playCarriageReturnBell();
  } catch (err) {
    console.error("Failed to open EPUB in E-Reader:", err);
    alert(`Could not open book in E-Reader: ${err.message || 'Invalid EPUB format.'}`);
    if (DOM.ereaderOverlay) DOM.ereaderOverlay.classList.add('hidden');
  } finally {
    if (DOM.ereaderLoading) DOM.ereaderLoading.classList.add('hidden');
  }
}

function openCurrentDraftInReader() {
  const book = getActiveBook();
  if (!book || !book.pages || book.pages.length === 0) {
    showToast("No active manuscript pages to read.");
    return;
  }

  const chapters = [];
  const toc = [];
  let totalWords = 0;

  book.pages.forEach((page, idx) => {
    const pageText = (page.chunks || []).map(c => c.text).join('\n\n');
    const pageWords = pageText.split(/\s+/).filter(Boolean).length;
    totalWords += pageWords;

    const title = page.description ? `Page ${page.number}: ${page.description}` : `Page ${page.number}`;

    const paragraphsHtml = (page.chunks || []).map(c => {
      const sanitized = escapeHtml(c.text || '').replace(/\n/g, '<br>');
      return `<p style="margin-bottom: 1.2em; line-height: 1.7;">${sanitized}</p>`;
    }).join('');

    const chapterHtml = `
      <div class="ereader-draft-page">
        <h2 style="text-align: center; margin-bottom: 1.5em; font-size: 1.4em; border-bottom: 1px solid rgba(128,128,128,0.2); padding-bottom: 0.5em;">
          ${escapeHtml(title)}
        </h2>
        <div class="ereader-draft-body">
          ${paragraphsHtml || '<p style="color:#888; font-style:italic;">[Blank page]</p>'}
        </div>
      </div>
    `;

    chapters.push({
      index: idx,
      path: `page_${page.id}`,
      title: title,
      contentHtml: chapterHtml,
      publisherCss: '',
      wordCount: pageWords
    });

    toc.push({
      title: title,
      path: `page_${page.id}`,
      anchor: '',
      targetChapterIndex: idx,
      level: 0
    });
  });

  ereaderState.isOpen = true;
  ereaderState.isPublishedEpub = false;
  ereaderState.bookId = `draft_${book.id}`;
  ereaderState.bookTitle = book.title || 'Untitled Manuscript';
  ereaderState.author = 'Studio Draft';
  ereaderState.publisher = 'Typewriter Studio';
  ereaderState.coverDataUrl = null;
  ereaderState.chapters = chapters;
  ereaderState.toc = toc;
  ereaderState.currentChapterIndex = 0;

  // Open overlay
  if (DOM.ereaderOverlay) {
    DOM.ereaderOverlay.classList.remove('hidden');
  }

  closeOverlay();
  renderEreaderTocList();
  renderEreaderBookmarksList();
  renderEreaderChapter(0);
  showToast(`📖 Reading "${ereaderState.bookTitle}" in E-Reader`);
}

function closeEreader() {
  ereaderState.isOpen = false;
  if (DOM.ereaderOverlay) {
    DOM.ereaderOverlay.classList.add('hidden');
  }
  if (DOM.ereaderSidebar) {
    DOM.ereaderSidebar.classList.add('hidden');
  }
  if (DOM.ereaderStylePopover) {
    DOM.ereaderStylePopover.classList.add('hidden');
  }
  if (DOM.ereaderSearchBar) {
    DOM.ereaderSearchBar.classList.add('hidden');
  }
  if (document.fullscreenElement) {
    try { document.exitFullscreen(); } catch (e) {}
  }
  saveEreaderStorage();
}

function renderEreaderChapter(chapterIndex, targetAnchor = null) {
  if (!ereaderState.chapters || ereaderState.chapters.length === 0) return;

  if (chapterIndex < 0) chapterIndex = 0;
  if (chapterIndex >= ereaderState.chapters.length) chapterIndex = ereaderState.chapters.length - 1;

  ereaderState.currentChapterIndex = chapterIndex;
  const chapter = ereaderState.chapters[chapterIndex];

  // Header titles
  if (DOM.ereaderBookTitle) DOM.ereaderBookTitle.textContent = ereaderState.bookTitle;
  if (DOM.ereaderChapterTitle) DOM.ereaderChapterTitle.textContent = chapter.title;

  // Footer stats & progress
  const totalChapters = ereaderState.chapters.length;
  const progressPct = Math.round(((chapterIndex + 1) / totalChapters) * 100);

  if (DOM.ereaderProgressFill) {
    DOM.ereaderProgressFill.style.width = `${progressPct}%`;
  }
  if (DOM.ereaderChapterIndexLabel) {
    DOM.ereaderChapterIndexLabel.textContent = `Chapter ${chapterIndex + 1} of ${totalChapters}`;
  }
  if (DOM.ereaderBookProgressPct) {
    DOM.ereaderBookProgressPct.textContent = `${progressPct}% read`;
  }
  if (DOM.ereaderChapterWordCount) {
    DOM.ereaderChapterWordCount.textContent = `${chapter.wordCount.toLocaleString()} words`;
  }

  // Reading time estimate (220 words/min average)
  const remainingWords = ereaderState.chapters.slice(chapterIndex).reduce((acc, c) => acc + c.wordCount, 0);
  const minutesLeft = Math.max(1, Math.round(remainingWords / 220));
  if (DOM.ereaderReadingTimeEst) {
    DOM.ereaderReadingTimeEst.textContent = `~${minutesLeft} min left in book`;
  }

  // Inject content and scoped CSS
  if (DOM.ereaderContentContainer) {
    let html = '';
    if (ereaderState.settings.usePublisherDefaults && chapter.publisherCss) {
      html += `<style id="ereader-scoped-publisher-styles">${chapter.publisherCss}</style>`;
    }
    html += chapter.contentHtml;
    DOM.ereaderContentContainer.innerHTML = html;

    // Attach click handlers to internal book links
    const internalLinks = DOM.ereaderContentContainer.querySelectorAll('[data-ereader-target-path], [data-ereader-anchor]');
    internalLinks.forEach(link => {
      link.style.cursor = 'pointer';
      link.onclick = (e) => {
        e.preventDefault();
        const targetPath = link.getAttribute('data-ereader-target-path');
        const anchor = link.getAttribute('data-ereader-anchor');

        if (targetPath) {
          const chIdx = ereaderState.chapters.findIndex(c => c.path === targetPath);
          if (chIdx >= 0) {
            renderEreaderChapter(chIdx, anchor);
            return;
          }
        }
        if (anchor) {
          scrollToEreaderAnchor(anchor);
        }
      };
    });
  }

  // Apply Appearance & Typography
  applyEreaderStyles();

  // Highlight active TOC item
  const tocItems = document.querySelectorAll('.ereader-toc-item');
  tocItems.forEach(item => {
    const targetIdx = parseInt(item.getAttribute('data-chapter-index'), 10);
    item.classList.toggle('active', targetIdx === chapterIndex);
  });

  // Scroll to top or anchor
  requestAnimationFrame(() => {
    if (targetAnchor) {
      scrollToEreaderAnchor(targetAnchor);
    } else if (DOM.ereaderViewportWrapper) {
      DOM.ereaderViewportWrapper.scrollTo({ top: 0, behavior: 'auto' });
    }
  });

  saveEreaderStorage();
}

function scrollToEreaderAnchor(anchorId) {
  if (!anchorId || !DOM.ereaderContentContainer) return;
  const targetEl = DOM.ereaderContentContainer.querySelector(`#${anchorId}, [name="${anchorId}"]`);
  if (targetEl && DOM.ereaderViewportWrapper) {
    const targetOffset = targetEl.offsetTop - 30;
    DOM.ereaderViewportWrapper.scrollTo({ top: targetOffset, behavior: 'smooth' });
  }
}

function applyEreaderStyles() {
  const s = ereaderState.settings;

  // Stage Theme
  if (DOM.ereaderStage) {
    DOM.ereaderStage.className = `ereader-stage theme-${s.theme}`;
  }

  // Viewport Typography & Container
  if (DOM.ereaderViewport) {
    DOM.ereaderViewport.className = `ereader-viewport font-${s.fontFamily} ${s.twoPageSpread ? 'two-page-spread' : ''}`;
    DOM.ereaderViewport.style.maxWidth = `${s.pageWidth}px`;
    DOM.ereaderViewport.style.fontSize = `${s.fontSize}px`;
    DOM.ereaderViewport.style.lineHeight = `${s.lineHeight}`;
    DOM.ereaderViewport.style.textAlign = s.textAlign;
  }

  // Publisher switch state
  if (DOM.ereaderOptPublisherDefaults) {
    DOM.ereaderOptPublisherDefaults.checked = s.usePublisherDefaults;
  }
  if (DOM.ereaderCustomStylesSection) {
    DOM.ereaderCustomStylesSection.classList.toggle('disabled', s.usePublisherDefaults);
  }

  // Stepper & chips UI active states
  if (DOM.ereaderFontSizeVal) {
    DOM.ereaderFontSizeVal.textContent = `${s.fontSize}px`;
  }

  document.querySelectorAll('.ereader-theme-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-rtheme') === s.theme);
  });
  document.querySelectorAll('.ereader-font-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-rfont') === s.fontFamily);
  });
  document.querySelectorAll('.ereader-line-chip').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.getAttribute('data-rline')) === s.lineHeight);
  });
  document.querySelectorAll('.ereader-align-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-ralign') === s.textAlign);
  });
  document.querySelectorAll('.ereader-width-chip').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.getAttribute('data-rwidth'), 10) === s.pageWidth);
  });
  if (DOM.ereaderOptTwoPage) {
    DOM.ereaderOptTwoPage.checked = s.twoPageSpread;
  }
}

function renderEreaderTocList() {
  if (!DOM.ereaderTocList) return;
  DOM.ereaderTocList.innerHTML = '';

  // Book meta card
  if (DOM.ereaderMetaTitle) DOM.ereaderMetaTitle.textContent = ereaderState.bookTitle;
  if (DOM.ereaderMetaAuthor) DOM.ereaderMetaAuthor.textContent = ereaderState.author || 'Author';
  if (DOM.ereaderMetaStats) {
    const totalWords = ereaderState.chapters.reduce((acc, c) => acc + c.wordCount, 0);
    DOM.ereaderMetaStats.textContent = `${ereaderState.chapters.length} chapters • ~${totalWords.toLocaleString()} words`;
  }

  if (DOM.ereaderCoverPreview) {
    if (ereaderState.coverDataUrl) {
      DOM.ereaderCoverPreview.style.backgroundImage = `url("${ereaderState.coverDataUrl}")`;
      DOM.ereaderCoverPreview.classList.remove('hidden');
    } else {
      DOM.ereaderCoverPreview.classList.add('hidden');
    }
  }

  // Populate list
  const listToRender = (ereaderState.toc && ereaderState.toc.length > 0)
    ? ereaderState.toc
    : ereaderState.chapters.map(c => ({ title: c.title, targetChapterIndex: c.index, level: 0, anchor: '' }));

  listToRender.forEach((item) => {
    const li = document.createElement('li');
    li.className = `ereader-toc-item indent-${item.level || 0}`;
    li.setAttribute('data-chapter-index', item.targetChapterIndex);

    li.innerHTML = `
      <span>${escapeHtml(item.title)}</span>
      <span style="font-size:10px; opacity:0.6;">${(item.targetChapterIndex !== undefined ? item.targetChapterIndex + 1 : '')}</span>
    `;

    li.onclick = () => {
      renderEreaderChapter(item.targetChapterIndex, item.anchor);
      if (window.innerWidth <= 768 && DOM.ereaderSidebar) {
        DOM.ereaderSidebar.classList.add('hidden');
      }
    };

    DOM.ereaderTocList.appendChild(li);
  });
}

function renderEreaderBookmarksList() {
  if (!DOM.ereaderBookmarksList) return;
  DOM.ereaderBookmarksList.innerHTML = '';

  if (DOM.ereaderBmCount) {
    DOM.ereaderBmCount.textContent = ereaderState.bookmarks.length;
  }

  if (ereaderState.bookmarks.length === 0) {
    DOM.ereaderBookmarksList.innerHTML = `
      <div style="font-size:12px; color:#888; text-align:center; padding:20px 10px;">
        No bookmarks yet. Tap the button above to bookmark your current chapter!
      </div>
    `;
    return;
  }

  ereaderState.bookmarks.forEach((bm) => {
    const li = document.createElement('li');
    li.className = 'ereader-bookmark-item';

    li.innerHTML = `
      <div class="ereader-bm-left">
        <strong>${escapeHtml(bm.chapterTitle)}</strong>
        <span>${escapeHtml(bm.dateStr)} • ${escapeHtml(bm.snippet || '')}</span>
      </div>
      <button class="btn-remove-bm" title="Delete bookmark">×</button>
    `;

    const left = li.querySelector('.ereader-bm-left');
    if (left) {
      left.onclick = () => {
        renderEreaderChapter(bm.chapterIndex);
        if (window.innerWidth <= 768 && DOM.ereaderSidebar) {
          DOM.ereaderSidebar.classList.add('hidden');
        }
      };
    }

    const delBtn = li.querySelector('.btn-remove-bm');
    if (delBtn) {
      delBtn.onclick = (e) => {
        e.stopPropagation();
        ereaderState.bookmarks = ereaderState.bookmarks.filter(b => b.id !== bm.id);
        saveEreaderStorage();
        renderEreaderBookmarksList();
        showToast("Bookmark removed");
      };
    }

    DOM.ereaderBookmarksList.appendChild(li);
  });
}

function addEreaderBookmark() {
  const ch = ereaderState.chapters[ereaderState.currentChapterIndex];
  if (!ch) return;

  const snippet = (DOM.ereaderContentContainer ? DOM.ereaderContentContainer.textContent.trim().slice(0, 50) + '...' : '');

  const newBm = {
    id: 'bm_' + Date.now(),
    chapterIndex: ereaderState.currentChapterIndex,
    chapterTitle: ch.title,
    dateStr: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    snippet: snippet
  };

  ereaderState.bookmarks.unshift(newBm);
  saveEreaderStorage();
  renderEreaderBookmarksList();
  showToast(`🔖 Bookmark saved for ${ch.title}`);
}

function saveEreaderStorage() {
  if (!ereaderState.bookId) return;
  try {
    const payload = {
      chapterIndex: ereaderState.currentChapterIndex,
      settings: ereaderState.settings,
      bookmarks: ereaderState.bookmarks
    };
    localStorage.setItem(`typewriter_ereader_${ereaderState.bookId}`, JSON.stringify(payload));
  } catch (e) {}
}

function loadEreaderStorage() {
  if (!ereaderState.bookId) return;
  try {
    const raw = localStorage.getItem(`typewriter_ereader_${ereaderState.bookId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.chapterIndex === 'number' && data.chapterIndex < ereaderState.chapters.length) {
        ereaderState.currentChapterIndex = data.chapterIndex;
      }
      if (data.settings) {
        ereaderState.settings = Object.assign(ereaderState.settings, data.settings);
      }
      if (Array.isArray(data.bookmarks)) {
        ereaderState.bookmarks = data.bookmarks;
      }
    }
  } catch (e) {}
}

// ─── EPUB CHOICE MODAL HANDLER ───────────────────────────────

function handleEpubFileChoice(arrayBuffer, filename) {
  pendingEpubData = { arrayBuffer, filename };

  if (DOM.epubChoiceModal) {
    if (DOM.epubChoiceTitle) {
      DOM.epubChoiceTitle.textContent = `Open "${filename}"`;
    }
    DOM.epubChoiceModal.classList.remove('hidden');
  } else {
    // Fallback directly to E-Reader
    openEpubInReader(arrayBuffer, filename);
  }
}

function closeEpubChoiceModal() {
  if (DOM.epubChoiceModal) DOM.epubChoiceModal.classList.add('hidden');
  pendingEpubData = null;
}

// ─── E-READER SEARCH & NAVIGATION ───────────────────────────

function ereaderNextChapter() {
  if (ereaderState.currentChapterIndex < ereaderState.chapters.length - 1) {
    renderEreaderChapter(ereaderState.currentChapterIndex + 1);
  } else {
    showToast("You've reached the end of the book!");
  }
}

function ereaderPrevChapter() {
  if (ereaderState.currentChapterIndex > 0) {
    renderEreaderChapter(ereaderState.currentChapterIndex - 1);
  } else {
    showToast("You are at the beginning of the book.");
  }
}

function toggleEreaderFullscreen() {
  const overlay = DOM.ereaderOverlay;
  if (!overlay) return;

  if (!document.fullscreenElement) {
    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(err => {
        console.warn("Fullscreen request error:", err);
      });
    }
    if (DOM.ereaderFsIcon) DOM.ereaderFsIcon.textContent = '⤓';
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => {});
    }
    if (DOM.ereaderFsIcon) DOM.ereaderFsIcon.textContent = '⤢';
  }
}

function toggleEreaderSidebar(tabName = 'toc') {
  if (!DOM.ereaderSidebar) return;
  const isCurrentlyHidden = DOM.ereaderSidebar.classList.contains('hidden');

  if (isCurrentlyHidden) {
    DOM.ereaderSidebar.classList.remove('hidden');
    switchEreaderSidebarTab(tabName);
  } else {
    // If clicking same tab button while open, toggle close; if different tab, switch tab
    const isTocActive = DOM.ereaderTabToc && DOM.ereaderTabToc.classList.contains('active');
    if ((tabName === 'toc' && isTocActive) || (tabName === 'bm' && !isTocActive)) {
      DOM.ereaderSidebar.classList.add('hidden');
    } else {
      switchEreaderSidebarTab(tabName);
    }
  }
}

function switchEreaderSidebarTab(tabName) {
  if (DOM.ereaderTabToc) {
    DOM.ereaderTabToc.classList.toggle('active', tabName === 'toc');
  }
  if (DOM.ereaderTabBm) {
    DOM.ereaderTabBm.classList.toggle('active', tabName === 'bm');
  }
  if (DOM.ereaderSidebarTocPanel) {
    DOM.ereaderSidebarTocPanel.classList.toggle('active', tabName === 'toc');
  }
  if (DOM.ereaderSidebarBmPanel) {
    DOM.ereaderSidebarBmPanel.classList.toggle('active', tabName === 'bm');
  }
}

function toggleEreaderStylePopover() {
  if (!DOM.ereaderStylePopover) return;
  DOM.ereaderStylePopover.classList.toggle('hidden');
}

function toggleEreaderSearchBar() {
  if (!DOM.ereaderSearchBar) return;
  const isHidden = DOM.ereaderSearchBar.classList.toggle('hidden');
  if (!isHidden && DOM.ereaderSearchInput) {
    DOM.ereaderSearchInput.focus();
    DOM.ereaderSearchInput.select();
  } else {
    clearEreaderSearch();
  }
}

function performEreaderSearch(query) {
  query = (query || '').trim();
  ereaderState.search.query = query;
  ereaderState.search.matches = [];
  ereaderState.search.currentMatchIndex = 0;

  if (!query) {
    if (DOM.ereaderSearchCount) DOM.ereaderSearchCount.textContent = '0 matches';
    removeEreaderHighlights();
    return;
  }

  const queryRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = [];

  ereaderState.chapters.forEach((ch, chIdx) => {
    const text = ch.contentHtml.replace(/<[^>]+>/g, ' ');
    let m;
    while ((m = queryRegex.exec(text)) !== null) {
      matches.push({
        chapterIndex: chIdx,
        chapterTitle: ch.title,
        textIndex: m.index
      });
    }
  });

  ereaderState.search.matches = matches;

  if (DOM.ereaderSearchCount) {
    DOM.ereaderSearchCount.textContent = matches.length === 1 ? '1 match' : `${matches.length} matches`;
  }

  if (matches.length > 0) {
    highlightAndScrollToMatch(0);
  } else {
    showToast(`No matches found for "${query}"`);
  }
}

function highlightAndScrollToMatch(matchIdx) {
  const matches = ereaderState.search.matches;
  if (!matches || matches.length === 0) return;

  if (matchIdx < 0) matchIdx = matches.length - 1;
  if (matchIdx >= matches.length) matchIdx = 0;

  ereaderState.search.currentMatchIndex = matchIdx;
  const currentMatch = matches[matchIdx];

  if (DOM.ereaderSearchCount) {
    DOM.ereaderSearchCount.textContent = `${matchIdx + 1} of ${matches.length}`;
  }

  if (currentMatch.chapterIndex !== ereaderState.currentChapterIndex) {
    renderEreaderChapter(currentMatch.chapterIndex);
  }

  // Highlight search word in current chapter
  highlightEreaderKeyword(ereaderState.search.query);
}

function highlightEreaderKeyword(keyword) {
  if (!DOM.ereaderContentContainer || !keyword) return;
  removeEreaderHighlights();

  const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

  function walk(node) {
    if (node.nodeType === 3) {
      const match = node.data.match(regex);
      if (match) {
        const span = document.createElement('span');
        span.innerHTML = node.data.replace(regex, '<mark class="ereader-search-highlight">$1</mark>');
        node.parentNode.replaceChild(span, node);
      }
    } else if (node.nodeType === 1 && node.nodeName !== 'SCRIPT' && node.nodeName !== 'STYLE' && node.nodeName !== 'MARK') {
      Array.from(node.childNodes).forEach(walk);
    }
  }

  walk(DOM.ereaderContentContainer);

  const firstHighlight = DOM.ereaderContentContainer.querySelector('.ereader-search-highlight');
  if (firstHighlight && DOM.ereaderViewportWrapper) {
    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function removeEreaderHighlights() {
  if (!DOM.ereaderContentContainer) return;
  const marks = DOM.ereaderContentContainer.querySelectorAll('mark.ereader-search-highlight');
  marks.forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
  });
}

function clearEreaderSearch() {
  ereaderState.search.query = '';
  ereaderState.search.matches = [];
  ereaderState.search.currentMatchIndex = 0;
  if (DOM.ereaderSearchInput) DOM.ereaderSearchInput.value = '';
  if (DOM.ereaderSearchCount) DOM.ereaderSearchCount.textContent = '0 matches';
  removeEreaderHighlights();
}



async function exportManuscriptEPUB() {
  const book = getActiveBook();
  if (!book) {
    showToast("No active manuscript to export.");
    return;
  }

  if (typeof JSZip === 'undefined') {
    showToast("EPUB generator is initializing, please try again in a moment.");
    return;
  }

  try {
    const zip = new JSZip();

    // 1. mimetype MUST be uncompressed first entry in archive
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    zip.file('META-INF/container.xml', containerXml);

    // 3. OEBPS/style.css
    const styleCss = `@charset "utf-8";
body {
  font-family: "Courier Prime", "Courier New", Courier, monospace, serif;
  margin: 5% 8%;
  line-height: 1.7;
  color: #1a1a1a;
  background-color: #faf9f5;
}
.title-page {
  text-align: center;
  margin-top: 25%;
}
h1.book-title {
  font-size: 2.2em;
  letter-spacing: 0.05em;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 0.4em;
}
p.book-subtitle {
  font-size: 1em;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 2em;
}
.meta-stats {
  font-size: 0.9em;
  color: #888;
  margin-top: 3em;
}
.chapter-container {
  page-break-before: always;
  margin-top: 2em;
}
h2.chapter-title {
  font-size: 1.4em;
  letter-spacing: 0.05em;
  font-weight: 700;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.4em;
  margin-bottom: 0.4em;
}
p.chapter-desc {
  font-size: 0.95em;
  font-style: italic;
  color: #555;
  margin-bottom: 1.8em;
}
p.manuscript-para {
  margin-top: 0;
  margin-bottom: 1.2em;
  text-align: justify;
  text-indent: 1.5em;
}
p.manuscript-para.first {
  text-indent: 0;
}`;
    zip.file('OEBPS/style.css', styleCss);

    let totalWords = 0;
    book.pages.forEach(p => {
      totalWords += getPageWordCount(p);
    });

    const bookUuid = 'urn:uuid:' + (book.id || 'book_' + Date.now()).replace(/[^a-zA-Z0-9-]/g, '-');
    const bookTitle = book.title || 'Untitled Manuscript';
    const nowIso = new Date().toISOString();

    // 4. Title Page
    const titlePageXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${xmlEscape(bookTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="title-page">
    <h1 class="book-title">${xmlEscape(bookTitle)}</h1>
    <p class="book-subtitle">A Typewriter Manuscript</p>
    <div class="meta-stats">
      <p>${book.pages.length} Pages • ${totalWords.toLocaleString()} Words</p>
      <p>Drafted with Typewriter Studio</p>
    </div>
  </div>
</body>
</html>`;
    zip.file('OEBPS/titlepage.xhtml', titlePageXhtml);

    // 5. Individual Pages as Chapters
    const manifestItems = [];
    const spineItems = [];
    const navItems = [];
    const ncxNavPoints = [];

    // Title page references
    manifestItems.push('<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>');
    spineItems.push('<itemref idref="titlepage"/>');
    navItems.push('<li><a href="titlepage.xhtml">Title Page</a></li>');
    ncxNavPoints.push(`
    <navPoint id="nav-title" playOrder="1">
      <navLabel><text>Title Page</text></navLabel>
      <content src="titlepage.xhtml"/>
    </navPoint>`);

    book.pages.forEach((page, idx) => {
      const pageNum = page.number || (idx + 1);
      const pageFile = `page_${pageNum}.xhtml`;
      const pageId = `page-${pageNum}`;
      const pageTitle = `Page ${pageNum}${page.description ? ': ' + page.description : ''}`;

      let rawParagraphs = [];
      if (Array.isArray(page.chunks) && page.chunks.length > 0) {
        page.chunks.forEach(c => {
          const t = (typeof c === 'string' ? c : (c.text || '')).trim();
          if (t) {
            const sub = t.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
            if (sub.length > 0) rawParagraphs.push(...sub);
            else rawParagraphs.push(t);
          }
        });
      } else if (page.text && page.text.trim()) {
        rawParagraphs = page.text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      }

      if (rawParagraphs.length === 0) {
        rawParagraphs = ['(Blank page)'];
      }

      const parasHtml = rawParagraphs.map((pText, pIdx) => {
        const cls = pIdx === 0 ? 'manuscript-para first' : 'manuscript-para';
        const formatted = xmlEscape(pText).replace(/\n/g, '<br/>');
        return `<p class="${cls}">${formatted}</p>`;
      }).join('\n    ');

      const descHtml = page.description
        ? `<p class="chapter-desc">${xmlEscape(page.description)}</p>`
        : '';

      const pageXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${xmlEscape(pageTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="chapter" class="chapter-container">
    <h2 class="chapter-title">PAGE ${pageNum}${page.description ? ' — ' + xmlEscape(page.description) : ''}</h2>
    ${descHtml}
    ${parasHtml}
  </section>
</body>
</html>`;

      zip.file(`OEBPS/${pageFile}`, pageXhtml);

      manifestItems.push(`<item id="${pageId}" href="${pageFile}" media-type="application/xhtml+xml"/>`);
      spineItems.push(`<itemref idref="${pageId}"/>`);
      navItems.push(`<li><a href="${pageFile}">${xmlEscape(pageTitle)}</a></li>`);
      ncxNavPoints.push(`
    <navPoint id="nav-p${pageNum}" playOrder="${idx + 2}">
      <navLabel><text>${xmlEscape(pageTitle)}</text></navLabel>
      <content src="${pageFile}"/>
    </navPoint>`);
    });

    // 6. EPUB 3 Navigation Document (OEBPS/nav.xhtml)
    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
    zip.file('OEBPS/nav.xhtml', navXhtml);

    // 7. EPUB 2 NCX Document (OEBPS/toc.ncx)
    const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookUuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="${book.pages.length}"/>
    <meta name="dtb:maxPageNumber" content="${book.pages.length}"/>
  </head>
  <docTitle><text>${xmlEscape(bookTitle)}</text></docTitle>
  <navMap>
    ${ncxNavPoints.join('')}
  </navMap>
</ncx>`;
    zip.file('OEBPS/toc.ncx', tocNcx);

    // 8. OEBPS/content.opf
    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${bookUuid}</dc:identifier>
    <dc:title>${xmlEscape(bookTitle)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>Typewriter Author</dc:creator>
    <dc:date>${nowIso.slice(0, 10)}</dc:date>
    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
    zip.file('OEBPS/content.opf', contentOpf);

    // 9. Generate and download EPUB blob
    const epubBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    const cleanTitle = bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${cleanTitle}_${nowIso.slice(0, 10)}.epub`;

    triggerFileDownload(filename, epubBlob, 'application/epub+zip');
    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    showToast(`Exported EPUB eBook "${filename}"!`);
    playCarriageReturnBell();
  } catch (err) {
    console.error("EPUB export error:", err);
    showToast(`EPUB export failed: ${err.message || 'Unknown error'}`);
  }
}

function importSingleManuscriptFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const isEpub = /\.epub$/i.test(file.name) || (file.type && file.type.includes('epub'));

  if (isEpub) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        handleEpubFileChoice(e.target.result, file.name);
      } catch (err) {
        console.error("EPUB import error:", err);
        alert(`Could not open EPUB: ${err.message || 'Invalid or unrecognized EPUB format.'}`);
      }
      if (DOM.fileInputImportManuscript) {
        DOM.fileInputImportManuscript.value = '';
      }
      if (DOM.fileInputEpubReader) {
        DOM.fileInputEpubReader.value = '';
      }
    };
    reader.onerror = () => {
      alert("Error reading file.");
      if (DOM.fileInputImportManuscript) DOM.fileInputImportManuscript.value = '';
      if (DOM.fileInputEpubReader) DOM.fileInputEpubReader.value = '';
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const result = parseManuscriptFile(e.target.result, file.name);
      if (result.type === 'single') {
        addSingleManuscriptToSession(result.book, file.name);
      } else if (result.type === 'multiple') {
        showImportManuscriptPicker(result.books, file.name);
      }
    } catch (err) {
      console.error("Import manuscript error:", err);
      alert(`Could not import manuscript: ${err.message || 'Invalid or unrecognized file format.'}`);
    }
    if (DOM.fileInputImportManuscript) {
      DOM.fileInputImportManuscript.value = '';
    }
  };
  reader.readAsText(file);
}

function showImportManuscriptPicker(books, filename) {
  pendingImportMultiBooks = books;
  if (!DOM.importManuscriptModal) return;

  DOM.importManuscriptModal.classList.remove('hidden');
  if (DOM.importManuscriptTitle) {
    DOM.importManuscriptTitle.textContent = "Import Manuscript to Session";
  }
  if (DOM.importManuscriptDesc) {
    DOM.importManuscriptDesc.textContent = `File "${filename}" contains ${books.length} manuscripts. Choose which one to add to your current session without replacing your existing books:`;
  }
  if (DOM.importManuscriptList) {
    DOM.importManuscriptList.innerHTML = '';
    books.forEach((b, idx) => {
      const pages = b.pages || [];
      let words = 0;
      pages.forEach(p => { words += getPageWordCount(p); });

      const li = document.createElement('li');
      li.className = 'backup-inspect-book-item';
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '10px 14px';

      li.innerHTML = `
        <div class="backup-inspect-book-main">
          <span style="font-size:16px; margin-right:8px;">📖</span>
          <div>
            <strong class="backup-inspect-book-title" style="display:block; font-size:13px; color:#e0e0e0;">${idx + 1}. ${b.title || 'Untitled Manuscript'}</strong>
            <span class="backup-inspect-book-meta" style="font-size:11px; color:#888;">${pages.length} pgs • ${words.toLocaleString()} words</span>
          </div>
        </div>
        <button class="btn-drive-action primary btn-pick-import-single" style="padding:6px 14px; font-size:11px; font-weight:600;">
          ➕ Import Book
        </button>
      `;

      const btnPick = li.querySelector('.btn-pick-import-single');
      btnPick.onclick = () => {
        addSingleManuscriptToSession(b, b.title);
        closeImportManuscriptModal();
      };

      DOM.importManuscriptList.appendChild(li);
    });
  }
}

function closeImportManuscriptModal() {
  if (DOM.importManuscriptModal) {
    DOM.importManuscriptModal.classList.add('hidden');
  }
  if (DOM.btnImportAllToSession) {
    DOM.btnImportAllToSession.classList.remove('hidden');
  }
  pendingImportMultiBooks = null;
  if (DOM.fileInputImportManuscript) {
    DOM.fileInputImportManuscript.value = '';
  }
}

function importAllPendingBooksToSession() {
  if (!pendingImportMultiBooks || pendingImportMultiBooks.length === 0) return;
  const count = pendingImportMultiBooks.length;
  pendingImportMultiBooks.forEach(b => {
    addSingleManuscriptToSession(b, b.title);
  });
  closeImportManuscriptModal();
  showToast(`Imported all ${count} manuscripts into your current session!`);
}

function exportSingleManuscriptJSON() {
  const book = getActiveBook();
  if (!book) return;
  const cleanTitle = (book.title || 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_manuscript_${new Date().toISOString().slice(0, 10)}.json`;

  const payload = JSON.stringify({
    type: 'single_manuscript',
    version: 1,
    exportedAt: new Date().toISOString(),
    book: book
  }, null, 2);

  triggerFileDownload(filename, payload, 'application/json');
  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  showToast(`Exported single manuscript "${book.title}" (.json)!`);
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
    description: '',
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
    description: '',
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
  const fullText = page.chunks.map(chunk => getChunkText(chunk)).join('');
  return countWords(fullText);
}

function getBookTotalWordCount(book) {
  if (!book || !book.pages) return 0;
  return book.pages.reduce((sum, page) => sum + getPageWordCount(page), 0);
}

// ─── DRAFTING BUFFER & FORWARD-ONLY INK STREAM ──────────────

let currentKeystrokeSession = {
  snapshots: [],
  startTime: null,
  lastTime: null
};

let lastCommittedReplay = {
  snapshots: [],
  wpm: 0
};

function recordKeystroke(val) {
  const now = Date.now();
  if (!val || val.length === 0) {
    currentKeystrokeSession = { snapshots: [], startTime: null, lastTime: null };
    return;
  }

  if (!currentKeystrokeSession.startTime || currentKeystrokeSession.snapshots.length === 0) {
    currentKeystrokeSession.startTime = now;
    currentKeystrokeSession.lastTime = now;
    currentKeystrokeSession.snapshots.push({ text: val, delay: 0 });
  } else {
    // delay since last keystroke, capped at 450ms so idle pauses don't stall replay
    const rawDiff = now - currentKeystrokeSession.lastTime;
    const delay = Math.max(15, Math.min(rawDiff, 450));
    currentKeystrokeSession.lastTime = now;
    currentKeystrokeSession.snapshots.push({ text: val, delay });
  }
}

function commitDraft() {
  if (!DOM.draftInput) return;
  const rawText = DOM.draftInput.value;
  if (!rawText) return;
  if (rawText.length === 0) return;

  if (rawText.length > state.settings.maxChars) {
    showToast(`Draft exceeds maximum character limit (${state.settings.maxChars}).`);
    return;
  }

  let text = rawText;
  if (!text) return;

  // Auto add space after each commit if enabled in settings
  if (state.settings.autoAddSpace) {
    if (!/\s$/.test(text)) {
      text += ' ';
      if (currentKeystrokeSession.snapshots.length > 0) {
        currentKeystrokeSession.snapshots.push({ text: text, delay: 35 });
      }
    }
  }

  // Calculate WPM
  let commitWPM = 0;
  if (currentKeystrokeSession.startTime && currentKeystrokeSession.lastTime && currentKeystrokeSession.snapshots.length > 0) {
    const totalDurationSec = (currentKeystrokeSession.lastTime - currentKeystrokeSession.startTime) / 1000;
    if (totalDurationSec >= 0.2) {
      commitWPM = Math.round((text.length / 5) / (totalDurationSec / 60));
    }
  }

  if (!commitWPM || commitWPM < 1 || commitWPM > 350) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const estTimeSec = Math.max(0.6, text.length * 0.08);
    commitWPM = Math.round((wordCount / estTimeSec) * 60);
  }

  lastCommittedReplay = {
    snapshots: [...currentKeystrokeSession.snapshots],
    wpm: commitWPM
  };

  currentKeystrokeSession = { snapshots: [], startTime: null, lastTime: null };

  const page = getCurrentPage();
  if (!page || page.locked) {
    createNewPage(false);
  }

  const activePage = getCurrentPage();
  if (activePage) {
    const timestamp = new Date().toISOString();
    const newChunk = {
      id: 'chunk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: text,
      timestamp: timestamp
    };
    activePage.chunks.push(newChunk);
    DOM.draftInput.value = '';
    state.buffer = '';
    if (DOM.draftInputBackdrop) DOM.draftInputBackdrop.innerHTML = '';
    adjustDraftInputHeight();

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

function adjustDraftInputHeight() {
  if (!DOM.draftInput) return;
  const isMobile = window.innerWidth <= 600;
  const minHeight = isMobile ? 22 : 24;
  const maxHeight = isMobile ? 120 : 160;

  if (!DOM.draftInput.value) {
    DOM.draftInput.style.height = `${minHeight}px`;
    DOM.draftInput.style.overflowY = 'hidden';
    if (DOM.draftInputBackdrop) {
      DOM.draftInputBackdrop.scrollTop = 0;
    }
    return;
  }

  DOM.draftInput.style.height = 'auto';
  const scrollH = DOM.draftInput.scrollHeight;
  const newHeight = Math.min(Math.max(scrollH, minHeight), maxHeight);
  DOM.draftInput.style.height = `${newHeight}px`;
  DOM.draftInput.style.overflowY = scrollH > maxHeight ? 'auto' : 'hidden';

  if (DOM.draftInputBackdrop) {
    DOM.draftInputBackdrop.scrollTop = DOM.draftInput.scrollTop;
  }
}

function updateCharCounter() {
  if (!DOM.draftInput || !DOM.charCounter) return;
  const len = DOM.draftInput.value.length;
  const max = state.settings.maxChars;

  DOM.charCounter.textContent = `${len} / ${max}`;
  DOM.charCounter.className = 'char-counter';

  if (len > max) {
    DOM.charCounter.classList.add('full');
    DOM.charCounter.style.color = '#ff6b6b';
    if (DOM.btnCommit) DOM.btnCommit.disabled = true;
  } else {
    DOM.charCounter.style.color = '';
    if (DOM.btnCommit) DOM.btnCommit.disabled = false;
    if (len === max) {
      DOM.charCounter.classList.add('full');
    } else if (len >= max * 0.85) {
      DOM.charCounter.classList.add('near');
    }
  }

  if (DOM.draftInputBackdrop) {
    const rawVal = DOM.draftInput.value;
    let htmlVal = '';
    if (len > max) {
      let validPart = rawVal.substring(0, max);
      let overPart = rawVal.substring(max);
      validPart = validPart.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      overPart = overPart.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      htmlVal = validPart + '<span class="over-limit">' + overPart + '</span>';
    } else {
      htmlVal = rawVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    if (rawVal.endsWith('\n')) {
      htmlVal += '\n&#8203;';
    }
    DOM.draftInputBackdrop.innerHTML = htmlVal;
  }

  adjustDraftInputHeight();
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
    const descText = (page.description && page.description.trim()) ? page.description.trim() : '';

    li.innerHTML = `
      <div class="page-item-main">
        <div class="page-item-header">
          <span>${page.locked ? '🔒' : '✍️'}</span>
          <span class="page-item-title">Page ${page.number}</span>
        </div>
        ${descText ? `<span class="page-item-desc" title="${escapeHtml(descText)}">${escapeHtml(descText)}</span>` : ''}
      </div>
      <div class="page-item-actions">
        <button class="btn-edit-page-desc" title="Edit description / chapter label" aria-label="Edit description for page ${page.number}">✏️</button>
        <span class="page-badge">${words}w</span>
      </div>
    `;

    // Click on page item selects page and resumes drafting
    li.onclick = (e) => {
      // If clicking the edit button, do not close overlay
      if (e.target.closest('.btn-edit-page-desc')) {
        e.stopPropagation();
        openPageDescModal(page.id);
        return;
      }
      state.currentPageId = page.id;
      renderAll(false);
      closeOverlay();
    };

    const btnEdit = li.querySelector('.btn-edit-page-desc');
    if (btnEdit) {
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openPageDescModal(page.id);
      };
    }

    DOM.pagesList.appendChild(li);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// ─── PAGE DESCRIPTION MODAL LOGIC ─────────────────────────────

let targetPageDescId = null;

function openPageDescModal(pageId) {
  const book = getActiveBook();
  if (!book) return;
  const page = book.pages.find(p => p.id === pageId);
  if (!page) return;

  targetPageDescId = pageId;

  if (DOM.pageDescModalTitle) {
    DOM.pageDescModalTitle.textContent = `Page ${page.number} Description`;
  }
  if (DOM.pageDescModalSubtitle) {
    DOM.pageDescModalSubtitle.textContent = `Assign a custom chapter or section label for Page ${page.number} (e.g., "Chapter 1", "Prologue", "Act I"):`;
  }
  if (DOM.inputPageDesc) {
    DOM.inputPageDesc.value = page.description || '';
  }

  if (DOM.pageDescModal) {
    DOM.pageDescModal.classList.remove('hidden');
    setTimeout(() => {
      if (DOM.inputPageDesc) {
        DOM.inputPageDesc.focus();
        DOM.inputPageDesc.select();
      }
    }, 50);
  }
}

function closePageDescModal() {
  if (DOM.pageDescModal) {
    DOM.pageDescModal.classList.add('hidden');
  }
  targetPageDescId = null;
}

function savePageDescModal() {
  if (!targetPageDescId) {
    closePageDescModal();
    return;
  }
  const book = getActiveBook();
  if (!book) {
    closePageDescModal();
    return;
  }
  const page = book.pages.find(p => p.id === targetPageDescId);
  if (!page) {
    closePageDescModal();
    return;
  }

  const val = DOM.inputPageDesc ? DOM.inputPageDesc.value.trim() : '';
  if (val) {
    page.description = val;
    showToast(`Page ${page.number} labeled "${val}"`);
  } else {
    delete page.description;
    showToast(`Cleared description for Page ${page.number}`);
  }

  saveStorage();
  renderSidebarPages();
  renderActivePage(false);
  closePageDescModal();
}

function clearPageDescModal() {
  if (!targetPageDescId) {
    closePageDescModal();
    return;
  }
  const book = getActiveBook();
  if (!book) {
    closePageDescModal();
    return;
  }
  const page = book.pages.find(p => p.id === targetPageDescId);
  if (page) {
    delete page.description;
    saveStorage();
    renderSidebarPages();
    renderActivePage(false);
    showToast(`Cleared description for Page ${page.number}`);
  }
  closePageDescModal();
}

// ─── MANUSCRIPT SEARCH LOGIC ───────────────────────────────────

function performBookSearch(query) {
  const q = (query || '').trim();
  if (!q) {
    if (DOM.btnClearBookSearch) DOM.btnClearBookSearch.classList.add('hidden');
    return;
  }

  if (DOM.btnClearBookSearch) DOM.btnClearBookSearch.classList.remove('hidden');

  const book = getActiveBook();
  if (!book) return;

  // Search across all pages in current book
  const results = [];
  const lowerQ = q.toLowerCase();

  book.pages.forEach(page => {
    const pageNum = page.number;
    const pageDesc = page.description ? page.description.trim() : '';
    const fullPageText = (page.chunks || []).map(c => getChunkText(c)).join('');

    const descMatches = pageDesc && pageDesc.toLowerCase().includes(lowerQ);
    const textMatches = fullPageText.toLowerCase().includes(lowerQ);

    if (descMatches || textMatches) {
      // Find snippets
      const snippets = [];
      if (textMatches) {
        let searchIndex = 0;
        const textLower = fullPageText.toLowerCase();
        while (searchIndex < textLower.length && snippets.length < 3) {
          const foundAt = textLower.indexOf(lowerQ, searchIndex);
          if (foundAt === -1) break;

          // Extract excerpt around match
          const snippetStart = Math.max(0, foundAt - 40);
          const snippetEnd = Math.min(fullPageText.length, foundAt + q.length + 55);
          let snippet = fullPageText.substring(snippetStart, snippetEnd).replace(/[\r\n]+/g, ' ');

          // Add ellipsis
          if (snippetStart > 0) snippet = '…' + snippet;
          if (snippetEnd < fullPageText.length) snippet = snippet + '…';

          snippets.push({
            text: snippet,
            matchTerm: fullPageText.substring(foundAt, foundAt + q.length)
          });

          searchIndex = foundAt + Math.max(1, q.length);
        }
      }

      results.push({
        pageId: page.id,
        pageNumber: pageNum,
        pageDescription: pageDesc,
        snippets: snippets,
        descMatch: descMatches
      });
    }
  });

  openSearchResultsModal(q, results);
}

function openSearchResultsModal(query, results) {
  if (!DOM.searchResultsModal) return;

  if (DOM.searchModalTitle) {
    const book = getActiveBook();
    DOM.searchModalTitle.textContent = `Search in "${book ? book.title : 'Current Book'}"`;
  }

  if (DOM.inputModalSearch) {
    DOM.inputModalSearch.value = query;
  }

  if (DOM.searchResultsCountBadge) {
    DOM.searchResultsCountBadge.textContent = `${results.length} page${results.length === 1 ? '' : 's'} matched`;
  }

  if (DOM.searchResultsList) {
    DOM.searchResultsList.innerHTML = '';

    if (results.length === 0) {
      if (DOM.searchEmptyState) DOM.searchEmptyState.classList.remove('hidden');
    } else {
      if (DOM.searchEmptyState) DOM.searchEmptyState.classList.add('hidden');

      results.forEach(res => {
        const li = document.createElement('li');
        li.className = 'search-result-item';

        let snippetHtml = '';
        if (res.snippets && res.snippets.length > 0) {
          snippetHtml = '<div class="search-result-snippets">' + res.snippets.map(s => {
            const escaped = escapeHtml(s.text);
            const regex = new RegExp(escapeRegExp(escapeHtml(query)), 'gi');
            const highlighted = escaped.replace(regex, match => `<mark>${match}</mark>`);
            return `<div class="search-result-snippet">${highlighted}</div>`;
          }).join('') + '</div>';
        } else if (res.descMatch) {
          snippetHtml = `<div class="search-result-snippet" style="font-style:italic; color:#88bbff;">Matched in page description: "${escapeHtml(res.pageDescription)}"</div>`;
        }

        li.innerHTML = `
          <div class="search-result-item-header">
            <span class="search-result-page-label">
              <span>📄</span> Page ${res.pageNumber}
              ${res.pageDescription ? `<span class="search-result-page-desc">"${escapeHtml(res.pageDescription)}"</span>` : ''}
            </span>
            <span class="search-result-matches-count">Jump to Page →</span>
          </div>
          ${snippetHtml}
        `;

        li.onclick = () => {
          state.currentPageId = res.pageId;
          renderAll(false);
          closeSearchResultsModal();
          closeOverlay();
          showToast(`Navigated to Page ${res.pageNumber}${res.pageDescription ? ` (${res.pageDescription})` : ''}`);
        };

        DOM.searchResultsList.appendChild(li);
      });
    }
  }

  DOM.searchResultsModal.classList.remove('hidden');
  setTimeout(() => {
    if (DOM.inputModalSearch) {
      DOM.inputModalSearch.focus();
      DOM.inputModalSearch.select();
    }
  }, 50);
}

function closeSearchResultsModal() {
  if (DOM.searchResultsModal) {
    DOM.searchResultsModal.classList.add('hidden');
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let activeTypewriterTimer = null;

function cancelTypewriterAnimation() {
  if (activeTypewriterTimer) {
    clearTimeout(activeTypewriterTimer);
    activeTypewriterTimer = null;
  }
}

function renderActivePage(lastChunkIsNew = false) {
  cancelTypewriterAnimation();
  const book = getActiveBook();
  const page = getCurrentPage();
  if (!page || !book) return;

  const pageChanged = lastRenderedPageId !== page.id;
  lastRenderedPageId = page.id;

  const totalPages = book.pages.length;
  const descLabel = (page.description && page.description.trim()) ? ` • "${page.description.trim()}"` : '';
  if (DOM.pageHeaderInfo) {
    DOM.pageHeaderInfo.textContent = `Page ${page.number}/${totalPages}${descLabel} • ${book.title}${page.locked ? ' (Locked)' : ''}`;
  }

  const showTS = Boolean(state.settings.showTimestamps);

  if (DOM.pageSheet) {
    DOM.pageSheet.classList.toggle('is-locked', Boolean(page.locked));
    DOM.pageSheet.classList.toggle('has-timestamps', showTS);
  }

  if (DOM.inkStream) {
    DOM.inkStream.innerHTML = '';
    DOM.inkStream.classList.toggle('has-timestamps', showTS);
    DOM.inkStream.classList.toggle('has-content', (page.chunks.length > 0) || Boolean(state.buffer && state.buffer.length > 0));
    DOM.inkStream.classList.remove('slid-open', 'is-sliding');
    DOM.inkStream.style.transform = '';

    const count = page.chunks.length;
    const isAnimated = lastChunkIsNew && Boolean(state.settings.typewriterAnim) && count > 0;
    let animatedTextElem = null;
    let animatedFullText = '';

    page.chunks.forEach((chunkItem, idx) => {
      const text = getChunkText(chunkItem);
      const ts = getChunkTimestamp(chunkItem);
      const timeStr = formatChunkTime(ts);
      const isLastNewChunk = isAnimated && (idx === count - 1);

      if (showTS) {
        const row = document.createElement('div');
        row.className = 'ink-chunk-row';
        if (lastChunkIsNew && idx === count - 1) {
          row.classList.add('new-strike');
        }

        const timeSpan = document.createElement('span');
        timeSpan.className = timeStr ? 'commit-timestamp' : 'commit-timestamp muted';
        timeSpan.textContent = timeStr || '—';
        if (ts) {
          timeSpan.title = `Committed at ${new Date(ts).toLocaleString()}`;
        }
        row.appendChild(timeSpan);

        const textSpan = document.createElement('span');
        textSpan.className = 'ink-chunk';
        if (isLastNewChunk) {
          textSpan.textContent = '';
          animatedTextElem = textSpan;
          animatedFullText = text;
        } else {
          textSpan.textContent = text;
        }
        row.appendChild(textSpan);

        // Tap/click commit on the page toggles slide to reveal timestamps in right margin
        row.addEventListener('click', (e) => {
          if (state.settings.theme === 'imessage') {
            const isSlid = DOM.inkStream.classList.toggle('slid-open');
            DOM.inkStream.style.transform = isSlid ? 'translateX(-68px)' : 'translateX(0px)';
          } else {
            row.classList.toggle('show-time');
          }
        });

        DOM.inkStream.appendChild(row);
      } else {
        const span = document.createElement('span');
        span.className = 'ink-chunk';
        if (lastChunkIsNew && idx === count - 1) {
          span.classList.add('new-strike');
        }
        if (isLastNewChunk) {
          span.textContent = '';
          animatedTextElem = span;
          animatedFullText = text;
        } else {
          span.textContent = text;
        }
        DOM.inkStream.appendChild(span);
      }
    });

    if (!page.locked) {
      const anchor = document.createElement('span');
      anchor.id = 'ink-cursor-anchor';
      DOM.inkStream.appendChild(anchor);

      const ghost = document.createElement('span');
      ghost.id = 'ink-ghost';
      ghost.className = 'ink-ghost';
      ghost.textContent = state.buffer || '';
      DOM.inkStream.appendChild(ghost);

      const cursor = document.createElement('span');
      cursor.className = 'ink-cursor';
      cursor.id = 'ink-cursor';
      DOM.inkStream.appendChild(cursor);
    }

    if (isAnimated && animatedTextElem && animatedFullText) {
      const snapshots = (lastCommittedReplay.snapshots && lastCommittedReplay.snapshots.length > 0)
        ? lastCommittedReplay.snapshots
        : null;
      const wpm = lastCommittedReplay.wpm || 0;

      if (snapshots && snapshots.length > 0) {
        let stepIdx = 0;

        function replayNextSnapshot() {
          if (stepIdx < snapshots.length) {
            const snap = snapshots[stepIdx];
            stepIdx++;
            animatedTextElem.textContent = snap.text;
            playKeyClickSound();

            if (DOM.writingSurface) {
              DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'auto' });
            }
            updateDraftInputCursorAlignment();

            const nextDelay = (stepIdx < snapshots.length) ? snapshots[stepIdx].delay : 0;
            activeTypewriterTimer = setTimeout(replayNextSnapshot, nextDelay);
          } else {
            activeTypewriterTimer = null;
            animatedTextElem.textContent = animatedFullText;
            playCarriageReturnBell();
            if (DOM.writingSurface) {
              DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'smooth' });
            }
            if (wpm > 0) {
              showToast(`⚡ Committed at ${wpm} WPM!`);
            }
          }
        }

        replayNextSnapshot();
      } else {
        let charIndex = 0;
        const totalChars = animatedFullText.length;

        function typeNextChar() {
          if (charIndex < totalChars) {
            charIndex++;
            animatedTextElem.textContent = animatedFullText.substring(0, charIndex);
            playKeyClickSound();

            if (DOM.writingSurface) {
              DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'auto' });
            }
            updateDraftInputCursorAlignment();

            const delay = 35 + Math.floor(Math.random() * 25);
            activeTypewriterTimer = setTimeout(typeNextChar, delay);
          } else {
            activeTypewriterTimer = null;
            playCarriageReturnBell();
            if (DOM.writingSurface) {
              DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'smooth' });
            }
            if (wpm > 0) {
              showToast(`⚡ Committed at ${wpm} WPM!`);
            }
          }
        }

        typeNextChar();
      }
    }
  }

  if (DOM.writingSurface) {
    requestAnimationFrame(() => {
      if (pageChanged) {
        if (page.locked) {
          DOM.writingSurface.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'smooth' });
        }
      } else if (lastChunkIsNew && !page.locked) {
        DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'smooth' });
      }
      updateDraftInputCursorAlignment();
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

function updateDraftInputCursorAlignment() {
  if (state.settings.theme === 'imessage' || window.innerWidth <= 600) {
    if (DOM.draftInput) {
      DOM.draftInput.style.textIndent = '0px';
      DOM.draftInput.style.paddingLeft = '0px';
    }
    if (DOM.draftInputBackdrop) {
      DOM.draftInputBackdrop.style.textIndent = '0px';
      DOM.draftInputBackdrop.style.paddingLeft = '0px';
    }
    return;
  }

  const inkCursor = document.getElementById('ink-cursor-anchor') || document.getElementById('ink-cursor');
  if (!inkCursor || !DOM.pageSheet || !DOM.draftInput || !DOM.draftBox) return;

  const pageRect = DOM.pageSheet.getBoundingClientRect();
  const cursorRect = inkCursor.getBoundingClientRect();
  const draftBoxRect = DOM.draftBox.getBoundingClientRect();

  if (!pageRect.width || !cursorRect.height) return;

  // Measure X position of inkCursor relative to draft box text inner padding (16px)
  const cursorX = cursorRect.left - (draftBoxRect.left + 16);

  const draftBoxWidth = draftBoxRect.width || 700;
  // Keep at least 140px of typing room in draft input before line wrapping
  const maxIndent = Math.max(0, draftBoxWidth - 180);
  const indentPx = Math.max(0, Math.min(cursorX, maxIndent));

  DOM.draftInput.style.textIndent = `${indentPx}px`;
  DOM.draftInput.style.paddingLeft = '0px';
  if (DOM.draftInputBackdrop) {
    DOM.draftInputBackdrop.style.textIndent = `${indentPx}px`;
    DOM.draftInputBackdrop.style.paddingLeft = '0px';
  }
}

function updatePageWordCounter() {
  if (!DOM.pageWordCounter) return;
  const page = getCurrentPage();
  const currentWords = page ? getPageWordCount(page) : 0;
  const targetWords = state.settings.wordsPerPage || 300;
  DOM.pageWordCounter.textContent = `${currentWords} / ${targetWords}`;
}

function updateStats() {
  const book = getActiveBook();
  if (DOM.statTotalWords) DOM.statTotalWords.textContent = getBookTotalWordCount(book);
  if (DOM.statTotalPages) DOM.statTotalPages.textContent = book ? book.pages.length : 0;
  if (DOM.statTotalBooks) DOM.statTotalBooks.textContent = state.books.length;
  updatePageWordCounter();
}

function applyTheme() {
  document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  document.body.classList.add(`theme-${state.settings.theme}`);
  if (DOM.settingTheme) DOM.settingTheme.value = state.settings.theme;
  if (DOM.inkStream) {
    DOM.inkStream.classList.remove('slid-open', 'is-sliding');
    DOM.inkStream.style.transform = '';
  }
  adjustDraftInputHeight();
  updateDraftInputCursorAlignment();
}

function applyFont() {
  document.body.className = document.body.className.replace(/\bfont-\S+/g, '');
  document.body.classList.add(`font-${state.settings.font}`);
  if (DOM.settingFont) DOM.settingFont.value = state.settings.font;
  adjustDraftInputHeight();
  updateDraftInputCursorAlignment();
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
  if (DOM.settingMaxChars) DOM.settingMaxChars.value = state.settings.maxChars || 200;
  if (DOM.settingWordsPerPage) DOM.settingWordsPerPage.value = state.settings.wordsPerPage || 300;
  if (DOM.settingTheme) DOM.settingTheme.value = state.settings.theme || 'cream';
  if (DOM.settingFont) DOM.settingFont.value = state.settings.font || 'courier';
  if (DOM.settingCommitKey) DOM.settingCommitKey.value = state.settings.commitKey || 'ctrl-enter';
  if (DOM.settingVolume) DOM.settingVolume.value = (state.settings.volume !== undefined) ? state.settings.volume : 50;
  if (DOM.btnSoundToggle) DOM.btnSoundToggle.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
  if (DOM.settingTypewriterAnim) DOM.settingTypewriterAnim.checked = Boolean(state.settings.typewriterAnim);
  if (DOM.settingAutoSpace) DOM.settingAutoSpace.checked = Boolean(state.settings.autoAddSpace);
  if (DOM.settingShowTimestamps) DOM.settingShowTimestamps.checked = Boolean(state.settings.showTimestamps);
  if (DOM.btnToggleTimestamps) DOM.btnToggleTimestamps.classList.toggle('active', Boolean(state.settings.showTimestamps));
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
    const descSuffix = (page.description && page.description.trim()) ? ` (${page.description.trim()})` : '';
    if (format === 'md') fullText += `## Page ${page.number}${descSuffix}\n\n`;
    else fullText += `--- PAGE ${page.number}${descSuffix.toUpperCase()} ---\n\n`;
    const pageText = page.chunks.map(c => getChunkText(c)).join('');
    fullText += pageText + '\n\n';
  });
  return fullText.trim();
}

function exportManuscript(format) {
  if (format === 'pdf') {
    exportManuscriptPDF();
    return;
  }
  if (format === 'epub') {
    exportManuscriptEPUB();
    return;
  }
  if (format === 'json') {
    exportSingleManuscriptJSON();
    return;
  }
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

function exportManuscriptPDF() {
  const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFClass) {
    showToast("PDF engine is initializing, please try again in a moment.");
    return;
  }

  const book = getActiveBook();
  const cleanTitle = (book ? book.title : 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    const doc = new jsPDFClass({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 72; // Standard 1-inch manuscript margin
    const contentWidth = pageWidth - (margin * 2);
    const lineHeight = 18;
    const bottomLimit = pageHeight - margin;
    const showTS = Boolean(state.settings && state.settings.showTimestamps);

    const bookTitle = (book && book.title ? book.title : 'Untitled Book').trim();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const pages = (book && book.pages && book.pages.length > 0) ? book.pages : [{ number: 1, chunks: [] }];

    let pdfPageCount = 0;

    pages.forEach((page, pageIdx) => {
      if (pdfPageCount > 0) {
        doc.addPage();
      }
      pdfPageCount++;

      function drawRunningHeader(isContinuation = false) {
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        const headerTitle = bookTitle.toUpperCase() + (isContinuation ? ' (CONT.)' : '');
        doc.text(headerTitle, margin, 46);

        const headerDesc = (page.description && page.description.trim()) ? ` [${page.description.trim().toUpperCase()}]` : '';
        const headerRight = `PAGE ${page.number}${headerDesc}`;
        const rightW = doc.getTextWidth(headerRight);
        doc.text(headerRight, pageWidth - margin - rightW, 46);

        doc.setDrawColor(210, 205, 195);
        doc.setLineWidth(0.75);
        doc.line(margin, 54, pageWidth - margin, 54);
      }

      drawRunningHeader(false);

      let cursorY = margin + 14;

      // On Page 1, render Manuscript Title Banner
      if (pageIdx === 0) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(20, 20, 20);
        const titleLines = doc.splitTextToSize(bookTitle, contentWidth);
        titleLines.forEach(tLine => {
          doc.text(tLine, margin, cursorY);
          cursorY += 22;
        });

        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(130, 125, 120);
        doc.text(`TYPEWRITER STUDIO MANUSCRIPT  •  ${dateStr.toUpperCase()}`, margin, cursorY);
        cursorY += 28;

        doc.setDrawColor(225, 220, 210);
        doc.setLineWidth(0.5);
        doc.line(margin, cursorY - 14, pageWidth - margin, cursorY - 14);
      }

      doc.setFont('courier', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(28, 28, 28);

      const chunks = page.chunks || [];
      if (chunks.length === 0) {
        doc.setFont('courier', 'italic');
        doc.setTextColor(160, 160, 160);
        doc.text('[Empty Page]', margin, cursorY);
      } else {
        chunks.forEach((chunkItem) => {
          const text = getChunkText(chunkItem);
          const ts = getChunkTimestamp(chunkItem);
          const timeStr = formatChunkTime(ts);

          if (showTS && timeStr) {
            doc.setFont('courier', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(140, 135, 130);
            if (cursorY + 14 > bottomLimit) {
              doc.addPage();
              pdfPageCount++;
              drawRunningHeader(true);
              cursorY = margin + 14;
            }
            doc.text(`[${timeStr}]`, margin, cursorY);
            cursorY += 13;
            doc.setFont('courier', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(28, 28, 28);
          }

          const paragraphs = text.split('\n');
          paragraphs.forEach((para, pIdx) => {
            if (para === '') {
              cursorY += lineHeight * 0.7;
              return;
            }
            const lines = doc.splitTextToSize(para, contentWidth);
            lines.forEach(line => {
              if (cursorY + lineHeight > bottomLimit) {
                doc.addPage();
                pdfPageCount++;
                drawRunningHeader(true);
                cursorY = margin + 14;
                doc.setFont('courier', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(28, 28, 28);
              }
              doc.text(line, margin, cursorY);
              cursorY += lineHeight;
            });
            if (pIdx < paragraphs.length - 1) {
              cursorY += 4;
            }
          });
        });
      }
    });

    doc.save(filename);
    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    showToast(`Exported ${filename}`);
  } catch (err) {
    console.error('PDF export failed:', err);
    showToast('Failed to export PDF: ' + (err.message || 'Unknown error'));
  }
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
    if (DOM.driveModal && !DOM.driveModal.classList.contains('hidden')) {
      refreshDriveFiles();
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
      sessionType: 'full_session_instance',
      books: state.books,
      settings: state.settings
    }, null, 2);

    const fileName = `typewriter_full_session_${new Date().toISOString().slice(0, 10)}.json`;

    const result = await uploadToGoogleDrive({
      name: fileName,
      content: backupData,
      mimeType: 'application/json',
      isDoc: false
    });

    showToast(`Full session/instance backup saved to Google Drive as "${result.name}"!`);
    if (DOM.driveModal && !DOM.driveModal.classList.contains('hidden')) {
      refreshDriveFiles();
    }
  } catch (err) {
    console.error("Drive backup error:", err);
    showToast(`Drive backup: ${err.message || 'Failed to save.'}`);
  }
}

async function fetchDriveFiles() {
  const token = await getGoogleDriveToken();
  const url = `https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse&spaces=drive&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=modifiedTime%20desc&pageSize=100`;

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

let lastFetchedDriveFiles = [];

async function downloadDriveFileText(fileId, mimeType = '') {
  const token = await getGoogleDriveToken();
  const isDoc = mimeType === 'application/vnd.google-apps.document';
  const url = isDoc
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to download file (${response.status})`);
  }

  return await response.text();
}

async function downloadDriveFileBinary(fileId) {
  const token = await getGoogleDriveToken();
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Failed to download binary file (${response.status})`);
  }

  return await response.arrayBuffer();
}

async function downloadDriveFile(fileId) {
  return await downloadDriveFileText(fileId);
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
    const raw = await downloadDriveFileText(fileId);
    const importedData = JSON.parse(raw);

    if (importedData && importedData.books && importedData.books.length > 0) {
      closeDriveModal();
      openBackupInspectModal(importedData, 'Google Drive');
    } else {
      showToast("Selected file is not a valid studio backup JSON.");
    }
  } catch (err) {
    console.error("Restore error:", err);
    showToast(`Failed to inspect backup: ${err.message}`);
  }
}

async function importDriveFileToSession(file) {
  if (!file || !file.id) return;

  try {
    showToast(`Importing "${file.name}" from Google Drive...`);
    
    const fileName = file.name || 'Untitled';
    const isEpub = /\.epub$/i.test(fileName) || file.mimeType === 'application/epub+zip';
    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
    const isJson = fileName.endsWith('.json') || file.mimeType === 'application/json';

    if (isEpub) {
      const buffer = await downloadDriveFileBinary(file.id);
      closeDriveModal();
      closeImportManuscriptModal();
      handleEpubFileChoice(buffer, fileName);
      return;
    }

    const rawText = await downloadDriveFileText(file.id, file.mimeType);

    if (isJson) {
      const result = parseManuscriptFile(rawText, fileName);
      if (result.type === 'single') {
        addSingleManuscriptToSession(result.book, fileName);
        closeDriveModal();
        closeImportManuscriptModal();
      } else if (result.type === 'multiple') {
        closeDriveModal();
        showImportManuscriptPicker(result.books, fileName);
      }
      return;
    }

    // Google Doc, Plain Text (.txt), or Markdown (.md)
    const result = parseManuscriptFile(rawText, fileName);
    addSingleManuscriptToSession(result.book, fileName);
    closeDriveModal();
    closeImportManuscriptModal();
  } catch (err) {
    console.error("Import from Drive failed:", err);
    showToast(`Could not import: ${err.message || 'Unknown error'}`);
    alert(`Could not import "${file.name}" from Google Drive: ${err.message || 'Invalid format.'}`);
  }
}

function showDriveFilesImportPicker(files) {
  if (!DOM.importManuscriptModal) return;
  DOM.importManuscriptModal.classList.remove('hidden');

  if (DOM.importManuscriptTitle) {
    DOM.importManuscriptTitle.textContent = "Import from Google Drive";
  }
  if (DOM.importManuscriptDesc) {
    DOM.importManuscriptDesc.textContent = `Select a manuscript, document, or eBook from your Google Drive to add as a new book to your session:`;
  }
  if (DOM.btnImportAllToSession) {
    DOM.btnImportAllToSession.classList.add('hidden');
  }

  if (DOM.importManuscriptList) {
    DOM.importManuscriptList.innerHTML = '';
    files.forEach((f) => {
      const fileName = f.name || 'Untitled';
      const isDoc = f.mimeType === 'application/vnd.google-apps.document';
      const isEpub = fileName.endsWith('.epub') || f.mimeType === 'application/epub+zip';
      const isJson = fileName.endsWith('.json') || f.mimeType === 'application/json';
      const isBackup = isJson && (fileName.toLowerCase().includes('session') || fileName.toLowerCase().includes('backup') || fileName.toLowerCase().includes('typewriter'));
      const isMd = fileName.endsWith('.md') || f.mimeType === 'text/markdown';
      const icon = isDoc ? '📄' : isEpub ? '📚' : isBackup ? '💾' : isMd ? '📝' : isJson ? '📋' : '📄';
      const typeLabel = isDoc ? 'Google Doc' : isEpub ? 'EPUB eBook' : isBackup ? 'Session Backup' : isMd ? 'Markdown' : isJson ? 'JSON Manuscript' : 'Text File';
      const dateStr = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '';

      const li = document.createElement('li');
      li.className = 'backup-inspect-book-item';
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.style.alignItems = 'center';
      li.style.padding = '10px 14px';

      li.innerHTML = `
        <div class="backup-inspect-book-main">
          <span style="font-size:18px; margin-right:8px;">${icon}</span>
          <div>
            <strong class="backup-inspect-book-title" style="display:block; font-size:13px; color:#e0e0e0;">${escapeHtml(fileName)}</strong>
            <span class="backup-inspect-book-meta" style="font-size:11px; color:#888;">${typeLabel} • ${dateStr}</span>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          ${isBackup ? `<button class="btn-drive-action primary btn-pick-restore" style="padding:6px 12px; font-size:11px;">📂 Restore Session</button>` : ''}
          <button class="btn-drive-action import btn-pick-import" style="padding:6px 12px; font-size:11px; font-weight:600;">
            ${isBackup ? '📥 Pick Book...' : '➕ Import to Session'}
          </button>
        </div>
      `;

      const btnPick = li.querySelector('.btn-pick-import');
      if (btnPick) {
        btnPick.onclick = () => importDriveFileToSession(f);
      }

      const btnRestore = li.querySelector('.btn-pick-restore');
      if (btnRestore) {
        btnRestore.onclick = () => {
          closeImportManuscriptModal();
          restoreDriveBackup(f.id);
        };
      }

      DOM.importManuscriptList.appendChild(li);
    });
  }
}

async function handleQuickImportFromDrive() {
  try {
    if (!lastFetchedDriveFiles || lastFetchedDriveFiles.length === 0) {
      showToast("Fetching files from Google Drive...");
      await refreshDriveFiles();
    }

    const files = lastFetchedDriveFiles || [];
    const importable = files.filter(f => {
      const fileName = f.name || '';
      const isDoc = f.mimeType === 'application/vnd.google-apps.document';
      const isEpub = fileName.endsWith('.epub') || f.mimeType === 'application/epub+zip';
      const isJson = fileName.endsWith('.json') || f.mimeType === 'application/json';
      const isMd = fileName.endsWith('.md') || f.mimeType === 'text/markdown';
      const isTxt = fileName.endsWith('.txt') || f.mimeType === 'text/plain';
      return isDoc || isEpub || isJson || isMd || isTxt;
    });

    if (importable.length === 0) {
      showToast("No compatible manuscripts or documents found on Google Drive.");
      return;
    }

    showDriveFilesImportPicker(importable);
  } catch (err) {
    console.error("Drive import error:", err);
    showToast(`Google Drive: ${err.message}`);
  }
}

async function handleQuickRestoreFromDrive() {
  try {
    if (!lastFetchedDriveFiles || lastFetchedDriveFiles.length === 0) {
      showToast("Fetching files from Google Drive...");
      await refreshDriveFiles();
    }

    const files = lastFetchedDriveFiles || [];
    const backupFiles = files.filter(f => {
      const fileName = f.name || '';
      return fileName.endsWith('.json') || f.mimeType === 'application/json';
    });

    if (backupFiles.length === 0) {
      showToast("No session backup files (.json) found on your Google Drive.");
      return;
    }

    if (backupFiles.length === 1) {
      restoreDriveBackup(backupFiles[0].id);
      return;
    }

    showDriveFilesImportPicker(backupFiles);
  } catch (err) {
    console.error("Drive restore error:", err);
    showToast(`Google Drive: ${err.message}`);
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
      lastFetchedDriveFiles = [];
      DOM.driveEmptyMessage.innerHTML = `
        <div style="padding: 16px 0; text-align: center;">
          <p style="margin-bottom: 10px;">No files found on your Google Drive yet.</p>
          <div style="display:flex; justify-content:center; gap:8px;">
            <button id="btn-empty-backup-now" class="drive-pill-btn" style="padding:6px 14px; font-size:12px;">💾 Backup Studio Now</button>
            <button id="btn-empty-export-now" class="drive-pill-btn" style="padding:6px 14px; font-size:12px;">📄 Export Active Book</button>
          </div>
        </div>
      `;
      const btnEmptyBackup = document.getElementById('btn-empty-backup-now');
      if (btnEmptyBackup) btnEmptyBackup.onclick = saveBackupToDrive;
      const btnEmptyExport = document.getElementById('btn-empty-export-now');
      if (btnEmptyExport) btnEmptyExport.onclick = () => saveCurrentBookToDrive(true);
      DOM.driveEmptyMessage.classList.remove('hidden');
      return;
    }

    renderDriveFilesList(files);
  } catch (err) {
    console.warn("Drive files fetch warning:", err);
    DOM.driveLoadingIndicator.classList.add('hidden');
    DOM.driveEmptyMessage.innerHTML = `
      <div style="padding: 18px 0; text-align: center;">
        <p style="color: #ff9999; margin-bottom: 12px; font-size: 13px;">${escapeHtml(err.message || 'Could not connect to Google Drive.')}</p>
        <button id="btn-drive-connect-action" class="drive-pill-btn import" style="padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer;">
          🔑 Sign In &amp; Connect Google Drive
        </button>
      </div>
    `;
    const btnConnect = document.getElementById('btn-drive-connect-action');
    if (btnConnect) {
      btnConnect.onclick = async () => {
        try {
          googleAccessToken = null;
          sessionStorage.removeItem('google_drive_access_token');
          await getGoogleDriveToken();
          await refreshDriveFiles();
        } catch (authErr) {
          console.error("Modal auth error:", authErr);
        }
      };
    }
    DOM.driveEmptyMessage.classList.remove('hidden');
  }
}

function renderDriveFilesList(files) {
  if (!DOM.driveFilesList) return;
  lastFetchedDriveFiles = files || [];
  DOM.driveFilesList.innerHTML = '';
  DOM.driveFilesList.classList.remove('hidden');

  files.forEach(file => {
    const li = document.createElement('li');
    li.className = 'drive-file-item';

    const fileName = file.name || 'Untitled';
    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
    const isEpub = fileName.endsWith('.epub') || file.mimeType === 'application/epub+zip';
    const isJson = fileName.endsWith('.json') || file.mimeType === 'application/json';
    const isBackup = isJson && (fileName.toLowerCase().includes('session') || fileName.toLowerCase().includes('backup') || fileName.toLowerCase().includes('typewriter'));
    const isMd = fileName.endsWith('.md') || file.mimeType === 'text/markdown';
    const isTxt = fileName.endsWith('.txt') || file.mimeType === 'text/plain';

    const icon = isDoc ? '📄' : isEpub ? '📚' : isBackup ? '💾' : isMd ? '📝' : isJson ? '📋' : '📄';
    const typeLabel = isDoc ? 'Google Doc' : isEpub ? 'EPUB eBook' : isBackup ? 'Full Session Backup' : isMd ? 'Markdown' : isJson ? 'JSON Manuscript' : 'Text File';
    const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '';

    li.innerHTML = `
      <div class="drive-file-main">
        <span class="drive-file-icon">${icon}</span>
        <div class="drive-file-details">
          <span class="drive-file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
          <span class="drive-file-subtext">${typeLabel} • ${dateStr}</span>
        </div>
      </div>
      <div class="drive-file-actions">
        ${(isDoc || isEpub || isMd || isTxt || (isJson && !isBackup)) ? `<button class="btn-drive-action import btn-import-item" title="Import this manuscript into your current session as a new book">📥 Import</button>` : ''}
        ${isBackup ? `<button class="btn-drive-action import btn-import-item" title="Pick an individual book from this backup to add to your session">📥 Import Book...</button>` : ''}
        ${isJson ? `<button class="btn-drive-action primary btn-restore-item" title="Inspect and restore this full session backup">📂 Restore</button>` : ''}
        ${file.webViewLink ? `<a href="${escapeHtml(file.webViewLink)}" target="_blank" rel="noopener noreferrer" class="btn-drive-action" title="Open file in Google Drive">Open ↗</a>` : ''}
        <button class="btn-drive-action btn-delete-item" title="Delete file">🗑️</button>
      </div>
    `;

    const btnImport = li.querySelector('.btn-import-item');
    if (btnImport) {
      btnImport.onclick = () => importDriveFileToSession(file);
    }

    const btnRestore = li.querySelector('.btn-restore-item');
    if (btnRestore) {
      btnRestore.onclick = () => restoreDriveBackup(file.id);
    }

    const btnDel = li.querySelector('.btn-delete-item');
    if (btnDel) {
      btnDel.onclick = () => deleteDriveFile(file.id, fileName);
    }

    DOM.driveFilesList.appendChild(li);
  });
}

// ─── EVENT LISTENERS ────────────────────────────────────────

function setupEventListeners() {
  // ESC Key Listener & Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // E-Reader Specific Keyboard Shortcuts
    if (ereaderState.isOpen) {
      if (e.key === 'Escape') {
        if (DOM.ereaderStylePopover && !DOM.ereaderStylePopover.classList.contains('hidden')) {
          DOM.ereaderStylePopover.classList.add('hidden');
          return;
        }
        if (DOM.ereaderSearchBar && !DOM.ereaderSearchBar.classList.contains('hidden')) {
          toggleEreaderSearchBar();
          return;
        }
        if (DOM.ereaderSidebar && !DOM.ereaderSidebar.classList.contains('hidden')) {
          DOM.ereaderSidebar.classList.add('hidden');
          return;
        }
        closeEreader();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleEreaderSearchBar();
        return;
      }

      const isInputActive = document.activeElement === DOM.ereaderSearchInput;
      if (!isInputActive) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'n') {
          e.preventDefault();
          ereaderNextChapter();
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'p') {
          e.preventDefault();
          ereaderPrevChapter();
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          toggleEreaderSidebar('toc');
          return;
        }
        if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          toggleEreaderSidebar('bm');
          return;
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          toggleEreaderStylePopover();
          return;
        }
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleEreaderFullscreen();
          return;
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      if (DOM.epubChoiceModal && !DOM.epubChoiceModal.classList.contains('hidden')) {
        closeEpubChoiceModal();
        return;
      }
      if (DOM.pageDescModal && !DOM.pageDescModal.classList.contains('hidden')) {
        closePageDescModal();
        return;
      }
      if (DOM.searchResultsModal && !DOM.searchResultsModal.classList.contains('hidden')) {
        closeSearchResultsModal();
        return;
      }
      if (DOM.backupInspectModal && !DOM.backupInspectModal.classList.contains('hidden')) {
        closeBackupInspectModal();
        return;
      }
      if (DOM.importManuscriptModal && !DOM.importManuscriptModal.classList.contains('hidden')) {
        closeImportManuscriptModal();
        return;
      }
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
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const pageStep = DOM.writingSurface.clientHeight * 0.75;
        if (e.key === 'PageUp') {
          DOM.writingSurface.scrollBy({ top: -pageStep, behavior: 'smooth' });
        } else {
          DOM.writingSurface.scrollBy({ top: pageStep, behavior: 'smooth' });
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const start = DOM.draftInput.selectionStart;
        const end = DOM.draftInput.selectionEnd;
        const val = DOM.draftInput.value;
        const tabChar = '\t';

        DOM.draftInput.value = val.substring(0, start) + tabChar + val.substring(end);
        DOM.draftInput.selectionStart = DOM.draftInput.selectionEnd = start + tabChar.length;
        state.buffer = DOM.draftInput.value;
        recordKeystroke(state.buffer);
        playKeyClickSound();

        updateCharCounter();
        const ghost = document.getElementById('ink-ghost');
        if (ghost) ghost.textContent = state.buffer;
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

  // Window Resize & Cursor Alignment
  window.addEventListener('resize', () => {
    updateDraftInputCursorAlignment();
  });

  // Mobile Visual Viewport Adjustment for Keyboard
  if (window.visualViewport) {
    const adjustForKeyboard = () => {
      const draftOverlay = document.getElementById('draft-overlay');
      if (draftOverlay) {
        const layoutHeight = window.innerHeight;
        const visualHeight = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        const diff = layoutHeight - visualHeight - offsetTop;
        const isMobile = window.innerWidth <= 600;
        const baseBottom = isMobile ? 10 : 20;
        draftOverlay.style.bottom = (diff > 10 ? diff + 6 : baseBottom) + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', adjustForKeyboard);
    window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    adjustForKeyboard();
  }

  // Mobile Tap-to-Focus
  if (DOM.writingSurface) {
    DOM.writingSurface.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      if (e.target.closest('#draft-overlay')) return;
      
      const page = getCurrentPage();
      if (page && !page.locked && DOM.draftInput) {
        DOM.draftInput.focus();
      }
    });
  }

  // Draft Input events
  if (DOM.draftInput) {
    DOM.draftInput.addEventListener('focus', () => {
      updateDraftInputCursorAlignment();
    });

    DOM.draftInput.addEventListener('scroll', () => {
      if (DOM.draftInputBackdrop) {
        DOM.draftInputBackdrop.scrollTop = DOM.draftInput.scrollTop;
      }
    });

    DOM.draftInput.oninput = (e) => {
      state.buffer = e.target.value;
      recordKeystroke(state.buffer);
      playKeyClickSound();
      updateCharCounter();
      const ghost = document.getElementById('ink-ghost');
      if (ghost) {
        ghost.textContent = state.buffer;
        if (DOM.inkStream) {
          const page = getCurrentPage();
          const hasChunks = page && page.chunks && page.chunks.length > 0;
          DOM.inkStream.classList.toggle('has-content', hasChunks || Boolean(state.buffer && state.buffer.length > 0));
        }
        // Auto-scroll to ensure ghost text stays visible above the input box as it grows
        requestAnimationFrame(() => {
          if (DOM.writingSurface) {
            DOM.writingSurface.scrollTo({ top: DOM.writingSurface.scrollHeight, behavior: 'auto' });
          }
        });
      }
    };
  }

  if (DOM.btnCommit) DOM.btnCommit.onclick = commitDraft;

  // Tabbed Menu Navigation & Switcher
  const menuTabBtns = document.querySelectorAll('.menu-tab-btn');
  const menuTabPanels = document.querySelectorAll('.menu-tab-panel');

  function switchMenuTab(tabId) {
    menuTabBtns.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabId;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });
    menuTabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });
  }

  menuTabBtns.forEach(btn => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab) switchMenuTab(targetTab);
    };
  });

  // Tab 1: Current Project Action Handlers
  if (DOM.tabBtnReadDraft) DOM.tabBtnReadDraft.onclick = openCurrentDraftInReader;
  if (DOM.btnOpenEreaderMini) DOM.btnOpenEreaderMini.onclick = openCurrentDraftInReader;
  if (DOM.tabBtnNewDraft) DOM.tabBtnNewDraft.onclick = () => createNewBook();
  if (DOM.tabBtnLoadDraft) {
    DOM.tabBtnLoadDraft.onclick = () => {
      if (DOM.selectBookSlot) {
        DOM.selectBookSlot.focus();
        if (typeof DOM.selectBookSlot.showPicker === 'function') {
          try { DOM.selectBookSlot.showPicker(); } catch (e) {}
        }
        showToast("Select any manuscript draft from the Books menu on the left.");
      }
    };
  }
  if (DOM.tabBtnDeleteDraft) DOM.tabBtnDeleteDraft.onclick = () => deleteCurrentBook();
  if (DOM.tabBtnNewPage) {
    DOM.tabBtnNewPage.onclick = () => {
      createNewPage();
      closeOverlay();
    };
  }

  // Tab 2: Import & Restore Action Handlers
  if (DOM.tabBtnOpenEpubReader) {
    DOM.tabBtnOpenEpubReader.onclick = () => {
      if (DOM.fileInputEpubReader) DOM.fileInputEpubReader.click();
    };
  }
  if (DOM.fileInputEpubReader) {
    DOM.fileInputEpubReader.onchange = importSingleManuscriptFile;
  }
  if (DOM.tabBtnLoadJson) {
    DOM.tabBtnLoadJson.onclick = () => {
      if (DOM.fileInputRestore) DOM.fileInputRestore.click();
    };
  }
  if (DOM.tabBtnImportDrive) {
    DOM.tabBtnImportDrive.onclick = () => {
      openDriveModal();
      handleQuickImportFromDrive();
    };
  }
  if (DOM.tabBtnImportLocal) {
    DOM.tabBtnImportLocal.onclick = () => {
      if (DOM.fileInputImportManuscript) DOM.fileInputImportManuscript.click();
    };
  }
  if (DOM.tabBtnSafetyArchive) DOM.tabBtnSafetyArchive.onclick = openSafetyArchiveModal;

  // Tab 3: Export & Publish Action Handlers
  if (DOM.tabBtnExportPdf) DOM.tabBtnExportPdf.onclick = () => exportManuscript('pdf');
  if (DOM.tabBtnExportEpub) DOM.tabBtnExportEpub.onclick = () => exportManuscript('epub');
  if (DOM.tabBtnExportDriveDoc) DOM.tabBtnExportDriveDoc.onclick = () => saveCurrentBookToDrive(true);
  if (DOM.tabBtnExportAllDialog) {
    DOM.tabBtnExportAllDialog.onclick = () => {
      if (DOM.exportModal) DOM.exportModal.classList.remove('hidden');
    };
  }

  // Tab 4: Backups & Sync Action Handlers
  if (DOM.tabBtnDownloadJsonBackup) DOM.tabBtnDownloadJsonBackup.onclick = exportBackupFile;
  if (DOM.tabBtnToggleDrive) {
    DOM.tabBtnToggleDrive.onclick = () => {
      if (currentUser) {
        if (confirm(`Disconnect Google account (${currentUser.email || currentUser.displayName || 'User'})?`)) {
          handleSignOut();
        }
      } else {
        handleGoogleSignIn();
      }
    };
  }
  if (DOM.settingFirebaseSync) {
    DOM.settingFirebaseSync.onchange = (e) => {
      state.settings.firebaseSyncEnabled = e.target.checked;
      saveStorage(true);
      if (e.target.checked) {
        showToast("Firebase Cloud Sync enabled.");
        if (currentUser) syncToFirestore();
      } else {
        showToast("Firebase Cloud Sync paused (Local only).");
      }
      renderUserUI();
    };
  }
  if (DOM.tabBtnDriveManager) DOM.tabBtnDriveManager.onclick = openDriveModal;

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

  // Import Single Manuscript / Book
  if (DOM.btnImportManuscript) {
    DOM.btnImportManuscript.onclick = () => DOM.fileInputImportManuscript && DOM.fileInputImportManuscript.click();
  }
  if (DOM.btnImportBookQuick) {
    DOM.btnImportBookQuick.onclick = () => DOM.fileInputImportManuscript && DOM.fileInputImportManuscript.click();
  }
  if (DOM.fileInputImportManuscript) {
    DOM.fileInputImportManuscript.onchange = importSingleManuscriptFile;
  }

  // Google Drive buttons
  if (DOM.btnDriveBackup) DOM.btnDriveBackup.onclick = saveBackupToDrive;
  if (DOM.btnDriveImport) DOM.btnDriveImport.onclick = () => {
    openDriveModal();
    handleQuickImportFromDrive();
  };
  if (DOM.btnDriveManager) DOM.btnDriveManager.onclick = openDriveModal;
  if (DOM.btnQuickBackupDrive) DOM.btnQuickBackupDrive.onclick = saveBackupToDrive;
  if (DOM.btnQuickExportDrive) DOM.btnQuickExportDrive.onclick = () => saveCurrentBookToDrive(true);
  if (DOM.btnQuickImportDrive) DOM.btnQuickImportDrive.onclick = handleQuickImportFromDrive;
  if (DOM.btnQuickRestoreDrive) DOM.btnQuickRestoreDrive.onclick = handleQuickRestoreFromDrive;
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
          volume: 50,
          showTimestamps: false,
          typewriterAnim: false,
          autoAddSpace: false,
          settingsVersion: 2
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
    DOM.settingMaxChars.oninput = (e) => {
      const v = parseInt(e.target.value, 10);
      if (v && v >= 20) {
        state.settings.maxChars = v;
        saveStorage();
        updateCharCounter();
      }
    };
  }

  if (DOM.settingWordsPerPage) {
    DOM.settingWordsPerPage.onchange = (e) => {
      state.settings.wordsPerPage = Math.max(50, parseInt(e.target.value, 10) || 300);
      saveStorage();
      renderAll();
    };
    DOM.settingWordsPerPage.oninput = (e) => {
      const v = parseInt(e.target.value, 10);
      if (v && v >= 50) {
        state.settings.wordsPerPage = v;
        saveStorage();
        updatePageWordCounter();
      }
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

  if (DOM.settingTypewriterAnim) {
    DOM.settingTypewriterAnim.onchange = (e) => {
      state.settings.typewriterAnim = e.target.checked;
      saveStorage();
      showToast(state.settings.typewriterAnim ? "Replay keystrokes ON" : "Replay keystrokes OFF");
    };
  }

  if (DOM.settingAutoSpace) {
    DOM.settingAutoSpace.onchange = (e) => {
      state.settings.autoAddSpace = e.target.checked;
      saveStorage();
      showToast(state.settings.autoAddSpace ? "Auto-space after commit ON" : "Auto-space after commit OFF");
    };
  }

  if (DOM.btnToggleTimestamps) {
    DOM.btnToggleTimestamps.onclick = () => {
      state.settings.showTimestamps = !state.settings.showTimestamps;
      saveStorage();
      applySettingsUI();
      renderAll();
      showToast(state.settings.showTimestamps ? "Left margin timestamps enabled" : "Left margin timestamps hidden");
    };
  }

  if (DOM.settingShowTimestamps) {
    DOM.settingShowTimestamps.onchange = (e) => {
      state.settings.showTimestamps = e.target.checked;
      saveStorage();
      applySettingsUI();
      renderAll();
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
  if (DOM.btnExportPdf) DOM.btnExportPdf.onclick = () => exportManuscript('pdf');
  if (DOM.btnExportEpub) DOM.btnExportEpub.onclick = () => exportManuscript('epub');
  if (DOM.btnExportJson) DOM.btnExportJson.onclick = () => exportManuscript('json');
  if (DOM.btnCopyAll) DOM.btnCopyAll.onclick = copyManuscriptToClipboard;

  // Import Manuscript Picker Modal
  if (DOM.btnCloseImportManuscript) DOM.btnCloseImportManuscript.onclick = closeImportManuscriptModal;
  if (DOM.btnCancelImportManuscript) DOM.btnCancelImportManuscript.onclick = closeImportManuscriptModal;
  if (DOM.btnImportAllToSession) DOM.btnImportAllToSession.onclick = importAllPendingBooksToSession;
  if (DOM.importManuscriptModal) {
    DOM.importManuscriptModal.onclick = (e) => {
      if (e.target === DOM.importManuscriptModal) closeImportManuscriptModal();
    };
  }

  // Backup Inspection & Safety Restore Modal
  if (DOM.btnCloseBackupInspect) DOM.btnCloseBackupInspect.onclick = closeBackupInspectModal;
  if (DOM.btnCancelBackupInspect) DOM.btnCancelBackupInspect.onclick = closeBackupInspectModal;
  if (DOM.btnConfirmBackupRestore) DOM.btnConfirmBackupRestore.onclick = () => executeBackupRestore(true);
  if (DOM.btnMergeBackupInspect) DOM.btnMergeBackupInspect.onclick = () => executeBackupRestore(false);
  if (DOM.backupInspectModal) {
    DOM.backupInspectModal.onclick = (e) => {
      if (e.target === DOM.backupInspectModal) closeBackupInspectModal();
    };
  }

  // Page Description Modal Event Listeners
  if (DOM.btnClosePageDesc) DOM.btnClosePageDesc.onclick = closePageDescModal;
  if (DOM.btnCancelPageDesc) DOM.btnCancelPageDesc.onclick = closePageDescModal;
  if (DOM.btnClearPageDesc) DOM.btnClearPageDesc.onclick = clearPageDescModal;
  if (DOM.btnSavePageDesc) DOM.btnSavePageDesc.onclick = savePageDescModal;
  if (DOM.inputPageDesc) {
    DOM.inputPageDesc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        savePageDescModal();
      }
    });
  }
  if (DOM.pageDescModal) {
    DOM.pageDescModal.onclick = (e) => {
      if (e.target === DOM.pageDescModal) closePageDescModal();
    };
  }

  // Manuscript Search Event Listeners
  if (DOM.inputBookSearch) {
    DOM.inputBookSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performBookSearch(DOM.inputBookSearch.value);
      }
    });
    DOM.inputBookSearch.addEventListener('input', () => {
      const hasVal = Boolean(DOM.inputBookSearch.value.trim());
      if (DOM.btnClearBookSearch) {
        DOM.btnClearBookSearch.classList.toggle('hidden', !hasVal);
      }
    });
  }

  if (DOM.btnClearBookSearch) {
    DOM.btnClearBookSearch.onclick = () => {
      if (DOM.inputBookSearch) {
        DOM.inputBookSearch.value = '';
        DOM.inputBookSearch.focus();
      }
      DOM.btnClearBookSearch.classList.add('hidden');
    };
  }

  if (DOM.inputModalSearch) {
    DOM.inputModalSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performBookSearch(DOM.inputModalSearch.value);
      }
    });
  }

  if (DOM.btnCloseSearchModal) DOM.btnCloseSearchModal.onclick = closeSearchResultsModal;
  if (DOM.btnDismissSearchModal) DOM.btnDismissSearchModal.onclick = closeSearchResultsModal;
  if (DOM.searchResultsModal) {
    DOM.searchResultsModal.onclick = (e) => {
      if (e.target === DOM.searchResultsModal) closeSearchResultsModal();
    };
  }

  // E-Reader Core Event Listeners
  if (DOM.btnEreaderExit) DOM.btnEreaderExit.onclick = closeEreader;
  if (DOM.btnEreaderToc) DOM.btnEreaderToc.onclick = () => toggleEreaderSidebar('toc');
  if (DOM.btnEreaderBookmarks) DOM.btnEreaderBookmarks.onclick = () => toggleEreaderSidebar('bm');
  if (DOM.btnCloseEreaderSidebar) DOM.btnCloseEreaderSidebar.onclick = () => DOM.ereaderSidebar && DOM.ereaderSidebar.classList.add('hidden');
  if (DOM.ereaderTabToc) DOM.ereaderTabToc.onclick = () => switchEreaderSidebarTab('toc');
  if (DOM.ereaderTabBm) DOM.ereaderTabBm.onclick = () => switchEreaderSidebarTab('bm');
  if (DOM.btnAddBookmark) DOM.btnAddBookmark.onclick = addEreaderBookmark;

  if (DOM.btnEreaderOpenEpub) {
    DOM.btnEreaderOpenEpub.onclick = () => {
      if (DOM.fileInputEpubReader) DOM.fileInputEpubReader.click();
    };
  }

  if (DOM.btnEreaderSearch) DOM.btnEreaderSearch.onclick = toggleEreaderSearchBar;
  if (DOM.btnCloseEreaderSearch) DOM.btnCloseEreaderSearch.onclick = toggleEreaderSearchBar;
  if (DOM.btnEreaderSearchNext) DOM.btnEreaderSearchNext.onclick = () => highlightAndScrollToMatch(ereaderState.search.currentMatchIndex + 1);
  if (DOM.btnEreaderSearchPrev) DOM.btnEreaderSearchPrev.onclick = () => highlightAndScrollToMatch(ereaderState.search.currentMatchIndex - 1);

  if (DOM.ereaderSearchInput) {
    DOM.ereaderSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          highlightAndScrollToMatch(ereaderState.search.currentMatchIndex - 1);
        } else {
          highlightAndScrollToMatch(ereaderState.search.currentMatchIndex + 1);
        }
      }
    });
    DOM.ereaderSearchInput.addEventListener('input', () => {
      performEreaderSearch(DOM.ereaderSearchInput.value);
    });
  }

  if (DOM.btnEreaderStyle) DOM.btnEreaderStyle.onclick = toggleEreaderStylePopover;
  if (DOM.btnCloseEreaderStyle) DOM.btnCloseEreaderStyle.onclick = toggleEreaderStylePopover;
  if (DOM.btnEreaderFullscreen) DOM.btnEreaderFullscreen.onclick = toggleEreaderFullscreen;

  if (DOM.btnEreaderPrev) DOM.btnEreaderPrev.onclick = ereaderPrevChapter;
  if (DOM.btnEreaderNext) DOM.btnEreaderNext.onclick = ereaderNextChapter;
  if (DOM.btnFooterPrevChap) DOM.btnFooterPrevChap.onclick = ereaderPrevChapter;
  if (DOM.btnFooterNextChap) DOM.btnFooterNextChap.onclick = ereaderNextChapter;

  // E-Reader Progress Scrubber
  if (DOM.ereaderProgressTrack) {
    DOM.ereaderProgressTrack.onclick = (e) => {
      if (!ereaderState.chapters || ereaderState.chapters.length === 0) return;
      const rect = DOM.ereaderProgressTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetIdx = Math.min(ereaderState.chapters.length - 1, Math.floor(pct * ereaderState.chapters.length));
      renderEreaderChapter(targetIdx);
    };
  }

  // Typography Popover Controls
  if (DOM.ereaderOptPublisherDefaults) {
    DOM.ereaderOptPublisherDefaults.onchange = (e) => {
      ereaderState.settings.usePublisherDefaults = e.target.checked;
      applyEreaderStyles();
      renderEreaderChapter(ereaderState.currentChapterIndex);
      saveEreaderStorage();
    };
  }

  if (DOM.btnFontDec) {
    DOM.btnFontDec.onclick = () => {
      if (ereaderState.settings.fontSize > 12) {
        ereaderState.settings.fontSize -= 1;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  }

  if (DOM.btnFontInc) {
    DOM.btnFontInc.onclick = () => {
      if (ereaderState.settings.fontSize < 36) {
        ereaderState.settings.fontSize += 1;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  }

  document.querySelectorAll('.ereader-theme-chip').forEach(btn => {
    btn.onclick = () => {
      const theme = btn.getAttribute('data-rtheme');
      if (theme) {
        ereaderState.settings.theme = theme;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  });

  document.querySelectorAll('.ereader-font-chip').forEach(btn => {
    btn.onclick = () => {
      const font = btn.getAttribute('data-rfont');
      if (font) {
        ereaderState.settings.fontFamily = font;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  });

  document.querySelectorAll('.ereader-line-chip').forEach(btn => {
    btn.onclick = () => {
      const line = parseFloat(btn.getAttribute('data-rline'));
      if (line) {
        ereaderState.settings.lineHeight = line;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  });

  document.querySelectorAll('.ereader-align-chip').forEach(btn => {
    btn.onclick = () => {
      const align = btn.getAttribute('data-ralign');
      if (align) {
        ereaderState.settings.textAlign = align;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  });

  document.querySelectorAll('.ereader-width-chip').forEach(btn => {
    btn.onclick = () => {
      const width = parseInt(btn.getAttribute('data-rwidth'), 10);
      if (width) {
        ereaderState.settings.pageWidth = width;
        applyEreaderStyles();
        saveEreaderStorage();
      }
    };
  });

  if (DOM.ereaderOptTwoPage) {
    DOM.ereaderOptTwoPage.onchange = (e) => {
      ereaderState.settings.twoPageSpread = e.target.checked;
      applyEreaderStyles();
      saveEreaderStorage();
    };
  }

  // EPUB Choice Modal Controls
  if (DOM.btnEpubChoiceReader) {
    DOM.btnEpubChoiceReader.onclick = () => {
      if (pendingEpubData) {
        openEpubInReader(pendingEpubData.arrayBuffer, pendingEpubData.filename);
      }
      closeEpubChoiceModal();
    };
  }

  if (DOM.btnEpubChoiceTypewriter) {
    DOM.btnEpubChoiceTypewriter.onclick = async () => {
      if (pendingEpubData) {
        try {
          showToast("Converting EPUB into typewriter pages...");
          const parsedBook = await parseEpubFile(pendingEpubData.arrayBuffer, pendingEpubData.filename);
          addSingleManuscriptToSession(parsedBook, pendingEpubData.filename);
        } catch (err) {
          console.error("EPUB conversion error:", err);
          alert(`Could not convert EPUB: ${err.message || 'Invalid format.'}`);
        }
      }
      closeEpubChoiceModal();
    };
  }

  if (DOM.btnCloseEpubChoice) DOM.btnCloseEpubChoice.onclick = closeEpubChoiceModal;
  if (DOM.btnCancelEpubChoice) DOM.btnCancelEpubChoice.onclick = closeEpubChoiceModal;
  if (DOM.epubChoiceModal) {
    DOM.epubChoiceModal.onclick = (e) => {
      if (e.target === DOM.epubChoiceModal) closeEpubChoiceModal();
    };
  }

  // Drag and Drop for EPUB & Manuscript files anywhere on window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isEpub = /\.epub$/i.test(file.name) || (file.type && file.type.includes('epub'));

      if (isEpub) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          handleEpubFileChoice(ev.target.result, file.name);
        };
        reader.readAsArrayBuffer(file);
      }
    }
  });

  setupImessageGestures();
  window.addEventListener('resize', adjustDraftInputHeight);
}

// ─── iMESSAGE SLIDE GESTURES ────────────────────────────────
function setupImessageGestures() {
  if (!DOM.writingSurface) return;

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let isHorizontal = null;
  let hasMoved = false;

  const getStream = () => {
    if (state.settings.theme !== 'imessage' || !state.settings.showTimestamps) return null;
    return DOM.inkStream;
  };

  // Touch handling for mobile & tablets
  DOM.writingSurface.addEventListener('touchstart', (e) => {
    const stream = getStream();
    if (!stream || e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = true;
    isHorizontal = null;
    hasMoved = false;
  }, { passive: true });

  DOM.writingSurface.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const stream = getStream();
    if (!stream) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (isHorizontal === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (isHorizontal) {
      hasMoved = true;
      let offset = dx;
      if (stream.classList.contains('slid-open')) {
        offset -= 68;
      }
      if (offset < -72) {
        offset = -72 + (offset + 72) * 0.25;
      } else if (offset > 0) {
        offset = offset * 0.15;
      }
      stream.classList.add('is-sliding');
      stream.style.transform = `translateX(${offset}px)`;
    }
  }, { passive: true });

  const finishGesture = () => {
    if (!isDragging) return;
    isDragging = false;
    const stream = getStream();
    if (!stream) return;

    stream.classList.remove('is-sliding');
    stream.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';

    if (hasMoved) {
      const match = stream.style.transform.match(/translateX\(([-\d.]+)px\)/);
      const currentX = match ? parseFloat(match[1]) : 0;
      if (currentX < -32) {
        stream.classList.add('slid-open');
        stream.style.transform = 'translateX(-68px)';
      } else {
        stream.classList.remove('slid-open');
        stream.style.transform = 'translateX(0px)';
      }
    }

    setTimeout(() => {
      if (stream) stream.style.transition = '';
    }, 300);
  };

  DOM.writingSurface.addEventListener('touchend', finishGesture, { passive: true });
  DOM.writingSurface.addEventListener('touchcancel', finishGesture, { passive: true });

  // Mouse drag support for desktop
  let isMouseDown = false;
  DOM.writingSurface.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const stream = getStream();
    if (!stream) return;
    startX = e.clientX;
    startY = e.clientY;
    isMouseDown = true;
    hasMoved = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const stream = getStream();
    if (!stream) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) {
      hasMoved = true;
      let offset = dx;
      if (stream.classList.contains('slid-open')) {
        offset -= 68;
      }
      if (offset < -72) {
        offset = -72 + (offset + 72) * 0.25;
      } else if (offset > 0) {
        offset = offset * 0.15;
      }
      stream.classList.add('is-sliding');
      stream.style.transform = `translateX(${offset}px)`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    const stream = getStream();
    if (!stream) return;
    stream.classList.remove('is-sliding');
    stream.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)';
    if (hasMoved) {
      const match = stream.style.transform.match(/translateX\(([-\d.]+)px\)/);
      const currentX = match ? parseFloat(match[1]) : 0;
      if (currentX < -32) {
        stream.classList.add('slid-open');
        stream.style.transform = 'translateX(-68px)';
      } else {
        stream.classList.remove('slid-open');
        stream.style.transform = 'translateX(0px)';
      }
    }
    setTimeout(() => {
      if (stream) stream.style.transition = '';
    }, 300);
  });

  // Tap background to close slid timestamps
  DOM.writingSurface.addEventListener('click', (e) => {
    if (hasMoved) return;
    const stream = getStream();
    if (!stream) return;
    if (!e.target.closest('.ink-chunk-row') && stream.classList.contains('slid-open')) {
      stream.classList.remove('slid-open');
      stream.style.transform = 'translateX(0px)';
    }
  });
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

  // Ensure all options and manuscripts are preserved when exiting
  window.addEventListener('beforeunload', () => {
    saveStorage(false);
  });
  window.addEventListener('pagehide', () => {
    saveStorage(false);
  });

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
