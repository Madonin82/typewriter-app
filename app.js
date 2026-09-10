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

function getSafeSessionItem(key) {
  try {
    return (typeof window !== 'undefined' && window.sessionStorage) ? window.sessionStorage.getItem(key) : null;
  } catch (e) {
    return null;
  }
}

function setSafeSessionItem(key, val) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (val === null || val === undefined) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, val);
    }
  } catch (e) {}
}

let googleAccessToken = getSafeSessionItem('google_drive_access_token') || null;
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
    prevPageGhost: true,
    typewriterAnim: false,
    replaySpeed: 1, // 1 to 10 (whole number multiplier)
    autoAddSpace: false,
    settingsVersion: 2
  }
};

let overlayOpen = false;
let hintTimer = null;
let deferredInstallPrompt = null;
let isAppInstalled = false;

// Web Audio API Context & Pre-allocated Reusable Buffer for Typewriter Sound Effects
let audioCtx = null;
let keyClickNoiseBuffer = null;

function initAudio() {
  if (!audioCtx) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    } catch (e) {}
  }
  // Pre-generate reusable noise buffer once to avoid continuous allocations on every keystroke
  if (audioCtx && !keyClickNoiseBuffer) {
    try {
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.025);
      keyClickNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = keyClickNoiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
    } catch (e) {}
  }
}

function playKeyClickSound() {
  if (!state.settings.soundEnabled || state.settings.volume === 0) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!keyClickNoiseBuffer) return;

    const volume = (state.settings.volume / 100) * 0.35;
    const now = audioCtx.currentTime;

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = keyClickNoiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400 + Math.random() * 300, now);
    filter.Q.setValueAtTime(3.5, now);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0008, now + 0.025);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    whiteNoise.start(now);
    whiteNoise.stop(now + 0.026);
  } catch (e) {}
}

function playCarriageReturnBell() {
  if (!state.settings.soundEnabled || state.settings.volume === 0) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const volume = (state.settings.volume / 100) * 0.45;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);

    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.55);
  } catch (e) {}
}

// DOM Cache
let DOM = {};

function initDOM() {
  DOM = {
    writingSurface: document.getElementById('writing-surface'),
    pageSheet: document.getElementById('page-sheet'),
    prevPageGhost: document.getElementById('prev-page-ghost'),
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
    emailAuthForm: document.getElementById('email-auth-form'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    btnEmailSignIn: document.getElementById('btn-email-signin'),
    btnEmailSignUp: document.getElementById('btn-email-signup'),
    userProfile: document.getElementById('user-profile'),
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
    settingTypewriterAnim: document.getElementById('setting-typewriter-anim'),
    settingReplaySpeed: document.getElementById('setting-replay-speed'),
    settingReplaySpeedRow: document.getElementById('setting-replay-speed-row'),
    replaySpeedVal: document.getElementById('replay-speed-val'),
    settingAutoSpace: document.getElementById('setting-auto-space'),
    settingShowTimestamps: document.getElementById('setting-show-timestamps'),
    btnToggleTimestamps: document.getElementById('btn-toggle-timestamps'),
    settingPrevPageGhost: document.getElementById('setting-prev-page-ghost'),

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
    btnExportZip: document.getElementById('btn-export-zip'),
    btnCopyAll: document.getElementById('btn-copy-all'),
    btnExportDriveDoc: document.getElementById('btn-export-drive-doc'),
    btnExportDriveTxt: document.getElementById('btn-export-drive-txt'),

    // Async Export Progress Dialog
    exportProgressModal: document.getElementById('export-progress-modal'),
    exportProgressIcon: document.getElementById('export-progress-icon'),
    exportProgressTitle: document.getElementById('export-progress-title'),
    exportProgressStatus: document.getElementById('export-progress-status'),
    exportProgressBarFill: document.getElementById('export-progress-bar-fill'),
    exportProgressPercent: document.getElementById('export-progress-percent'),

    btnDriveBackup: document.getElementById('btn-drive-backup'),
    btnDriveImport: document.getElementById('btn-drive-import'),
    btnDriveManager: document.getElementById('btn-drive-manager'),
    btnDriveRestoreQuick: document.getElementById('btn-drive-restore-quick'),
    btnQuickExportDoc: document.getElementById('btn-quick-export-doc'),
    btnQuickCopyClip: document.getElementById('btn-quick-copy-clip'),
    btnToggleAllGroups: document.getElementById('btn-toggle-all-groups'),

    btnLoadFromDevice: document.getElementById('btn-load-from-device'),
    btnSaveToDevice: document.getElementById('btn-save-to-device'),
    fileInputLoadDevice: document.getElementById('file-input-load-device'),
    saveDeviceModal: document.getElementById('save-device-modal'),
    btnCloseSaveDeviceModal: document.getElementById('btn-close-save-device-modal'),
    saveDeviceBookTitle: document.getElementById('save-device-book-title'),
    btnDeviceSaveTxt: document.getElementById('btn-device-save-txt'),
    btnDeviceSaveMd: document.getElementById('btn-device-save-md'),
    btnDeviceSavePdf: document.getElementById('btn-device-save-pdf'),
    btnDeviceSaveEpub: document.getElementById('btn-device-save-epub'),
    btnDeviceSaveJson: document.getElementById('btn-device-save-json'),
    btnDeviceSaveZip: document.getElementById('btn-device-save-zip'),
    btnDeviceSaveSession: document.getElementById('btn-device-save-session'),

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

    // Manuscript Readability & Analysis Modal
    btnOpenAnalysis: document.getElementById('btn-open-analysis'),
    analysisModal: document.getElementById('analysis-modal'),
    analysisModalTitle: document.getElementById('analysis-modal-title'),
    analysisModalDesc: document.getElementById('analysis-modal-desc'),
    btnCloseAnalysisModal: document.getElementById('btn-close-analysis-modal'),
    btnDismissAnalysisModal: document.getElementById('btn-dismiss-analysis-modal'),
    analysisFleschScore: document.getElementById('analysis-flesch-score'),
    analysisFleschLabel: document.getElementById('analysis-flesch-label'),
    analysisGradeLevel: document.getElementById('analysis-grade-level'),
    analysisStatWords: document.getElementById('analysis-stat-words'),
    analysisStatChars: document.getElementById('analysis-stat-chars'),
    analysisStatSentences: document.getElementById('analysis-stat-sentences'),
    analysisStatParagraphs: document.getElementById('analysis-stat-paragraphs'),
    analysisStatReadTime: document.getElementById('analysis-stat-read-time'),
    analysisStatSpeakTime: document.getElementById('analysis-stat-speak-time'),
    analysisStatUniqueWords: document.getElementById('analysis-stat-unique-words'),
    analysisStatWordsSentence: document.getElementById('analysis-stat-words-sentence'),
    analysisPagesCountBadge: document.getElementById('analysis-pages-count-badge'),
    analysisPagesBreakdownList: document.getElementById('analysis-pages-breakdown-list'),

    toast: document.getElementById('toast'),
    syncToast: document.getElementById('sync-toast'),
    syncToastMsg: document.getElementById('sync-toast-msg'),

    // Service Worker Update Prompt Banner
    swUpdateBanner: document.getElementById('sw-update-banner'),
    btnSwReload: document.getElementById('btn-sw-reload'),
    btnSwDismiss: document.getElementById('btn-sw-dismiss')
  };
}

// ─── PWA & SERVICE WORKER LIFECYCLE ─────────────────────────

let waitingServiceWorker = null;
let swUpdateRefreshing = false;

function showSWUpdateBanner(worker) {
  waitingServiceWorker = worker;
  if (DOM.swUpdateBanner) {
    DOM.swUpdateBanner.classList.remove('hidden');
  }
}

function hideSWUpdateBanner() {
  if (DOM.swUpdateBanner) {
    DOM.swUpdateBanner.classList.add('hidden');
  }
}

function handleSWReload() {
  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  }
  // Fallback if controllerchange does not fire immediately
  setTimeout(() => {
    if (!swUpdateRefreshing) {
      swUpdateRefreshing = true;
      window.location.reload();
    }
  }, 350);
}

function initServiceWorkerLifecycle() {
  if (!('serviceWorker' in navigator)) return;

  // Listen for controller changes to reload app seamlessly with fresh code
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swUpdateRefreshing) return;
    swUpdateRefreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
      console.log('PWA ServiceWorker registered with scope:', reg.scope);

      // 1. If an updated worker is already waiting to activate
      if (reg.waiting) {
        showSWUpdateBanner(reg.waiting);
      }

      // 2. If an updated worker is currently installing
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version installed while previous version is active
            showSWUpdateBanner(newWorker);
          }
        });
      });

      // 3. Periodically check for updates and check on window focus
      window.addEventListener('focus', () => {
        reg.update().catch(() => {});
      });

      window.addEventListener('online', () => {
        reg.update().catch(() => {});
      });

      setInterval(() => {
        reg.update().catch(() => {});
      }, 60 * 60 * 1000); // Check hourly
    })
    .catch((err) => {
      console.warn('PWA ServiceWorker registration failed:', err);
    });

  // Setup click handlers for update banner
  if (DOM.btnSwReload) {
    DOM.btnSwReload.onclick = handleSWReload;
  }
  if (DOM.btnSwDismiss) {
    DOM.btnSwDismiss.onclick = hideSWUpdateBanner;
  }
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
    showToast("Note to Self is already running as an installed standalone app!");
    return;
  }

  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast("Note to Self installation started!");
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
  if (DOM.escHint) DOM.escHint.classList.add('active');
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
  if (DOM.escHint) DOM.escHint.classList.remove('active');
}

function updateCommitHint() {
  const isCtrl = state.settings.commitKey === 'ctrl-enter';
  const label = isCtrl ? 'Ctrl+Enter to Commit' : 'Enter to Commit';
  const fullTip = isCtrl
    ? 'Commit with Ctrl+Enter — or tap to commit'
    : 'Commit with Enter (Shift+Enter for line break) — or tap to commit';

  if (DOM.commitHint) {
    DOM.commitHint.textContent = label;
  }
  if (DOM.btnCommit) {
    DOM.btnCommit.title = fullTip;
  }
}

// ─── FIREBASE AUTH & FIRESTORE SYNC ─────────────────────────

let firestoreUnsubscribe = null;

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
          subscribeToFirestore(user.uid);
        } else {
          if (firestoreUnsubscribe) {
            firestoreUnsubscribe();
            firestoreUnsubscribe = null;
          }
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
        setSafeSessionItem('google_drive_access_token', googleAccessToken);
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

function handleEmailAuth(mode) {
  if (!auth) initFirebase();
  if (!auth) {
    showToast("Firebase Auth initializing...");
    return;
  }

  const email = DOM.authEmail ? DOM.authEmail.value.trim() : '';
  const password = DOM.authPassword ? DOM.authPassword.value : '';
  if (!email || !password) {
    showToast("Enter an email address and password.");
    return;
  }

  const authRequest = mode === 'signup'
    ? auth.createUserWithEmailAndPassword(email, password)
    : auth.signInWithEmailAndPassword(email, password);

  authRequest.then((result) => {
    const name = result.user.email ? result.user.email.split('@')[0] : 'Author';
    showToast(mode === 'signup' ? `Welcome, ${name}! Your account is ready.` : `Welcome back, ${name}!`);
    renderUserUI();
  }).catch((error) => {
    console.error("Email auth error:", error);
    const messages = {
      'auth/email-already-in-use': 'An account already exists for this email.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/user-not-found': 'No account was found for this email.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/weak-password': 'Password must be at least 6 characters.'
    };
    showToast(messages[error.code] || `Sign in error: ${error.message}`);
  });
}

function handleSignOut() {
  googleAccessToken = null;
  setSafeSessionItem('google_drive_access_token', null);
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
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
      setSafeSessionItem('google_drive_access_token', googleAccessToken);
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
    if (DOM.emailAuthForm) DOM.emailAuthForm.classList.add('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.remove('hidden');
    if (DOM.userName) DOM.userName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    if (DOM.syncStatus) {
      DOM.syncStatus.textContent = googleAccessToken ? "☁️ Firestore + Drive Active" : "☁️ Firestore Synced";
    }
  } else {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.remove('hidden');
    if (DOM.emailAuthForm) DOM.emailAuthForm.classList.remove('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.add('hidden');
  }
}

let localClientWriteId = null;
let pendingRemoteSnapshot = null;
let firestoreSyncTimeout = null;

// Estimate UTF-8 byte size of JSON stringified object
function estimatePayloadByteSize(obj) {
  try {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return new Blob([str]).size;
  } catch (e) {
    return 0;
  }
}

// Sanitizes books payload for cloud sync to ensure maximum compactness
function sanitizeBooksForCloudSync(books) {
  if (!Array.isArray(books)) return [];
  return books.map(book => {
    return {
      id: book.id,
      title: book.title || 'Untitled',
      createdAt: book.createdAt || Date.now(),
      updatedAt: book.updatedAt || Date.now(),
      pages: (book.pages || []).map(page => ({
        id: page.id,
        number: page.number,
        description: page.description || '',
        tags: Array.isArray(page.tags) ? page.tags : [],
        locked: Boolean(page.locked),
        targetWordCount: page.targetWordCount || 300,
        createdAt: page.createdAt || Date.now(),
        updatedAt: page.updatedAt || Date.now(),
        // Compact chunks: store as { t: text, s: timestamp } or clean objects without bloat
        chunks: (page.chunks || []).map(chunk => {
          if (typeof chunk === 'string') return { text: chunk };
          return {
            id: chunk.id,
            text: chunk.text || '',
            timestamp: chunk.timestamp || null
          };
        })
      }))
    };
  });
}

function syncToFirestore() {
  if (!db || !currentUser) return;

  // Debounce rapid typing sync calls so Firestore writes aren't hammered on every keystroke
  if (firestoreSyncTimeout) {
    clearTimeout(firestoreSyncTimeout);
  }

  firestoreSyncTimeout = setTimeout(() => {
    firestoreSyncTimeout = null;
    executeFirestoreSync();
  }, 1200);
}

function executeFirestoreSync() {
  if (!db || !currentUser) return;
  if (DOM.syncStatus) DOM.syncStatus.textContent = "🔄 Syncing...";

  const writeId = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
  localClientWriteId = writeId;

  const sanitizedBooks = sanitizeBooksForCloudSync(state.books);
  const payload = {
    books: sanitizedBooks,
    settings: state.settings,
    activeBookId: state.activeBookId,
    currentPageId: state.currentPageId,
    lastWriteId: writeId,
    lastSynced: firebase.firestore.FieldValue.serverTimestamp()
  };

  const payloadSize = estimatePayloadByteSize(payload);
  const MAX_FIRESTORE_SIZE = 950 * 1024; // 950 KB threshold (below Firestore 1,048,576 bytes limit)

  if (payloadSize > MAX_FIRESTORE_SIZE) {
    console.warn(`[FirestoreSync] Manuscript payload size (${Math.round(payloadSize / 1024)} KB) exceeds safe Firestore document limit.`);
    if (DOM.syncStatus) DOM.syncStatus.textContent = "⚠️ Cloud Limit: Use Drive Sync";
    showToast("⚠️ Manuscript exceeds Firestore 1MB limit. Syncing to Google Drive / local disk.");
    // Auto-backup to Google Drive if authorized
    if (googleAccessToken) {
      saveBackupToDrive().catch(() => {});
    }
    return;
  }

  db.collection("users").doc(currentUser.uid).set(payload, { merge: true }).then(() => {
    if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Firestore Synced";
    showTopSyncNotification("☁️ Synced with Firestore");
  }).catch((e) => {
    console.warn("Firestore sync error:", e);
    if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Local (Sync paused)";
  });
}

function applyRemoteSnapshot(data) {
  if (!data) return;
  const migrated = migratePayloadToLatest(data) || data;
  let changed = false;

  if (migrated.books && Array.isArray(migrated.books) && migrated.books.length > 0) {
    if (JSON.stringify(state.books) !== JSON.stringify(migrated.books)) {
      state.books = migrated.books;
      changed = true;
    }
  }

  if (migrated.settings && typeof migrated.settings === 'object') {
    if (JSON.stringify(state.settings) !== JSON.stringify({ ...state.settings, ...migrated.settings })) {
      state.settings = { ...state.settings, ...migrated.settings };
      changed = true;
    }
  }

  if (migrated.activeBookId && state.books.some(b => b.id === migrated.activeBookId)) {
    if (state.activeBookId !== migrated.activeBookId) {
      state.activeBookId = migrated.activeBookId;
      changed = true;
    }
  } else if (state.books.length > 0 && (!state.activeBookId || !state.books.some(b => b.id === state.activeBookId))) {
    state.activeBookId = state.books[0].id;
    changed = true;
  }

  const activeBook = getActiveBook();
  if (migrated.currentPageId && activeBook && activeBook.pages && activeBook.pages.some(p => p.id === migrated.currentPageId)) {
    if (state.currentPageId !== migrated.currentPageId) {
      state.currentPageId = migrated.currentPageId;
      changed = true;
    }
  } else if (activeBook && activeBook.pages && activeBook.pages.length > 0) {
    const lastPageId = activeBook.pages[activeBook.pages.length - 1].id;
    if (state.currentPageId !== lastPageId) {
      state.currentPageId = lastPageId;
      changed = true;
    }
  }

  if (changed) {
    saveStorage(false);
    renderAll();
    showTopSyncNotification("☁️ Synced across devices");
  }
}

function subscribeToFirestore(uid) {
  if (!db) return;
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  firestoreUnsubscribe = db.collection("users").doc(uid).onSnapshot((doc) => {
    if (!doc.exists) {
      syncToFirestore();
      return;
    }

    // Ignore local write echoes to avoid unwanted UI re-renders while typing/replaying
    if (doc.metadata && doc.metadata.hasPendingWrites) {
      return;
    }

    const data = doc.data();
    if (!data) return;

    // If this snapshot was produced by this client's own write, do not re-render or interrupt playback
    if (data.lastWriteId && data.lastWriteId === localClientWriteId) {
      if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Firestore Synced";
      return;
    }

    // If a keystroke replay animation is currently active, defer applying remote snapshot until replay finishes
    if (activeTypewriterTimer !== null) {
      pendingRemoteSnapshot = data;
      return;
    }

    applyRemoteSnapshot(data);
  }, (e) => {
    console.warn("Firestore snapshot error:", e);
  });
}

function loadFromFirestore(uid) {
  subscribeToFirestore(uid);
}

// ─── STORAGE ARCHITECTURE & ENGINE ──────────────────────────

const CURRENT_SCHEMA_VERSION = "1.2";
const CURRENT_SETTINGS_VERSION = "1.2";
const IDB_DATABASE_NAME = 'NoteToSelf_DB';
const IDB_DATABASE_VERSION = 1;
const IDB_STORE_DOCUMENTS = 'documents_store';

// Safe localStorage abstraction with QuotaExceededError handling
const SafeStorage = {
  isQuotaError(e) {
    return (
      e instanceof DOMException &&
      (e.code === 22 ||
        e.code === 1014 ||
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        (typeof e.message === 'string' && e.message.toLowerCase().includes('quota')))
    );
  },
  getItem(key, fallback = null) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return fallback;
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch (err) {
      console.warn(`[SafeStorage] Failed to read "${key}" from localStorage:`, err);
      return fallback;
    }
  },
  getJSON(key, fallback = null) {
    try {
      const raw = this.getItem(key, null);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[SafeStorage] Failed to parse JSON for "${key}":`, err);
      return fallback;
    }
  },
  setItem(key, value) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const str = typeof value === 'string' ? value : JSON.stringify(value);
      window.localStorage.setItem(key, str);
      return true;
    } catch (err) {
      if (this.isQuotaError(err)) {
        console.warn(`[SafeStorage] QuotaExceededError caught when writing "${key}". Large document payloads are safely stored in IndexedDB.`);
        return false;
      }
      console.warn(`[SafeStorage] Failed to write "${key}" to localStorage:`, err);
      return false;
    }
  },
  removeItem(key) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[SafeStorage] Failed to remove "${key}" from localStorage:`, err);
    }
  },
  clear() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.clear();
    } catch (err) {
      console.warn('[SafeStorage] Failed to clear localStorage:', err);
    }
  }
};

// IndexedDB Engine for high-capacity manuscript & history storage
let idbInstancePromise = null;

function getIndexedDBInstance() {
  if (idbInstancePromise) return idbInstancePromise;
  idbInstancePromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[IndexedDB] IndexedDB is not supported in this runtime environment.');
      return resolve(null);
    }
    try {
      const req = window.indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE_DOCUMENTS)) {
          db.createObjectStore(IDB_STORE_DOCUMENTS, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => {
        console.warn('[IndexedDB] Database open error:', req.error || e);
        resolve(null);
      };
      req.onblocked = () => {
        console.warn('[IndexedDB] Database connection blocked.');
        resolve(null);
      };
    } catch (err) {
      console.warn('[IndexedDB] Open exception:', err);
      resolve(null);
    }
  });
  return idbInstancePromise;
}

async function idbGet(key, fallback = null) {
  try {
    const db = await getIndexedDBInstance();
    if (!db) return fallback;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_DOCUMENTS, 'readonly');
        const store = tx.objectStore(IDB_STORE_DOCUMENTS);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.value !== undefined) {
            resolve(req.result.value);
          } else {
            resolve(fallback);
          }
        };
        req.onerror = () => {
          console.warn(`[IndexedDB] Get error for key "${key}":`, req.error);
          resolve(fallback);
        };
      } catch (txErr) {
        console.warn(`[IndexedDB] Transaction error on get("${key}"):`, txErr);
        resolve(fallback);
      }
    });
  } catch (err) {
    console.warn(`[IndexedDB] idbGet failed for "${key}":`, err);
    return fallback;
  }
}

async function idbSet(key, value, extra = {}) {
  try {
    const db = await getIndexedDBInstance();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_DOCUMENTS, 'readwrite');
        const store = tx.objectStore(IDB_STORE_DOCUMENTS);
        const record = {
          key: key,
          value: value,
          updatedAt: Date.now(),
          schemaVersion: CURRENT_SCHEMA_VERSION,
          ...extra
        };
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.warn(`[IndexedDB] Put error for key "${key}":`, req.error);
          resolve(false);
        };
      } catch (txErr) {
        console.warn(`[IndexedDB] Transaction error on set("${key}"):`, txErr);
        resolve(false);
      }
    });
  } catch (err) {
    console.warn(`[IndexedDB] idbSet failed for "${key}":`, err);
    return false;
  }
}

async function idbRemove(key) {
  try {
    const db = await getIndexedDBInstance();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE_DOCUMENTS, 'readwrite');
        const store = tx.objectStore(IDB_STORE_DOCUMENTS);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (txErr) {
        resolve(false);
      }
    });
  } catch (err) {
    return false;
  }
}

// ─── CANONICAL SCHEMA DEFINITIONS & STEP-BY-STEP MIGRATION PIPELINES ───

/**
 * Step 1: Migration from v0 / unversioned to v1.0 (Basic Book & Page Normalization)
 * - Guarantees book ID, normalized title, timestamps, and non-empty pages array
 */
function migrateBookToV10(book, idx = 0) {
  if (!book || typeof book !== 'object') {
    return {
      id: 'book_' + Date.now() + '_' + idx,
      title: 'Untitled Note',
      pages: [{
        id: 'page_' + Date.now() + '_' + idx,
        number: 1,
        description: '',
        chunks: [],
        locked: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0',
      schemaVersion: '1.0'
    };
  }

  const b = { ...book };
  if (!b.id) b.id = 'book_' + Date.now() + '_' + idx;
  if (b.title === 'My First Book') b.title = 'first note';
  if (!b.title || !b.title.trim()) b.title = `Book ${idx + 1}`;
  if (!b.createdAt) b.createdAt = Date.now();
  if (!b.updatedAt) b.updatedAt = Date.now();
  if (!Array.isArray(b.pages) || b.pages.length === 0) {
    b.pages = [{
      id: 'page_' + Date.now() + '_' + idx,
      number: 1,
      description: '',
      chunks: [],
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }];
  }
  b.version = b.version || '1.0';
  b.schemaVersion = b.schemaVersion || '1.0';
  return b;
}

/**
 * Step 2: Migration from v1.0 to v1.1 (Structured Chunks, Locks, and Word Targets)
 * - Converts raw string chunks into structured chunk objects { id, text, timestamp }
 * - Guarantees page locks, descriptions, target word counts, and page timestamps
 */
function migrateBookToV11(book) {
  const b = { ...book };
  b.pages = (b.pages || []).map((page, pIdx) => {
    if (!page || typeof page !== 'object') {
      return {
        id: 'page_' + Date.now() + '_' + pIdx,
        number: pIdx + 1,
        description: '',
        chunks: [],
        locked: false,
        targetWordCount: 300,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.1',
        schemaVersion: '1.1'
      };
    }
    const p = { ...page };
    if (!p.id) p.id = 'page_' + Date.now() + '_' + pIdx;
    if (typeof p.number !== 'number') p.number = pIdx + 1;
    if (typeof p.description !== 'string') p.description = '';
    if (typeof p.locked !== 'boolean') p.locked = false;
    if (typeof p.targetWordCount !== 'number') p.targetWordCount = 300;
    if (!p.createdAt) p.createdAt = Date.now();
    if (!p.updatedAt) p.updatedAt = Date.now();

    // Migrate chunks: supports legacy raw strings, objects, or partial objects
    if (!Array.isArray(p.chunks)) {
      p.chunks = [];
    } else {
      p.chunks = p.chunks.map((chunk, cIdx) => {
        if (chunk === null || chunk === undefined) return null;
        if (typeof chunk === 'string') {
          return {
            id: 'chk_' + Date.now() + '_' + pIdx + '_' + cIdx,
            text: chunk,
            timestamp: Date.now()
          };
        }
        if (typeof chunk === 'object') {
          return {
            id: chunk.id || ('chk_' + Date.now() + '_' + pIdx + '_' + cIdx),
            text: typeof chunk.text === 'string' ? chunk.text : '',
            timestamp: typeof chunk.timestamp === 'number' ? chunk.timestamp : Date.now()
          };
        }
        return null;
      }).filter(Boolean);
    }
    p.version = '1.1';
    p.schemaVersion = '1.1';
    return p;
  });

  b.version = '1.1';
  b.schemaVersion = '1.1';
  return b;
}

/**
 * Step 3: Migration from v1.1 to v1.2 (Document Tags, Folder Classification, & Metadata)
 * - Adds tags: string[]
 * - Adds folderId / category hierarchy metadata
 * - Adds starred, archived status flags
 * - Adds synopsis / summary field and lastAccessedAt timestamp
 * - Stamps canonical version: "1.2" and schemaVersion: "1.2"
 */
function migrateBookToV12(book) {
  const b = { ...book };
  if (!Array.isArray(b.tags)) b.tags = [];
  if (typeof b.folderId !== 'string' && b.folderId !== null) b.folderId = null;
  if (typeof b.category !== 'string') b.category = '';
  if (typeof b.starred !== 'boolean') b.starred = false;
  if (typeof b.archived !== 'boolean') b.archived = false;
  if (typeof b.synopsis !== 'string') b.synopsis = '';
  if (!b.lastAccessedAt) b.lastAccessedAt = Date.now();

  // Migrate page level fields to v1.2
  if (Array.isArray(b.pages)) {
    b.pages = b.pages.map(p => ({
      ...p,
      tags: Array.isArray(p.tags) ? p.tags : [],
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION
    }));
  }

  b.version = CURRENT_SCHEMA_VERSION;
  b.schemaVersion = CURRENT_SCHEMA_VERSION;
  return b;
}

/**
 * Runs the full sequential migration pipeline on a single book
 */
function migrateSingleBook(rawBook, idx = 0) {
  let book = migrateBookToV10(rawBook, idx);
  book = migrateBookToV11(book);
  book = migrateBookToV12(book);
  return book;
}

/**
 * Validates and runs sequential migrations on an array of books
 */
function migrateBooksSchema(books) {
  if (!Array.isArray(books)) return { books: [], modified: false };
  let modified = false;

  const migrated = books.map((rawBook, idx) => {
    const rawVersion = rawBook ? (rawBook.schemaVersion || rawBook.version) : null;
    const isUpToDate = rawVersion === CURRENT_SCHEMA_VERSION &&
      Array.isArray(rawBook.tags) &&
      rawBook.folderId !== undefined &&
      Array.isArray(rawBook.pages) &&
      rawBook.pages.every(p => p.version === CURRENT_SCHEMA_VERSION && Array.isArray(p.chunks));

    if (!isUpToDate) {
      modified = true;
    }
    return migrateSingleBook(rawBook, idx);
  });

  return { books: migrated, modified };
}

/**
 * Step-by-step Settings Schema Migration (v1.0 -> v1.1 -> v1.2)
 * Handles custom typography (fontSize, lineHeight, letterSpacing),
 * commit keys, sound settings, typewriter physics, and schema version flags.
 */
function migrateSettingsSchema(savedSettings) {
  const currentDefaults = {
    maxChars: 200,
    wordsPerPage: 300,
    theme: 'cream',
    font: 'courier',
    fontSize: 18,
    lineHeight: 1.8,
    letterSpacing: '0.02em',
    commitKey: 'ctrl-enter',
    soundEnabled: true,
    volume: 50,
    showTimestamps: false,
    prevPageGhost: true,
    typewriterAnim: false,
    replaySpeed: 1,
    autoAddSpace: false,
    activeTagFilter: null,
    activeFolderFilter: null,
    settingsVersion: 2,
    version: CURRENT_SETTINGS_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };

  if (!savedSettings || typeof savedSettings !== 'object') {
    return { ...currentDefaults };
  }

  const merged = { ...currentDefaults, ...savedSettings };

  // v1.0 -> v1.1: Ensure typewriterAnim default is false
  if (!merged.settingsVersion || merged.settingsVersion < 2) {
    merged.typewriterAnim = false;
    merged.settingsVersion = 2;
  }

  // v1.1 -> v1.2: Validate typography bounds & constraints
  merged.fontSize = Math.min(36, Math.max(12, parseInt(merged.fontSize, 10) || 18));
  merged.lineHeight = Math.min(3.0, Math.max(1.0, parseFloat(merged.lineHeight) || 1.8));
  merged.replaySpeed = Math.min(10, Math.max(1, parseInt(merged.replaySpeed, 10) || 1));
  merged.maxChars = Math.min(2000, Math.max(20, parseInt(merged.maxChars, 10) || 200));
  merged.wordsPerPage = Math.min(2000, Math.max(50, parseInt(merged.wordsPerPage, 10) || 300));
  merged.version = CURRENT_SETTINGS_VERSION;
  merged.schemaVersion = CURRENT_SCHEMA_VERSION;
  return merged;
}

/**
 * Migrates Safety Archive payloads
 */
function migrateSafetyArchiveSchema(rawArchive) {
  if (!Array.isArray(rawArchive)) return [];
  return rawArchive.map(item => {
    if (!item || typeof item !== 'object') return null;
    let migratedData = item.data;
    if (item.data && item.data.books) {
      const { books } = migrateBooksSchema(item.data.books);
      migratedData = {
        ...item.data,
        books,
        version: CURRENT_SCHEMA_VERSION,
        schemaVersion: CURRENT_SCHEMA_VERSION
      };
    }
    return {
      id: item.id || ('safety_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      type: item.type || 'single_book',
      reason: item.reason || 'Safety Backup',
      date: item.date || new Date().toLocaleString(),
      isoDate: item.isoDate || new Date().toISOString(),
      title: item.title || 'Untitled Archive',
      stats: item.stats || { words: 0, pages: 0 },
      filename: item.filename || 'Safety_Backup.json',
      data: migratedData || {},
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION
    };
  }).filter(Boolean);
}

/**
 * Universal Payload Migration Runner
 * Safely migrates any imported or synced payload before it is scanned, previewed, or bound to the DOM.
 */
function migratePayloadToLatest(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const result = { ...payload };
  if (Array.isArray(result.books)) {
    const { books } = migrateBooksSchema(result.books);
    result.books = books;
  }
  if (result.book && typeof result.book === 'object') {
    result.book = migrateSingleBook(result.book);
  }
  if (result.settings && typeof result.settings === 'object') {
    result.settings = migrateSettingsSchema(result.settings);
  }
  result.version = CURRENT_SCHEMA_VERSION;
  result.schemaVersion = CURRENT_SCHEMA_VERSION;
  return result;
}

// In-memory safety archive cache
let memorySafetyArchive = [];

// ─── STORAGE LIFECYCLE (LOAD & SAVE) ─────────────────────────

function loadStorage() {
  // 1. Synchronously load settings from SafeStorage for instant UI configuration
  const savedSettings = SafeStorage.getJSON('typewriter_settings');
  state.settings = migrateSettingsSchema(savedSettings);

  // 2. Synchronous fallback: check if books exist in memory/legacy storage for immediate rendering
  const legacyBooks = SafeStorage.getJSON('typewriter_books');
  if (legacyBooks && Array.isArray(legacyBooks) && legacyBooks.length > 0) {
    const { books } = migrateBooksSchema(legacyBooks);
    state.books = books;
  }

  // 3. Fallback active IDs from SafeStorage
  state.activeBookId = SafeStorage.getItem('typewriter_active_book_id', state.books[0]?.id || null);
  const currentBook = getActiveBook();
  if (currentBook && currentBook.pages && currentBook.pages.length > 0) {
    const savedPageId = SafeStorage.getItem('typewriter_current_page_id');
    if (savedPageId && currentBook.pages.some(p => p.id === savedPageId)) {
      state.currentPageId = savedPageId;
    } else {
      state.currentPageId = currentBook.pages[currentBook.pages.length - 1].id;
    }
  }

  // 4. Synchronous safety archive fallback
  const legacyArchive = SafeStorage.getJSON('typewriter_safety_archive');
  if (legacyArchive && Array.isArray(legacyArchive)) {
    memorySafetyArchive = migrateSafetyArchiveSchema(legacyArchive);
  }

  if (!state.books || state.books.length === 0) {
    createNewBook("first note", false);
  }

  // 5. Asynchronously hydrate from IndexedDB & migrate legacy localStorage to IndexedDB
  hydrateAndMigrateFromIndexedDB();
}

async function hydrateAndMigrateFromIndexedDB() {
  try {
    const [idbBooks, idbArchive] = await Promise.all([
      idbGet('typewriter_books', null),
      idbGet('typewriter_safety_archive', null)
    ]);

    let shouldRerender = false;

    // A. Handle document books from IndexedDB
    if (idbBooks && Array.isArray(idbBooks) && idbBooks.length > 0) {
      const { books, modified } = migrateBooksSchema(idbBooks);
      state.books = books;
      if (modified) {
        idbSet('typewriter_books', state.books);
      }
      shouldRerender = true;
    } else if (state.books && state.books.length > 0) {
      // First-time migration: store active books in IndexedDB and free localStorage quota
      await idbSet('typewriter_books', state.books);
      SafeStorage.removeItem('typewriter_books');
    }

    // Ensure valid activeBookId and currentPageId after IndexedDB load
    if (state.books && state.books.length > 0) {
      if (!state.activeBookId || !state.books.some(b => b.id === state.activeBookId)) {
        state.activeBookId = state.books[0].id;
        shouldRerender = true;
      }
      const activeBook = getActiveBook();
      if (activeBook && activeBook.pages && activeBook.pages.length > 0) {
        if (!state.currentPageId || !activeBook.pages.some(p => p.id === state.currentPageId)) {
          state.currentPageId = activeBook.pages[activeBook.pages.length - 1].id;
          shouldRerender = true;
        }
      }
    }

    // B. Handle Safety Archive from IndexedDB
    if (idbArchive && Array.isArray(idbArchive) && idbArchive.length > 0) {
      memorySafetyArchive = migrateSafetyArchiveSchema(idbArchive);
      updateSafetyArchiveBadge();
    } else if (memorySafetyArchive && memorySafetyArchive.length > 0) {
      // Migrate legacy safety archive to IndexedDB and remove from localStorage
      await idbSet('typewriter_safety_archive', memorySafetyArchive);
      SafeStorage.removeItem('typewriter_safety_archive');
      updateSafetyArchiveBadge();
    }

    if (shouldRerender) {
      renderAll();
    }
  } catch (err) {
    console.warn("[StorageEngine] Error hydrating from IndexedDB:", err);
  }
}

let idbSaveTimer = null;
let idbSavePending = false;

function scheduleIndexedDBSave() {
  idbSavePending = true;
  if (idbSaveTimer) return;

  idbSaveTimer = setTimeout(async () => {
    idbSaveTimer = null;
    if (!idbSavePending) return;
    idbSavePending = false;
    try {
      await idbSet('typewriter_books', state.books);
    } catch (err) {
      console.warn("[StorageEngine] Debounced IndexedDB write failed:", err);
    }
  }, 350); // 350ms debounce groups rapid commits smoothly without UI freeze
}

function flushIndexedDBSaveSync() {
  if (idbSaveTimer) {
    clearTimeout(idbSaveTimer);
    idbSaveTimer = null;
  }
  idbSavePending = false;
  return idbSet('typewriter_books', state.books);
}

function saveStorage(syncCloud = true, immediateDisk = false) {
  try {
    state.settings.settingsVersion = CURRENT_SETTINGS_VERSION;
    state.settings.schemaVersion = CURRENT_SCHEMA_VERSION;

    // Save lightweight UI settings and active pointers to SafeStorage immediately
    SafeStorage.setItem('typewriter_settings', state.settings);
    if (state.activeBookId) {
      SafeStorage.setItem('typewriter_active_book_id', state.activeBookId);
    }
    if (state.currentPageId) {
      SafeStorage.setItem('typewriter_current_page_id', state.currentPageId);
    }

    // Persist full manuscript document tree to IndexedDB
    if (immediateDisk) {
      flushIndexedDBSaveSync();
    } else {
      scheduleIndexedDBSave();
    }
  } catch (e) {
    console.warn("[StorageEngine] Save storage exception:", e);
  }

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
  return memorySafetyArchive;
}

function saveSafetyArchive(archive) {
  memorySafetyArchive = Array.isArray(archive) ? migrateSafetyArchiveSchema(archive) : [];
  updateSafetyArchiveBadge();
  idbSet('typewriter_safety_archive', memorySafetyArchive);
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

  const migratedBook = migrateSingleBook(book);
  const backupPayload = {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: 'safety_backup_single_book',
    reason: reason,
    backupDate: dateIso,
    bookTitle: book.title,
    stats: stats,
    books: [JSON.parse(JSON.stringify(migratedBook))],
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
    data: backupPayload,
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
  archive.unshift(archiveItem);
  if (archive.length > 10) archive.pop();
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
      book: migratedBook,
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
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

  const { books: migratedBooks } = migrateBooksSchema(books);
  const migratedSettings = migrateSettingsSchema(settings);

  const backupPayload = {
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    type: 'safety_backup_full_reset',
    reason: reason,
    backupDate: dateIso,
    totalBooks: migratedBooks.length,
    stats: { words: totalWords, pages: totalPages, books: migratedBooks.length },
    books: JSON.parse(JSON.stringify(migratedBooks)),
    settings: { ...migratedSettings }
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
    title: `All Manuscripts (${migratedBooks.length} Books)`,
    stats: { words: totalWords, pages: totalPages, books: migratedBooks.length },
    filename: filename,
    data: backupPayload,
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };
  archive.unshift(archiveItem);
  if (archive.length > 10) archive.pop();
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
      totalBooks: migratedBooks.length,
      stats: { words: totalWords, pages: totalPages },
      books: migratedBooks,
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
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

  const migratedData = migratePayloadToLatest(item.data) || item.data;

  if (item.type === 'single_book' && migratedData.books && migratedData.books.length > 0) {
    const bookToRestore = JSON.parse(JSON.stringify(migratedData.books[0]));
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
  } else if (item.type === 'full_reset' && migratedData.books && migratedData.books.length > 0) {
    if (confirm(`Restore all ${migratedData.books.length} books from this snapshot? (This will add them to your studio)`)) {
      migratedData.books.forEach(b => {
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
      showToast(`Restored ${migratedData.books.length} manuscripts from snapshot!`);
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
  const { books: migratedBooks } = migrateBooksSchema(state.books);
  const migratedSettings = migrateSettingsSchema(state.settings);

  const backupData = JSON.stringify({
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportDate: new Date().toISOString(),
    sessionType: 'full_session_instance',
    books: migratedBooks,
    settings: migratedSettings
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

function openBackupInspectModal(rawPayload, sourceLabel = 'Local File') {
  // Always migrate incoming backup payload to current schema before inspecting or restoring
  const payload = migratePayloadToLatest(rawPayload);
  const scan = scanBackupPayload(payload);
  if (!scan) {
    alert("Invalid backup file: The selected file does not contain a valid Note to Self book library.");
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
        alert("Invalid backup file: The selected file does not contain a recognized Note to Self full session/instance backup.");
        if (DOM.fileInputRestore) DOM.fileInputRestore.value = '';
      }
    } catch (err) {
      alert("Could not read backup file. Please ensure it is a valid JSON full session backup from Note to Self.");
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
        return { type: 'single', book: migrateSingleBook(data.book) };
      }
      // Case B: Safety backup single book { type: 'safety_backup_single_book', books: [ ... ] }
      if (data && data.type === 'safety_backup_single_book' && Array.isArray(data.books) && data.books.length > 0) {
        return { type: 'single', book: migrateSingleBook(data.books[0]) };
      }
      // Case C: Object having book property
      if (data && data.book && (data.book.title || data.book.pages)) {
        return { type: 'single', book: migrateSingleBook(data.book) };
      }
      // Case D: Direct Book object { id, title, pages }
      if (data && (Array.isArray(data.pages) || (data.title && (data.chunks || Array.isArray(data.pages))))) {
        return { type: 'single', book: migrateSingleBook(data) };
      }
      // Case E: Session backup with array of books
      if (data && Array.isArray(data.books) && data.books.length > 0) {
        const { books } = migrateBooksSchema(data.books);
        if (books.length === 1) {
          return { type: 'single', book: books[0] };
        } else {
          return { type: 'multiple', books: books, filename: filename };
        }
      }
      // Case F: Array of book objects directly
      if (Array.isArray(data) && data.length > 0 && data[0] && (data[0].title || data[0].pages)) {
        const { books } = migrateBooksSchema(data);
        if (books.length === 1) {
          return { type: 'single', book: books[0] };
        } else {
          return { type: 'multiple', books: books, filename: filename };
        }
      }
      // Case G: Simple note/document object { title, content / text }
      if (data && (data.title || data.content || data.text)) {
        return {
          type: 'single',
          book: migrateSingleBook({
            title: data.title || filename.replace(/\.json$/i, ''),
            pages: [{ number: 1, text: data.content || data.text || '', chunks: [] }]
          })
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

  const migrated = migrateSingleBook(rawBook);

  // 1. Sanitize title
  let title = (migrated.title || sourceName || `Manuscript ${state.books.length + 1}`).trim();
  if (state.books.some(b => b.title.toLowerCase() === title.toLowerCase())) {
    title = `${title} (Imported)`;
  }
  migrated.title = title;
  migrated.id = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

  // 2. Append to session without altering existing books
  state.books.push(migrated);
  state.activeBookId = migrated.id;
  state.currentPageId = migrated.pages && migrated.pages.length > 0 ? migrated.pages[0].id : null;

  saveStorage();
  renderAll();

  let totalWords = 0;
  migrated.pages.forEach(pg => {
    totalWords += getPageWordCount(pg);
  });

  showToast(`Added manuscript "${migrated.title}" (${migrated.pages.length} pg${migrated.pages.length === 1 ? '' : 's'}, ${totalWords.toLocaleString()} wds) to session!`);
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

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  if (DOM.saveDeviceModal) DOM.saveDeviceModal.classList.add('hidden');

  ExportProgress.show(`Exporting EPUB: "${book.title || 'Manuscript'}"`, "📚");

  try {
    const zip = new JSZip();

    // 1. mimetype MUST be uncompressed first entry in archive
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    await yieldToMain();

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
    const pages = Array.isArray(book.pages) ? book.pages : [];
    pages.forEach(p => {
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
    <p class="book-subtitle">A Note to Self Manuscript</p>
    <div class="meta-stats">
      <p>${pages.length} Pages • ${totalWords.toLocaleString()} Words</p>
      <p>Drafted with Note to Self</p>
    </div>
  </div>
</body>
</html>`;
    zip.file('OEBPS/titlepage.xhtml', titlePageXhtml);

    // 5. Intelligent Chapter Grouping for Novel Manuscripts
    // Instead of creating 300+ detached spine files, pages are grouped by explicit chapter descriptions
    // (e.g. "Chapter 1", "Act I", or custom titles) or in natural ~10-page clusters for comfortable reading.
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

    // Group pages into chapter buckets
    const chapters = [];
    let currentChapter = null;

    pages.forEach((page, pIdx) => {
      const pageNum = page.number || (pIdx + 1);
      const desc = (page.description || '').trim();
      const isExplicitChapter = /^(chapter|act|part|prologue|epilogue|scene)\b/i.test(desc) || (desc.length > 0 && desc.length <= 40 && !currentChapter);

      if (!currentChapter || isExplicitChapter) {
        currentChapter = {
          index: chapters.length + 1,
          title: desc || `Chapter ${chapters.length + 1}`,
          startPage: pageNum,
          pages: [page]
        };
        chapters.push(currentChapter);
      } else {
        currentChapter.pages.push(page);
      }
    });

    for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
      const ch = chapters[cIdx];
      const chNum = ch.index;
      const chFile = `chapter_${chNum}.xhtml`;
      const chId = `chapter-${chNum}`;
      const chTitle = ch.title;

      ExportProgress.update(10 + ((cIdx / Math.max(1, chapters.length)) * 45), `Formatting chapter ${cIdx + 1} of ${chapters.length}...`);
      await yieldToMain();

      let chapterSectionsHtml = '';

      ch.pages.forEach((page, pageInChIdx) => {
        const pageNum = page.number || (pageInChIdx + 1);
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
        }).join('\n      ');

        const pageHeading = (ch.pages.length > 1) ? `<div style="font-size:0.75em; color:#888; margin-top:1.5em; margin-bottom:0.5em; letter-spacing:0.05em; text-transform:uppercase;">— Page ${pageNum} —</div>` : '';
        chapterSectionsHtml += `\n    ${pageHeading}\n    ${parasHtml}`;
      });

      const chXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${xmlEscape(chTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section epub:type="chapter" class="chapter-container">
    <h2 class="chapter-title">${xmlEscape(chTitle)}</h2>
    ${chapterSectionsHtml}
  </section>
</body>
</html>`;

      zip.file(`OEBPS/${chFile}`, chXhtml);

      manifestItems.push(`<item id="${chId}" href="${chFile}" media-type="application/xhtml+xml"/>`);
      spineItems.push(`<itemref idref="${chId}"/>`);
      navItems.push(`<li><a href="${chFile}">${xmlEscape(chTitle)}</a></li>`);
      ncxNavPoints.push(`
    <navPoint id="nav-c${chNum}" playOrder="${cIdx + 2}">
      <navLabel><text>${xmlEscape(chTitle)}</text></navLabel>
      <content src="${chFile}"/>
    </navPoint>`);
    }

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
    <meta name="dtb:totalPageCount" content="${pages.length}"/>
    <meta name="dtb:maxPageNumber" content="${pages.length}"/>
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
    <dc:creator>Note to Self Author</dc:creator>
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

    ExportProgress.update(60, "Compressing EPUB archive stream...");
    await yieldToMain();

    // 9. Generate and download EPUB blob asynchronously with streamFiles
    const epubBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true
    }, (metadata) => {
      ExportProgress.update(60 + (metadata.percent * 0.38), `Compressing archive (${Math.round(metadata.percent)}%)...`);
    });

    const cleanTitle = bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${cleanTitle}_${nowIso.slice(0, 10)}.epub`;

    ExportProgress.update(100, "Download starting!");
    triggerFileDownload(filename, epubBlob, 'application/epub+zip');
    showToast(`Exported EPUB eBook "${filename}"!`);
    playCarriageReturnBell();
    ExportProgress.hide(600);
  } catch (err) {
    console.error("EPUB export error:", err);
    ExportProgress.hide(0);
    showToast(`EPUB export failed: ${err.message || 'Unknown error'}`);
  }
}

async function exportAllBooksZip() {
  if (typeof JSZip === 'undefined') {
    showToast("ZIP engine is initializing, please try again in a moment.");
    return;
  }

  const books = Array.isArray(state.books) ? state.books : [];
  if (books.length === 0) {
    showToast("No books in library to archive.");
    return;
  }

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  if (DOM.saveDeviceModal) DOM.saveDeviceModal.classList.add('hidden');

  ExportProgress.show(`Creating Library Archive (${books.length} Books)`, "🗃️");

  try {
    const zip = new JSZip();
    const nowIso = new Date().toISOString();

    for (let bIdx = 0; bIdx < books.length; bIdx++) {
      const b = books[bIdx];
      const folderName = `${String(bIdx + 1).padStart(2, '0')}_${(b.title || 'untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
      const folder = zip.folder(folderName);

      ExportProgress.update((bIdx / books.length) * 55, `Compiling book "${b.title || 'Untitled'}" (${bIdx + 1}/${books.length})...`);
      await yieldToMain();

      // Compile Markdown
      let mdText = `# ${b.title || 'Untitled Manuscript'}\n\n`;
      (b.pages || []).forEach(page => {
        const descSuffix = (page.description && page.description.trim()) ? ` (${page.description.trim()})` : '';
        mdText += `## Page ${page.number}${descSuffix}\n\n`;
        const chunks = Array.isArray(page.chunks) ? page.chunks : [];
        const pageText = chunks.map(c => getChunkText(c)).join('');
        mdText += pageText + '\n\n';
      });
      folder.file('manuscript.md', mdText);

      // Compile Plain Text
      let txtText = `${b.title || 'Untitled Manuscript'}\n\n`;
      (b.pages || []).forEach(page => {
        const descSuffix = (page.description && page.description.trim()) ? ` (${page.description.trim()})` : '';
        txtText += `--- PAGE ${page.number}${descSuffix.toUpperCase()} ---\n\n`;
        const chunks = Array.isArray(page.chunks) ? page.chunks : [];
        const pageText = chunks.map(c => getChunkText(c)).join('');
        txtText += pageText + '\n\n';
      });
      folder.file('manuscript.txt', txtText);

      // Compile JSON
      folder.file('book_data.json', JSON.stringify({
        version: CURRENT_SCHEMA_VERSION,
        book: b
      }, null, 2));
    }

    // Add full session backup
    const { books: migratedBooks } = migrateBooksSchema(state.books);
    const migratedSettings = migrateSettingsSchema(state.settings);
    zip.file('full_session_backup.json', JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: nowIso,
      books: migratedBooks,
      settings: migratedSettings
    }, null, 2));

    ExportProgress.update(60, "Compressing bulk document archive...");
    await yieldToMain();

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      streamFiles: true
    }, (metadata) => {
      ExportProgress.update(60 + (metadata.percent * 0.38), `Compressing archive (${Math.round(metadata.percent)}%)...`);
    });

    const filename = `typewriter_all_books_archive_${nowIso.slice(0, 10)}.zip`;
    ExportProgress.update(100, "Download starting!");
    triggerFileDownload(filename, zipBlob, 'application/zip');
    showToast(`Exported complete library archive "${filename}"!`);
    playCarriageReturnBell();
    ExportProgress.hide(600);
  } catch (err) {
    console.error("Bulk archive ZIP error:", err);
    ExportProgress.hide(0);
    showToast(`Archive creation failed: ${err.message || 'Unknown error'}`);
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
        const parsedBook = await parseEpubFile(e.target.result, file.name);
        addSingleManuscriptToSession(parsedBook, file.name);
      } catch (err) {
        console.error("EPUB import error:", err);
        alert(`Could not import EPUB: ${err.message || 'Invalid or unrecognized EPUB format.'}`);
      }
      if (DOM.fileInputImportManuscript) {
        DOM.fileInputImportManuscript.value = '';
      }
    };
    reader.onerror = () => {
      alert("Error reading file.");
      if (DOM.fileInputImportManuscript) DOM.fileInputImportManuscript.value = '';
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
  const rawBook = getActiveBook();
  if (!rawBook) return;
  const book = migrateSingleBook(rawBook);
  const cleanTitle = (book.title || 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_manuscript_${new Date().toISOString().slice(0, 10)}.json`;

  const payload = JSON.stringify({
    type: 'single_manuscript',
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    book: book
  }, null, 2);

  triggerFileDownload(filename, payload, 'application/json');
  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  showToast(`Exported single manuscript "${book.title}" (.json)!`);
}

// ─── SAVE TO / LOAD FROM DEVICE FUNCTIONALITY ────────────────

function openSaveDeviceModal() {
  const book = getActiveBook();
  if (DOM.saveDeviceBookTitle) {
    DOM.saveDeviceBookTitle.textContent = book ? `"${book.title}"` : '"Current Book"';
  }
  if (DOM.saveDeviceModal) {
    DOM.saveDeviceModal.classList.remove('hidden');
  }
}

function closeSaveDeviceModal() {
  if (DOM.saveDeviceModal) {
    DOM.saveDeviceModal.classList.add('hidden');
  }
}

function saveActiveBookToDevice(format) {
  closeSaveDeviceModal();
  if (format === 'session') {
    exportBackupFile();
    return;
  }
  if (format === 'zip') {
    exportAllBooksZip();
    return;
  }
  exportManuscript(format);
}

async function triggerLoadFromDevice() {
  // If the browser supports the File System Access API, offer native file picker
  if (window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Supported manuscript & backup files (.txt, .md, .epub, .json)',
            accept: {
              'text/plain': ['.txt'],
              'text/markdown': ['.md'],
              'application/epub+zip': ['.epub'],
              'application/json': ['.json']
            }
          }
        ]
      });
      if (handles && handles.length > 0) {
        const file = await handles[0].getFile();
        if (file) {
          handleFileLoadedFromDevice(file);
          return;
        }
      }
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        return; // User cancelled the picker
      }
      // Fall through to file input click
    }
  }

  if (DOM.fileInputLoadDevice) {
    DOM.fileInputLoadDevice.value = '';
    DOM.fileInputLoadDevice.click();
  }
}

function handleFileLoadedFromDevice(file) {
  if (!file) return;
  const filename = file.name;
  const isEpub = /\.epub$/i.test(filename) || (file.type && file.type.includes('epub'));
  const isJson = /\.json$/i.test(filename) || (file.type && file.type.includes('json'));

  if (isEpub) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsedBook = await parseEpubFile(e.target.result, filename);
        addSingleManuscriptToSession(parsedBook, filename);
        showToast(`Loaded eBook "${parsedBook.title}" from device!`);
      } catch (err) {
        console.error("EPUB load error:", err);
        alert(`Could not load EPUB from device: ${err.message || 'Invalid or corrupted EPUB file.'}`);
      }
      if (DOM.fileInputLoadDevice) DOM.fileInputLoadDevice.value = '';
    };
    reader.onerror = () => {
      alert("Error reading file from device.");
      if (DOM.fileInputLoadDevice) DOM.fileInputLoadDevice.value = '';
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rawText = e.target.result;
      const trimmed = (rawText || '').trim();

      // Check if file is a JSON full session backup
      if (isJson || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && (parsed.sessionType === 'full_session_instance' || (parsed.books && Array.isArray(parsed.books) && parsed.settings))) {
            openBackupInspectModal(parsed, `Device: ${filename}`);
            showToast(`Loaded backup file "${filename}" from device`);
            if (DOM.fileInputLoadDevice) DOM.fileInputLoadDevice.value = '';
            return;
          }
        } catch (jErr) {
          // not valid full backup json, proceed to parseManuscriptFile
        }
      }

      const result = parseManuscriptFile(rawText, filename);
      if (result.type === 'single') {
        addSingleManuscriptToSession(result.book, filename);
        showToast(`Loaded manuscript "${result.book.title || filename}" from device!`);
      } else if (result.type === 'multiple') {
        showImportManuscriptPicker(result.books, filename);
        showToast(`Loaded ${result.books.length} manuscripts from device file "${filename}"`);
      }
    } catch (err) {
      console.error("Load from device error:", err);
      alert(`Could not load file from device: ${err.message || 'Invalid or unrecognized file format.'}`);
    }
    if (DOM.fileInputLoadDevice) DOM.fileInputLoadDevice.value = '';
  };
  reader.onerror = () => {
    alert("Error reading file from device.");
    if (DOM.fileInputLoadDevice) DOM.fileInputLoadDevice.value = '';
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
    synopsis: '',
    tags: [],
    folderId: null,
    category: '',
    starred: false,
    archived: false,
    pages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
  };

  const firstPage = {
    id: 'page_' + Date.now(),
    number: 1,
    description: '',
    tags: [],
    chunks: [],
    locked: false,
    targetWordCount: (state.settings && state.settings.wordsPerPage) || 300,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
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
    tags: [],
    chunks: [],
    locked: false,
    targetWordCount: (state.settings && state.settings.wordsPerPage) || 300,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: CURRENT_SCHEMA_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION
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

// ─── ASYNC EVENT LOOP YIELDING & EXPORT PROGRESS ────────────
function yieldToMain() {
  if (typeof globalThis.scheduler !== 'undefined' && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

const ExportProgress = {
  active: false,
  show(title = "Compiling Document...", icon = "⏳") {
    this.active = true;
    if (DOM.exportProgressModal) {
      DOM.exportProgressModal.classList.remove('hidden');
      if (DOM.exportProgressTitle) DOM.exportProgressTitle.textContent = title;
      if (DOM.exportProgressIcon) DOM.exportProgressIcon.textContent = icon;
      if (DOM.exportProgressStatus) DOM.exportProgressStatus.textContent = "Initializing async compilation...";
      if (DOM.exportProgressBarFill) DOM.exportProgressBarFill.style.width = '0%';
      if (DOM.exportProgressPercent) DOM.exportProgressPercent.textContent = '0%';
    }
  },
  update(percent, statusText) {
    if (!this.active) return;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (DOM.exportProgressBarFill) DOM.exportProgressBarFill.style.width = `${clamped}%`;
    if (DOM.exportProgressPercent) DOM.exportProgressPercent.textContent = `${clamped}%`;
    if (DOM.exportProgressStatus && statusText) DOM.exportProgressStatus.textContent = statusText;
  },
  hide(delay = 500) {
    this.active = false;
    setTimeout(() => {
      if (DOM.exportProgressModal) {
        DOM.exportProgressModal.classList.add('hidden');
      }
    }, delay);
  }
};

// ─── DEBOUNCE UTILITY ───────────────────────────────────────
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// ─── HIGH-PERFORMANCE WORD COUNT CACHE ───────────────────────
// Provides O(1) word count lookups on large manuscripts (>30k-50k words)
const PageWordCountCache = {
  cache: new Map(), // pageId -> { chunkCount: N, totalChars: M, wordCount: W }

  get(page) {
    if (!page || !Array.isArray(page.chunks)) return 0;
    const pageId = page.id || `temp_page_${page.number || 0}`;
    const chunkCount = page.chunks.length;
    let totalChars = 0;
    for (let i = 0; i < chunkCount; i++) {
      const c = page.chunks[i];
      totalChars += (typeof c === 'string' ? c.length : (c && c.text ? c.text.length : 0));
    }

    const cached = this.cache.get(pageId);
    if (cached && cached.chunkCount === chunkCount && cached.totalChars === totalChars) {
      return cached.wordCount;
    }

    const fullText = page.chunks.map(chunk => getChunkText(chunk)).join('');
    const count = countWords(fullText);
    this.cache.set(pageId, { chunkCount, totalChars, wordCount: count });
    return count;
  },

  invalidate(pageId) {
    if (pageId) this.cache.delete(pageId);
    else this.cache.clear();
  }
};

// ─── TEXT ANALYSIS & COMPUTATION WEB WORKER BRIDGE ──────────
const TextWorkerBridge = {
  worker: null,
  reqId: 0,
  pending: new Map(),
  isSupported: typeof window !== 'undefined' && typeof window.Worker !== 'undefined',

  init() {
    if (!this.isSupported) return;
    try {
      this.worker = new Worker('text-worker.js');
      this.worker.onmessage = (e) => {
        const { id, success, result, error } = e.data || {};
        if (!id) return;
        const handler = this.pending.get(id);
        if (!handler) return;
        this.pending.delete(id);
        if (success) handler.resolve(result);
        else handler.reject(new Error(error || 'Worker error'));
      };
      this.worker.onerror = (err) => {
        console.warn('[TextWorker] Worker runtime error, fallback active:', err);
      };
    } catch (e) {
      console.warn('[TextWorker] Unable to initialize worker thread, fallback active:', e);
      this.worker = null;
    }
  },

  postTask(type, payload) {
    const id = ++this.reqId;
    if (this.worker) {
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, type, payload });
      });
    }
    // Fallback if worker not available
    return Promise.resolve(this.fallback(type, payload));
  },

  async analyzeManuscript(book, targetWordsPerPage = 300) {
    return this.postTask('ANALYZE_MANUSCRIPT', { book, wordsPerPage: targetWordsPerPage });
  },

  async analyzeText(text, title) {
    return this.postTask('ANALYZE_TEXT', { text, title });
  },

  async searchManuscript(book, query, options = {}) {
    return this.postTask('SEARCH_MANUSCRIPT', { book, query, options });
  },

  async compileExport(book, format) {
    return this.postTask('COMPILE_EXPORT', { book, format });
  },

  async formatBackdrop(text, maxChars) {
    return this.postTask('FORMAT_BACKDROP', { text, maxChars });
  },

  fallback(type, payload) {
    if (type === 'ANALYZE_MANUSCRIPT') {
      const book = payload.book || {};
      const pages = Array.isArray(book.pages) ? book.pages : [];
      let combined = '';
      const pagesAnalysis = pages.map((p, idx) => {
        const chunks = Array.isArray(p.chunks) ? p.chunks : [];
        const txt = chunks.map(c => getChunkText(c)).join('');
        const words = countWords(txt);
        combined += txt + '\n\n';
        const target = p.targetWordCount || payload.wordsPerPage || 300;
        return {
          pageId: p.id || `page_${idx}`,
          pageNumber: p.number || (idx + 1),
          description: p.description || '',
          words,
          characters: txt.length,
          targetWords: target,
          progressPercent: Math.min(100, Math.round((words / Math.max(1, target)) * 100)),
          locked: Boolean(p.locked)
        };
      });

      const words = countWords(combined);
      const sentences = Math.max(1, (combined.match(/[.!?]+(?:\s+|\n+|$)/g) || []).length);
      const chars = combined.length;
      const readingTime = Math.ceil(words / 225) || 1;
      const speakingTime = Math.ceil(words / 130) || 1;
      const uniqueWords = new Set((combined.toLowerCase().match(/\S+/g) || [])).size;

      return {
        title: book.title || 'Manuscript',
        totalWords: words,
        totalCharsWithSpaces: chars,
        totalCharsNoSpaces: combined.replace(/\s/g, '').length,
        totalSentences: sentences,
        totalParagraphs: Math.max(1, (combined.split(/\n+/).filter(p => p.trim())).length),
        fleschReadingEase: Math.max(0, Math.min(100, Math.round(206.835 - (1.015 * (words / sentences)) - (84.6 * 1.4)))),
        readingEaseLabel: 'Standard',
        readingEaseColor: '#7ee896',
        fleschGradeLevel: Math.max(0, Math.round((0.39 * (words / sentences)) + 1.0)),
        readingTimeMinutes: readingTime,
        readingTimeSeconds: Math.round((words / 225) * 60),
        speakingTimeMinutes: speakingTime,
        speakingTimeSeconds: Math.round((words / 130) * 60),
        uniqueWordsCount: uniqueWords,
        lexicalDensity: words > 0 ? Math.round((uniqueWords / words) * 100) : 0,
        averageWordsPerSentence: sentences > 0 ? Math.round((words / sentences) * 10) / 10 : 0,
        totalPages: pages.length,
        pages: pagesAnalysis,
        averageWordsPerPage: pages.length > 0 ? Math.round(words / pages.length) : 0
      };
    }

    if (type === 'SEARCH_MANUSCRIPT') {
      const book = payload.book || {};
      const q = (payload.query || '').trim().toLowerCase();
      if (!q || !Array.isArray(book.pages)) {
        return { query: payload.query || '', matches: [], totalMatches: 0, matchedPagesCount: 0 };
      }
      const matches = [];
      const matchedPages = new Set();
      book.pages.forEach(p => {
        const fullText = (p.chunks || []).map(c => getChunkText(c)).join('');
        const desc = (p.description || '').trim();
        const lowerText = fullText.toLowerCase();
        let idx = 0;
        while ((idx = lowerText.indexOf(q, idx)) !== -1) {
          matchedPages.add(p.id);
          const start = Math.max(0, idx - 40);
          const end = Math.min(fullText.length, idx + q.length + 40);
          let snippet = fullText.substring(start, end).replace(/[\r\n]+/g, ' ');
          if (start > 0) snippet = '...' + snippet;
          if (end < fullText.length) snippet = snippet + '...';
          matches.push({
            pageId: p.id,
            pageNumber: p.number,
            pageDescription: desc,
            matchText: q,
            fullSnippet: snippet
          });
          idx += Math.max(1, q.length);
        }
      });
      return { query: payload.query, matches, totalMatches: matches.length, matchedPagesCount: matchedPages.size };
    }

    if (type === 'COMPILE_EXPORT') {
      return compileManuscriptText(payload.format || 'txt');
    }

    return null;
  }
};

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
  return PageWordCountCache.get(page);
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
    PageWordCountCache.invalidate(activePage.id);
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
      saveStorage(true, false);
      if (Boolean(state.settings.typewriterAnim)) {
        renderAll(true);
      } else {
        // High-performance differential DOM update: append chunk element directly without tearing down 300+ sidebar nodes
        appendChunkToInkStream(newChunk);
        updateSidebarActivePageBadge(activePage.id, pageWords);
        updateStats();
      }
    }
  }

  if (DOM.writingSurface) {
    scrollToPageBottom(true);
  }

  DOM.draftInput.focus();
}

function getActiveTextBottomElement() {
  const cursor = document.getElementById('ink-cursor');
  if (cursor) return cursor;
  
  const ghost = document.getElementById('ink-ghost');
  if (ghost) return ghost;

  if (DOM.inkStream) {
    const lastRow = DOM.inkStream.querySelector('.ink-chunk-row:last-child');
    if (lastRow) return lastRow;
    const lastChunk = DOM.inkStream.querySelector('.ink-chunk:last-child');
    if (lastChunk) return lastChunk;
    return DOM.inkStream;
  }
  return null;
}

function updateWritingSurfacePadding() {
  if (!DOM.writingSurface) return;
  const windowHeight = window.innerHeight;
  const targetPadding = Math.max(260, windowHeight - 120);
  DOM.writingSurface.style.paddingBottom = `${targetPadding}px`;
}

function scrollToPageBottom(smooth = true) {
  if (!DOM.writingSurface) return;
  const page = getCurrentPage();
  if (page && page.locked) return;

  updateWritingSurfacePadding();

  const runAlignment = () => {
    if (!DOM.writingSurface) return;
    const draftBox = document.getElementById('draft-box');
    if (!draftBox) return;

    const lastTarget = getActiveTextBottomElement();
    if (!lastTarget) return;

    const draftRect = draftBox.getBoundingClientRect();
    const targetRect = lastTarget.getBoundingClientRect();

    if (!targetRect || (targetRect.top === 0 && targetRect.bottom === 0)) return;

    const isMobile = window.innerWidth <= 600;
    const targetGap = isMobile ? 12 : 16;

    const desiredBottom = draftRect.top - targetGap;
    const currentBottom = targetRect.bottom;
    const delta = currentBottom - desiredBottom;

    if (Math.abs(delta) > 0.5) {
      const currentScroll = DOM.writingSurface.scrollTop;
      const maxScroll = DOM.writingSurface.scrollHeight - DOM.writingSurface.clientHeight;
      const newScrollTop = Math.min(maxScroll, Math.max(0, currentScroll + delta));

      DOM.writingSurface.scrollTo({
        top: newScrollTop,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  };

  requestAnimationFrame(runAlignment);
  if (smooth) {
    setTimeout(runAlignment, 120);
    setTimeout(runAlignment, 250);
  }
}

function adjustDraftInputHeight() {
  if (!DOM.draftInput) return;
  DOM.draftInput.style.height = 'auto';
  const singleRowHeight = 28;
  const newHeight = Math.min(Math.max(DOM.draftInput.scrollHeight, singleRowHeight), 180);
  DOM.draftInput.style.height = `${newHeight}px`;

  if (DOM.draftInputBackdrop) {
    DOM.draftInputBackdrop.scrollTop = DOM.draftInput.scrollTop;
  }

  updateWritingSurfacePadding();
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
    li.dataset.pageId = page.id;
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
      saveStorage();
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

function updateSidebarActivePageBadge(pageId, newWordCount) {
  if (!DOM.pagesList || !pageId) return;
  const item = DOM.pagesList.querySelector(`li[data-page-id="${pageId}"]`);
  if (item) {
    const badge = item.querySelector('.page-badge');
    if (badge) {
      badge.textContent = `${newWordCount}w`;
    }
  }
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

async function performBookSearch(query) {
  const q = (query || '').trim();
  if (!q) {
    if (DOM.btnClearBookSearch) DOM.btnClearBookSearch.classList.add('hidden');
    return;
  }

  if (DOM.btnClearBookSearch) DOM.btnClearBookSearch.classList.remove('hidden');

  const book = getActiveBook();
  if (!book) return;

  try {
    const searchData = await TextWorkerBridge.searchManuscript(book, q);

    // Group matches by page
    const pageMap = new Map();
    (searchData.matches || []).forEach(m => {
      if (!pageMap.has(m.pageId)) {
        pageMap.set(m.pageId, {
          pageId: m.pageId,
          pageNumber: m.pageNumber,
          pageDescription: m.pageDescription || '',
          snippets: [],
          descMatch: false
        });
      }
      const pageEntry = pageMap.get(m.pageId);
      if (pageEntry.snippets.length < 3) {
        pageEntry.snippets.push({
          text: m.fullSnippet || `${m.beforeSnippet || ''}${m.matchText || q}${m.afterSnippet || ''}`,
          matchTerm: m.matchText || q
        });
      }
    });

    // Also match page descriptions
    const lowerQ = q.toLowerCase();
    book.pages.forEach(p => {
      if (p.description && p.description.toLowerCase().includes(lowerQ)) {
        if (!pageMap.has(p.id)) {
          pageMap.set(p.id, {
            pageId: p.id,
            pageNumber: p.number,
            pageDescription: p.description,
            snippets: [],
            descMatch: true
          });
        } else {
          pageMap.get(p.id).descMatch = true;
        }
      }
    });

    const results = Array.from(pageMap.values());
    openSearchResultsModal(q, results);
  } catch (err) {
    console.warn('[Search] Error in off-thread search, fallback active:', err);
    // In-thread fallback
    const fallbackData = TextWorkerBridge.fallback('SEARCH_MANUSCRIPT', { book, query: q });
    const results = (fallbackData && fallbackData.matches) ? fallbackData.matches : [];
    openSearchResultsModal(q, results);
  }
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

// ─── MANUSCRIPT READABILITY & ANALYSIS (OFF-THREAD WORKER) ───

async function openAnalysisModal() {
  if (!DOM.analysisModal) return;
  const book = getActiveBook();
  if (!book) return;

  DOM.analysisModal.classList.remove('hidden');
  if (DOM.analysisModalTitle) {
    DOM.analysisModalTitle.textContent = `Analysis: "${book.title}"`;
  }
  if (DOM.analysisFleschScore) DOM.analysisFleschScore.textContent = '...';
  if (DOM.analysisFleschLabel) DOM.analysisFleschLabel.textContent = 'Analyzing off-thread in Web Worker...';

  try {
    const analysis = await TextWorkerBridge.analyzeManuscript(book, state.settings.wordsPerPage || 300);
    renderAnalysisData(analysis);
  } catch (err) {
    console.warn('[Analysis] Error computing analysis via worker, fallback active:', err);
    const fallback = TextWorkerBridge.fallback('ANALYZE_MANUSCRIPT', { book, wordsPerPage: state.settings.wordsPerPage || 300 });
    renderAnalysisData(fallback);
  }
}

function renderAnalysisData(analysis) {
  if (!analysis) return;
  if (DOM.analysisFleschScore) {
    DOM.analysisFleschScore.textContent = analysis.fleschReadingEase;
    DOM.analysisFleschScore.style.color = analysis.readingEaseColor || '#7ee896';
  }
  if (DOM.analysisFleschLabel) {
    DOM.analysisFleschLabel.textContent = analysis.readingEaseLabel || 'Standard';
  }
  if (DOM.analysisGradeLevel) {
    DOM.analysisGradeLevel.textContent = `Grade ${analysis.fleschGradeLevel || 0}`;
  }

  if (DOM.analysisStatWords) DOM.analysisStatWords.textContent = (analysis.totalWords || 0).toLocaleString();
  if (DOM.analysisStatChars) DOM.analysisStatChars.textContent = (analysis.totalCharsWithSpaces || 0).toLocaleString();
  if (DOM.analysisStatSentences) DOM.analysisStatSentences.textContent = (analysis.totalSentences || 0).toLocaleString();
  if (DOM.analysisStatParagraphs) DOM.analysisStatParagraphs.textContent = (analysis.totalParagraphs || 0).toLocaleString();
  if (DOM.analysisStatReadTime) DOM.analysisStatReadTime.textContent = `${analysis.readingTimeMinutes} min (${analysis.readingTimeSeconds}s)`;
  if (DOM.analysisStatSpeakTime) DOM.analysisStatSpeakTime.textContent = `${analysis.speakingTimeMinutes} min (${analysis.speakingTimeSeconds}s)`;
  if (DOM.analysisStatUniqueWords) DOM.analysisStatUniqueWords.textContent = `${(analysis.uniqueWordsCount || 0).toLocaleString()} (${analysis.lexicalDensity}% density)`;
  if (DOM.analysisStatWordsSentence) DOM.analysisStatWordsSentence.textContent = analysis.averageWordsPerSentence;

  if (DOM.analysisPagesCountBadge) {
    DOM.analysisPagesCountBadge.textContent = `${analysis.totalPages || 0} Pages (${analysis.averageWordsPerPage || 0} w/page avg)`;
  }

  if (DOM.analysisPagesBreakdownList) {
    DOM.analysisPagesBreakdownList.innerHTML = '';
    (analysis.pages || []).forEach(p => {
      const li = document.createElement('li');
      li.className = 'backup-inspect-book-row';
      li.style.cursor = 'pointer';
      li.title = 'Click to jump to this page';
      li.onclick = () => {
        state.currentPageId = p.pageId;
        saveStorage();
        renderAll();
        closeAnalysisModal();
      };

      const desc = p.description ? ` "${p.description}"` : '';
      li.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div>
            <strong style="color:#ffffff;">Page ${p.pageNumber}${desc}</strong>
            <div style="font-size:11px; color:#888; margin-top:2px;">
              ${p.words} words • ${p.characters} chars ${p.locked ? '• 🔒 Locked' : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-size:12px; font-weight:700; color:${p.progressPercent >= 100 ? '#7ee896' : '#e5a93b'};">
              ${p.progressPercent}% of target
            </span>
            <div style="font-size:10px; color:#666;">Target: ${p.targetWords}w</div>
          </div>
        </div>
      `;
      DOM.analysisPagesBreakdownList.appendChild(li);
    });
  }
}

function closeAnalysisModal() {
  if (DOM.analysisModal) DOM.analysisModal.classList.add('hidden');
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

function appendChunkToInkStream(chunkItem) {
  if (!DOM.inkStream) return;
  const text = getChunkText(chunkItem);
  const ts = getChunkTimestamp(chunkItem);
  const timeStr = formatChunkTime(ts);
  const showTS = Boolean(state.settings.showTimestamps);

  const anchor = document.getElementById('ink-cursor-anchor');

  if (showTS) {
    const row = document.createElement('div');
    row.className = 'ink-chunk-row new-strike';

    const timeSpan = document.createElement('span');
    timeSpan.className = timeStr ? 'commit-timestamp' : 'commit-timestamp muted';
    timeSpan.textContent = timeStr || '—';
    if (ts) timeSpan.title = `Committed at ${new Date(ts).toLocaleString()}`;
    row.appendChild(timeSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'ink-chunk';
    textSpan.textContent = text;
    row.appendChild(textSpan);

    if (anchor) DOM.inkStream.insertBefore(row, anchor);
    else DOM.inkStream.appendChild(row);
  } else {
    const span = document.createElement('span');
    span.className = 'ink-chunk new-strike';
    span.textContent = text;

    if (anchor) DOM.inkStream.insertBefore(span, anchor);
    else DOM.inkStream.appendChild(span);
  }

  const ghost = document.getElementById('ink-ghost');
  if (ghost) ghost.textContent = '';
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

  // Render Previous Page Ghost Context (for continuity in long manuscripts/novels)
  if (DOM.prevPageGhost) {
    const showGhost = Boolean(state.settings.prevPageGhost) && !page.locked && page.number > 1;
    if (showGhost) {
      const prevPage = book.pages.find(p => p.number === page.number - 1);
      if (prevPage && prevPage.chunks && prevPage.chunks.length > 0) {
        const fullPrevText = prevPage.chunks.map(c => getChunkText(c)).join('').trim();
        if (fullPrevText) {
          // Extract the last 1-2 sentences (up to ~180 chars)
          const sentences = fullPrevText.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [fullPrevText];
          const tail = sentences.slice(-2).join('').trim() || fullPrevText.slice(-180);
          DOM.prevPageGhost.textContent = `... ${tail}`;
          DOM.prevPageGhost.title = `Context from Page ${prevPage.number}`;
          DOM.prevPageGhost.classList.remove('hidden');
        } else {
          DOM.prevPageGhost.classList.add('hidden');
        }
      } else {
        DOM.prevPageGhost.classList.add('hidden');
      }
    } else {
      DOM.prevPageGhost.classList.add('hidden');
    }
  }

  if (DOM.inkStream) {
    DOM.inkStream.innerHTML = '';
    DOM.inkStream.classList.toggle('has-timestamps', showTS);

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
      const replaySpeed = Math.min(10, Math.max(1, parseInt(state.settings.replaySpeed, 10) || 1));

      if (snapshots && snapshots.length > 0) {
        let stepIdx = 0;

        function replayNextSnapshot() {
          if (stepIdx < snapshots.length) {
            const snap = snapshots[stepIdx];
            stepIdx++;
            animatedTextElem.textContent = snap.text;
            playKeyClickSound();

            if (DOM.writingSurface) {
              scrollToPageBottom(false);
            }
            updateDraftInputCursorAlignment();

            const rawDelay = (stepIdx < snapshots.length) ? snapshots[stepIdx].delay : 0;
            const nextDelay = rawDelay > 0 ? Math.max(1, Math.round(rawDelay / replaySpeed)) : 0;
            activeTypewriterTimer = setTimeout(replayNextSnapshot, nextDelay);
          } else {
            activeTypewriterTimer = null;
            animatedTextElem.textContent = animatedFullText;
            playCarriageReturnBell();
            if (DOM.writingSurface) {
              scrollToPageBottom(true);
            }
            if (pendingRemoteSnapshot) {
              const pending = pendingRemoteSnapshot;
              pendingRemoteSnapshot = null;
              applyRemoteSnapshot(pending);
            }
            if (wpm > 0) {
              const speedTag = replaySpeed > 1 ? ` (${replaySpeed}x replay)` : '';
              showToast(`⚡ Committed at ${wpm} WPM!${speedTag}`);
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
              scrollToPageBottom(false);
            }
            updateDraftInputCursorAlignment();

            const rawDelay = 35 + Math.floor(Math.random() * 25);
            const delay = Math.max(1, Math.round(rawDelay / replaySpeed));
            activeTypewriterTimer = setTimeout(typeNextChar, delay);
          } else {
            activeTypewriterTimer = null;
            playCarriageReturnBell();
            if (DOM.writingSurface) {
              scrollToPageBottom(true);
            }
            if (pendingRemoteSnapshot) {
              const pending = pendingRemoteSnapshot;
              pendingRemoteSnapshot = null;
              applyRemoteSnapshot(pending);
            }
            if (wpm > 0) {
              const speedTag = replaySpeed > 1 ? ` (${replaySpeed}x replay)` : '';
              showToast(`⚡ Committed at ${wpm} WPM!${speedTag}`);
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
          scrollToPageBottom(true);
        }
      } else if (lastChunkIsNew && !page.locked) {
        scrollToPageBottom(true);
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
  if (!DOM.draftInput) return;

  // On small mobile screens (such as portrait iPhone / phones <= 600px),
  // keep text aligned cleanly without horizontal indent offset to prevent text truncation
  if (window.innerWidth <= 600) {
    DOM.draftInput.style.textIndent = '0px';
    DOM.draftInput.style.paddingLeft = '0px';
    if (DOM.draftInputBackdrop) {
      DOM.draftInputBackdrop.style.textIndent = '0px';
      DOM.draftInputBackdrop.style.paddingLeft = '0px';
    }
    return;
  }

  const inkCursor = document.getElementById('ink-cursor-anchor') || document.getElementById('ink-cursor');
  if (!inkCursor || !DOM.pageSheet || !DOM.draftBox) return;

  const pageRect = DOM.pageSheet.getBoundingClientRect();
  const cursorRect = inkCursor.getBoundingClientRect();
  const draftBoxRect = DOM.draftBox.getBoundingClientRect();

  if (!pageRect.width || !cursorRect.height) return;

  // Measure X position of inkCursor relative to draft box text inner padding (20px)
  const cursorX = cursorRect.left - (draftBoxRect.left + 20);

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
}

function applyFont() {
  document.body.className = document.body.className.replace(/\bfont-\S+/g, '');
  document.body.classList.add(`font-${state.settings.font}`);
  if (DOM.settingFont) DOM.settingFont.value = state.settings.font;
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
  if (DOM.settingReplaySpeed) {
    const spd = Math.min(10, Math.max(1, parseInt(state.settings.replaySpeed, 10) || 1));
    DOM.settingReplaySpeed.value = spd;
    if (DOM.replaySpeedVal) {
      DOM.replaySpeedVal.textContent = `${spd}x${spd === 1 ? ' (Default)' : ''}`;
    }
    document.querySelectorAll('.replay-speed-tick').forEach(tick => {
      tick.classList.toggle('active', parseInt(tick.dataset.speed, 10) === spd);
    });
  }
  if (DOM.settingReplaySpeedRow) {
    DOM.settingReplaySpeedRow.classList.toggle('is-disabled', !Boolean(state.settings.typewriterAnim));
  }
  if (DOM.settingAutoSpace) DOM.settingAutoSpace.checked = Boolean(state.settings.autoAddSpace);
  if (DOM.settingShowTimestamps) DOM.settingShowTimestamps.checked = Boolean(state.settings.showTimestamps);
  if (DOM.btnToggleTimestamps) DOM.btnToggleTimestamps.classList.toggle('active', Boolean(state.settings.showTimestamps));
  if (DOM.settingPrevPageGhost) DOM.settingPrevPageGhost.checked = Boolean(state.settings.prevPageGhost);
  updateCommitHint();
}

let toastDismissTimer = null;
let topSyncTimer = null;

function showTopSyncNotification(msg = "Synced with Firestore") {
  if (!DOM.syncToast) return;
  if (DOM.syncToastMsg) DOM.syncToastMsg.textContent = msg;
  DOM.syncToast.classList.add('show');
  if (topSyncTimer) clearTimeout(topSyncTimer);
  topSyncTimer = setTimeout(() => {
    if (DOM.syncToast) DOM.syncToast.classList.remove('show');
  }, 2400);
}

function showToast(msg) {
  if (!DOM.toast) return;
  DOM.toast.textContent = msg;
  DOM.toast.classList.add('show');
  if (toastDismissTimer) clearTimeout(toastDismissTimer);
  toastDismissTimer = setTimeout(() => {
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

async function exportManuscript(format) {
  if (format === 'pdf') {
    await exportManuscriptPDF();
    return;
  }
  if (format === 'epub') {
    await exportManuscriptEPUB();
    return;
  }
  if (format === 'zip') {
    await exportAllBooksZip();
    return;
  }
  if (format === 'json') {
    exportSingleManuscriptJSON();
    return;
  }

  const book = getActiveBook();
  let content = '';

  if (TextWorkerBridge && TextWorkerBridge.worker) {
    try {
      content = await TextWorkerBridge.compileExport(book, format);
    } catch (e) {
      content = compileManuscriptText(format);
    }
  } else {
    content = compileManuscriptText(format);
  }

  const ext = format === 'md' ? 'md' : 'txt';
  const cleanTitle = (book ? book.title : 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  triggerFileDownload(filename, content, 'text/plain;charset=utf-8');

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  showToast(`Exported ${filename}`);
  playCarriageReturnBell();
}

async function exportManuscriptPDF() {
  const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if (!jsPDFClass) {
    showToast("PDF engine is initializing, please try again in a moment.");
    return;
  }

  const book = getActiveBook();
  const cleanTitle = (book ? book.title : 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  if (DOM.saveDeviceModal) DOM.saveDeviceModal.classList.add('hidden');

  ExportProgress.show(`Exporting PDF: "${book ? book.title : 'Manuscript'}"`, "📄");

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
    const totalPages = pages.length;

    function drawRunningHeader(page, isContinuation = false) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const headerTitle = bookTitle.toUpperCase() + (isContinuation ? ' (CONT.)' : '');
      doc.text(headerTitle, margin, 46);

      const headerDesc = (page && page.description && page.description.trim()) ? ` [${page.description.trim().toUpperCase()}]` : '';
      const headerRight = `PAGE ${page ? (page.number || 1) : 1}${headerDesc}`;
      const rightW = doc.getTextWidth(headerRight);
      doc.text(headerRight, pageWidth - margin - rightW, 46);

      doc.setDrawColor(210, 205, 195);
      doc.setLineWidth(0.75);
      doc.line(margin, 54, pageWidth - margin, 54);
    }

    // Process pages in asynchronous batches to prevent main-thread threadlocks
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const page = pages[pageIdx];
      const progressPercent = (pageIdx / totalPages) * 75;
      ExportProgress.update(progressPercent, `Formatting page ${pageIdx + 1} of ${totalPages}...`);
      await yieldToMain();

      if (pdfPageCount > 0) {
        doc.addPage();
      }
      pdfPageCount++;

      drawRunningHeader(page, false);

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
        doc.text(`NOTE TO SELF MANUSCRIPT  •  ${dateStr.toUpperCase()}`, margin, cursorY);
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
        let lineCounter = 0;
        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
          const chunkItem = chunks[cIdx];
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
              drawRunningHeader(page, true);
              cursorY = margin + 14;
            }
            doc.text(`[${timeStr}]`, margin, cursorY);
            cursorY += 13;
            doc.setFont('courier', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(28, 28, 28);
          }

          const paragraphs = text.split('\n');
          for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
            const para = paragraphs[pIdx];
            if (para === '') {
              cursorY += lineHeight * 0.7;
              continue;
            }
            const lines = doc.splitTextToSize(para, contentWidth);
            for (let lIdx = 0; lIdx < lines.length; lIdx++) {
              const line = lines[lIdx];
              lineCounter++;
              if (lineCounter % 35 === 0) {
                await yieldToMain();
              }

              if (cursorY + lineHeight > bottomLimit) {
                doc.addPage();
                pdfPageCount++;
                drawRunningHeader(page, true);
                cursorY = margin + 14;
                doc.setFont('courier', 'normal');
                doc.setFontSize(11);
                doc.setTextColor(28, 28, 28);
              }
              doc.text(line, margin, cursorY);
              cursorY += lineHeight;
            }
            if (pIdx < paragraphs.length - 1) {
              cursorY += 4;
            }
          }
        }
      }
    }

    ExportProgress.update(85, "Generating PDF document blob...");
    await yieldToMain();

    const pdfBlob = doc.output('blob');
    ExportProgress.update(100, "Download starting!");

    triggerFileDownload(filename, pdfBlob, 'application/pdf');
    showToast(`Exported ${filename}`);
    playCarriageReturnBell();
    ExportProgress.hide(600);
  } catch (err) {
    console.error('PDF export failed:', err);
    ExportProgress.hide(0);
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
    description: 'Created by Note to Self'
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
      setSafeSessionItem('google_drive_access_token', null);
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
    const { books: migratedBooks } = migrateBooksSchema(state.books);
    const migratedSettings = migrateSettingsSchema(state.settings);

    const backupData = JSON.stringify({
      version: CURRENT_SCHEMA_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      sessionType: 'full_session_instance',
      books: migratedBooks,
      settings: migratedSettings
    }, null, 2);

    const fileName = `typewriter_full_session_${new Date().toISOString().slice(0, 10)}.json`;

    const result = await uploadToGoogleDrive({
      name: fileName,
      content: backupData,
      mimeType: 'application/json',
      isDoc: false
    });

    showToast(`Full session/instance backup saved to Google Drive as "${result.name}"!`);
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
      setSafeSessionItem('google_drive_access_token', null);
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
    
    const isEpub = /\.epub$/i.test(file.name) || file.mimeType === 'application/epub+zip';
    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
    const isJson = file.name.endsWith('.json') || file.mimeType === 'application/json';

    if (isEpub) {
      const buffer = await downloadDriveFileBinary(file.id);
      const parsedBook = await parseEpubFile(buffer, file.name);
      addSingleManuscriptToSession(parsedBook, file.name);
      closeDriveModal();
      closeImportManuscriptModal();
      return;
    }

    const rawText = await downloadDriveFileText(file.id, file.mimeType);

    if (isJson) {
      const result = parseManuscriptFile(rawText, file.name);
      if (result.type === 'single') {
        addSingleManuscriptToSession(result.book, file.name);
        closeDriveModal();
        closeImportManuscriptModal();
      } else if (result.type === 'multiple') {
        closeDriveModal();
        showImportManuscriptPicker(result.books, file.name);
      }
      return;
    }

    // Google Doc, Plain Text (.txt), or Markdown (.md)
    const result = parseManuscriptFile(rawText, file.name);
    addSingleManuscriptToSession(result.book, file.name);
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
      const isDoc = f.mimeType === 'application/vnd.google-apps.document';
      const isEpub = f.name.endsWith('.epub') || f.mimeType === 'application/epub+zip';
      const isJson = f.name.endsWith('.json') || f.mimeType === 'application/json';
      const isBackup = isJson && (f.name.includes('session') || f.name.includes('backup'));
      const isMd = f.name.endsWith('.md') || f.mimeType === 'text/markdown';
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
            <strong class="backup-inspect-book-title" style="display:block; font-size:13px; color:#e0e0e0;">${f.name}</strong>
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
      const isDoc = f.mimeType === 'application/vnd.google-apps.document';
      const isEpub = f.name.endsWith('.epub') || f.mimeType === 'application/epub+zip';
      const isJson = f.name.endsWith('.json') || f.mimeType === 'application/json';
      const isMd = f.name.endsWith('.md') || f.mimeType === 'text/markdown';
      const isTxt = f.name.endsWith('.txt') || f.mimeType === 'text/plain';
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
      return f.name.endsWith('.json') || f.mimeType === 'application/json';
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
  lastFetchedDriveFiles = files || [];
  DOM.driveFilesList.innerHTML = '';
  DOM.driveFilesList.classList.remove('hidden');

  files.forEach(file => {
    const li = document.createElement('li');
    li.className = 'drive-file-item';

    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
    const isEpub = file.name.endsWith('.epub') || file.mimeType === 'application/epub+zip';
    const isJson = file.name.endsWith('.json') || file.mimeType === 'application/json';
    const isBackup = isJson && (file.name.includes('session') || file.name.includes('backup'));
    const isMd = file.name.endsWith('.md') || file.mimeType === 'text/markdown';
    const isTxt = file.name.endsWith('.txt') || file.mimeType === 'text/plain';

    const icon = isDoc ? '📄' : isEpub ? '📚' : isBackup ? '💾' : isMd ? '📝' : isJson ? '📋' : '📄';
    const typeLabel = isDoc ? 'Google Doc' : isEpub ? 'EPUB eBook' : isBackup ? 'Full Session Backup' : isMd ? 'Markdown' : isJson ? 'JSON Manuscript' : 'Text File';
    const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '';

    li.innerHTML = `
      <div class="drive-file-main">
        <span class="drive-file-icon">${icon}</span>
        <div class="drive-file-details">
          <span class="drive-file-name" title="${file.name}">${file.name}</span>
          <span class="drive-file-subtext">${typeLabel} • ${dateStr}</span>
        </div>
      </div>
      <div class="drive-file-actions">
        ${(isDoc || isEpub || isMd || isTxt || (isJson && !isBackup)) ? `<button class="btn-drive-action import btn-import-item" title="Import this manuscript into your current session as a new book">📥 Import</button>` : ''}
        ${isBackup ? `<button class="btn-drive-action import btn-import-item" title="Pick an individual book from this backup to add to your session">📥 Import Book...</button>` : ''}
        ${isJson ? `<button class="btn-drive-action primary btn-restore-item" title="Inspect and restore this full session backup">📂 Restore</button>` : ''}
        ${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" rel="noopener noreferrer" class="btn-drive-action" title="Open file in Google Drive">Open ↗</a>` : ''}
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

  // ESC Menu Button Click
  if (DOM.escHint) {
    DOM.escHint.onclick = () => {
      if (overlayOpen) closeOverlay();
      else openOverlay();
    };
  }

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
        const baseBottom = isMobile ? 10 : 24;
        draftOverlay.style.bottom = Math.max(baseBottom, diff + baseBottom) + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', adjustForKeyboard);
    window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    adjustForKeyboard();
  }

  // Mobile / Touchscreen Quick Tap-to-Commit & Tap-to-Focus
  if (DOM.writingSurface) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let lastTouchCommitTime = 0;

    const startTouch = (clientX, clientY) => {
      touchStartX = clientX;
      touchStartY = clientY;
      touchStartTime = Date.now();
      touchMoved = false;
    };

    const moveTouch = (clientX, clientY) => {
      if (touchMoved) return;
      const dx = clientX - touchStartX;
      const dy = clientY - touchStartY;
      // If moved more than 12px, treat as an intentional scroll/swipe gesture
      if (Math.hypot(dx, dy) > 12) {
        touchMoved = true;
      }
    };

    const endTouch = (target) => {
      if (Date.now() - lastTouchCommitTime < 400) return;
      if (touchMoved) return;

      const duration = Date.now() - touchStartTime;
      // Strict quick tap threshold: must be released in under 350ms
      if (duration >= 350) return;

      // Do not trigger if overlay, menus, or modals are active
      if (overlayOpen || (DOM.writingSurface && DOM.writingSurface.classList.contains('blurred'))) {
        return;
      }

      // Ignore if user tapped inside the draft box or interactive controls
      if (!target || target.closest('#draft-overlay') || target.closest('button, select, input, textarea, a, .modal-backdrop, #esc-overlay')) {
        return;
      }

      const rawText = DOM.draftInput ? DOM.draftInput.value : '';
      if (rawText && rawText.trim().length > 0) {
        lastTouchCommitTime = Date.now();
        commitDraft();
      } else {
        const page = getCurrentPage();
        if (page && !page.locked && DOM.draftInput) {
          DOM.draftInput.focus();
        }
      }
    };

    // Standard Touch Events (iOS, Android, PWAs)
    DOM.writingSurface.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) {
        touchMoved = true;
        return;
      }
      startTouch(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    DOM.writingSurface.addEventListener('touchmove', (e) => {
      if (touchMoved || e.touches.length !== 1) return;
      moveTouch(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    DOM.writingSurface.addEventListener('touchcancel', () => {
      touchMoved = true;
    }, { passive: true });

    DOM.writingSurface.addEventListener('touchend', (e) => {
      endTouch(e.target);
    });

    // Pointer Events for touch/pen input on hybrid and desktop touchscreen devices
    DOM.writingSurface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        startTouch(e.clientX, e.clientY);
      }
    }, { passive: true });

    DOM.writingSurface.addEventListener('pointermove', (e) => {
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && !touchMoved) {
        moveTouch(e.clientX, e.clientY);
      }
    }, { passive: true });

    DOM.writingSurface.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        touchMoved = true;
      }
    }, { passive: true });

    DOM.writingSurface.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        endTouch(e.target);
      }
    });

    // Fallback click listener (e.g. desktop mouse click to focus input)
    DOM.writingSurface.addEventListener('click', (e) => {
      // Suppress synthetic clicks that immediately follow a touch tap commit
      if (Date.now() - lastTouchCommitTime < 500) return;
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
        // Auto-scroll to ensure ghost text stays visible above the input box as it grows
        requestAnimationFrame(() => {
          scrollToPageBottom(false);
        });
      }
    };
  }

  // Window resize & orientation handlers to maintain visibility
  window.addEventListener('resize', () => {
    updateWritingSurfacePadding();
    scrollToPageBottom(false);
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateWritingSurfacePadding();
      scrollToPageBottom(false);
    }, 100);
  });

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
  if (DOM.btnEmailSignIn) DOM.btnEmailSignIn.onclick = () => handleEmailAuth('signin');
  if (DOM.btnEmailSignUp) DOM.btnEmailSignUp.onclick = () => handleEmailAuth('signup');
  if (DOM.btnLogout) DOM.btnLogout.onclick = handleSignOut;

  if (DOM.btnBackupCloud) DOM.btnBackupCloud.onclick = exportBackupFile;
  if (DOM.btnRestoreCloud) DOM.btnRestoreCloud.onclick = () => DOM.fileInputRestore && DOM.fileInputRestore.click();
  if (DOM.fileInputRestore) DOM.fileInputRestore.onchange = importBackupFile;

  // Save to / Load from Device Event Listeners
  if (DOM.btnSaveToDevice) DOM.btnSaveToDevice.onclick = openSaveDeviceModal;
  if (DOM.btnLoadFromDevice) DOM.btnLoadFromDevice.onclick = triggerLoadFromDevice;
  if (DOM.fileInputLoadDevice) {
    DOM.fileInputLoadDevice.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleFileLoadedFromDevice(file);
    };
  }
  if (DOM.btnCloseSaveDeviceModal) DOM.btnCloseSaveDeviceModal.onclick = closeSaveDeviceModal;
  if (DOM.saveDeviceModal) {
    DOM.saveDeviceModal.onclick = (e) => {
      if (e.target === DOM.saveDeviceModal) closeSaveDeviceModal();
    };
  }
  if (DOM.btnDeviceSaveTxt) DOM.btnDeviceSaveTxt.onclick = () => saveActiveBookToDevice('txt');
  if (DOM.btnDeviceSaveMd) DOM.btnDeviceSaveMd.onclick = () => saveActiveBookToDevice('md');
  if (DOM.btnDeviceSavePdf) DOM.btnDeviceSavePdf.onclick = () => saveActiveBookToDevice('pdf');
  if (DOM.btnDeviceSaveEpub) DOM.btnDeviceSaveEpub.onclick = () => saveActiveBookToDevice('epub');
  if (DOM.btnDeviceSaveJson) DOM.btnDeviceSaveJson.onclick = () => saveActiveBookToDevice('json');
  if (DOM.btnDeviceSaveZip) DOM.btnDeviceSaveZip.onclick = () => saveActiveBookToDevice('zip');
  if (DOM.btnDeviceSaveSession) DOM.btnDeviceSaveSession.onclick = () => saveActiveBookToDevice('session');

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

  // Nested Menu Accordion Handlers for Data & Storage
  const nestedGroupHeaders = document.querySelectorAll('.nested-group-header');
  nestedGroupHeaders.forEach(hdr => {
    hdr.onclick = () => {
      const parent = hdr.closest('.nested-group');
      if (parent) {
        const isOpen = parent.classList.toggle('open');
        hdr.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        updateToggleAllButtonText();
      }
    };
  });

  function updateToggleAllButtonText() {
    if (!DOM.btnToggleAllGroups) return;
    const groups = document.querySelectorAll('.nested-group');
    const allOpen = Array.from(groups).every(g => g.classList.contains('open'));
    DOM.btnToggleAllGroups.textContent = allOpen ? 'Collapse all' : 'Expand all';
  }

  if (DOM.btnToggleAllGroups) {
    DOM.btnToggleAllGroups.onclick = () => {
      const groups = document.querySelectorAll('.nested-group');
      const anyOpen = Array.from(groups).some(g => g.classList.contains('open'));
      groups.forEach(g => {
        g.classList.toggle('open', !anyOpen);
        const btn = g.querySelector('.nested-group-header');
        if (btn) btn.setAttribute('aria-expanded', !anyOpen ? 'true' : 'false');
      });
      DOM.btnToggleAllGroups.textContent = anyOpen ? 'Expand all' : 'Collapse all';
    };
  }

  // Keyboard accessibility for nested items
  document.querySelectorAll('.nested-item[role="button"]').forEach(item => {
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  if (DOM.btnDriveRestoreQuick) {
    DOM.btnDriveRestoreQuick.onclick = () => {
      openDriveModal();
      handleQuickRestoreFromDrive();
    };
  }
  if (DOM.btnQuickExportDoc) {
    DOM.btnQuickExportDoc.onclick = () => saveCurrentBookToDrive(true);
  }
  if (DOM.btnQuickCopyClip) {
    DOM.btnQuickCopyClip.onclick = copyManuscriptToClipboard;
  }

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
    showToast("Note to Self installed to desktop!");
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
    DOM.btnClearAll.onclick = async () => {
      if (confirm("Reset all books, pages, and preferences?\n\n(An automatic safety backup of ALL your manuscripts will be created and downloaded first in case this was an accident.)")) {
        // Automatically back up all manuscripts before resetting
        createSafetyBackupForReset(state.books, state.settings, 'Full Studio Reset');

        // Retain safety archive and reset other items
        const preservedArchive = [...memorySafetyArchive];
        SafeStorage.clear();

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
          replaySpeed: 1,
          autoAddSpace: false,
          settingsVersion: CURRENT_SETTINGS_VERSION,
          schemaVersion: CURRENT_SCHEMA_VERSION
        };
        applyTheme();
        applyFont();
        applySettingsUI();
        createNewBook("first note", false);
        saveSafetyArchive(preservedArchive);
        saveStorage(false);
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
      if (DOM.settingReplaySpeedRow) {
        DOM.settingReplaySpeedRow.classList.toggle('is-disabled', !Boolean(state.settings.typewriterAnim));
      }
      showToast(state.settings.typewriterAnim ? "Replay keystrokes ON" : "Replay keystrokes OFF");
    };
  }

  if (DOM.settingReplaySpeed) {
    DOM.settingReplaySpeed.oninput = (e) => {
      const spd = Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1));
      if (DOM.replaySpeedVal) {
        DOM.replaySpeedVal.textContent = `${spd}x${spd === 1 ? ' (Default)' : ''}`;
      }
      document.querySelectorAll('.replay-speed-tick').forEach(tick => {
        tick.classList.toggle('active', parseInt(tick.dataset.speed, 10) === spd);
      });
    };
    DOM.settingReplaySpeed.onchange = (e) => {
      const spd = Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1));
      state.settings.replaySpeed = spd;
      saveStorage();
      if (DOM.replaySpeedVal) {
        DOM.replaySpeedVal.textContent = `${spd}x${spd === 1 ? ' (Default)' : ''}`;
      }
      document.querySelectorAll('.replay-speed-tick').forEach(tick => {
        tick.classList.toggle('active', parseInt(tick.dataset.speed, 10) === spd);
      });
      showToast(`Replay speed set to ${spd}x`);
    };
  }

  document.querySelectorAll('.replay-speed-tick').forEach(tick => {
    tick.onclick = () => {
      const spd = parseInt(tick.dataset.speed, 10);
      if (spd >= 1 && spd <= 10) {
        state.settings.replaySpeed = spd;
        if (DOM.settingReplaySpeed) DOM.settingReplaySpeed.value = spd;
        if (DOM.replaySpeedVal) {
          DOM.replaySpeedVal.textContent = `${spd}x${spd === 1 ? ' (Default)' : ''}`;
        }
        document.querySelectorAll('.replay-speed-tick').forEach(t => {
          t.classList.toggle('active', parseInt(t.dataset.speed, 10) === spd);
        });
        saveStorage();
        showToast(`Replay speed set to ${spd}x`);
      }
    };
  });

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

  if (DOM.settingPrevPageGhost) {
    DOM.settingPrevPageGhost.onchange = (e) => {
      state.settings.prevPageGhost = e.target.checked;
      saveStorage();
      applySettingsUI();
      renderActivePage(false);
      showToast(state.settings.prevPageGhost ? "Previous page context ON" : "Previous page context OFF");
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
  if (DOM.btnExportZip) DOM.btnExportZip.onclick = () => exportManuscript('zip');
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

  // Manuscript Readability & Analysis Modal Listeners
  if (DOM.btnOpenAnalysis) DOM.btnOpenAnalysis.onclick = openAnalysisModal;
  if (DOM.btnCloseAnalysisModal) DOM.btnCloseAnalysisModal.onclick = closeAnalysisModal;
  if (DOM.btnDismissAnalysisModal) DOM.btnDismissAnalysisModal.onclick = closeAnalysisModal;
  if (DOM.analysisModal) {
    DOM.analysisModal.onclick = (e) => {
      if (e.target === DOM.analysisModal) closeAnalysisModal();
    };
  }
}

// ─── INITIALIZATION ─────────────────────────────────────────

function init() {
  initDOM();
  TextWorkerBridge.init();
  loadStorage();
  setupEventListeners();
  applySettingsUI();
  initFirebase();
  renderAll();
  updateSafetyArchiveBadge();
  checkPwaInstallState();
  updateNetworkStatus(navigator.onLine);

  // Register PWA Service Worker with in-app update notification listeners
  initServiceWorkerLifecycle();

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
