/**
 * Typewriter Studio - Application Core
 * Forward-Only Micro-Drafting Engine with Google Drive & Firebase Sync
 * Firebase Project: gen-lang-client-0081756947
 */

// Firebase Configuration for Project: gen-lang-client-0081756947
const firebaseConfig = {
  projectId: "gen-lang-client-0081756947",
  appId: "1:757537539472:web:f4cd43fd3f2d55f16d5f15",
  apiKey: "AIzaSyBlYBw9rVhOSCAFNco2tK7iu7TWvGnv3wk",
  authDomain: "gen-lang-client-0081756947.firebaseapp.com",
  storageBucket: "gen-lang-client-0081756947.firebasestorage.app",
  messagingSenderId: "757537539472",
  oAuthClientId: "757537539472-ms0a6ga5a47vd8jhbpfsntva2c6ilctf.apps.googleusercontent.com"
};

let auth = null;
let db = null;
let currentUser = null;
let cachedAccessToken = null; // In-memory OAuth access token for Google Drive API

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];

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

    // Google Drive Left Panel & Modal triggers
    btnDriveSaveBook: document.getElementById('btn-drive-save-book'),
    btnDriveSaveBackup: document.getElementById('btn-drive-save-backup'),
    btnDriveBrowserToggle: document.getElementById('btn-drive-browser-toggle'),

    // Google Drive Cloud Explorer Modal
    driveModal: document.getElementById('drive-modal'),
    btnCloseDriveModal: document.getElementById('btn-close-drive-modal'),
    driveAuthBox: document.getElementById('drive-auth-box'),
    driveStatusDot: document.getElementById('drive-status-dot'),
    driveAuthStatusText: document.getElementById('drive-auth-status-text'),
    btnDriveLogin: document.getElementById('btn-drive-login'),
    btnDriveUploadCurrent: document.getElementById('btn-drive-upload-current'),
    btnDriveUploadBackup: document.getElementById('btn-drive-upload-backup'),
    btnDriveRefresh: document.getElementById('btn-drive-refresh'),
    driveFilesList: document.getElementById('drive-files-list'),

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
    btnExportPdf: document.getElementById('btn-export-pdf'),
    btnExportDocx: document.getElementById('btn-export-docx'),
    btnExportTxt: document.getElementById('btn-export-txt'),
    btnExportMd: document.getElementById('btn-export-md'),
    btnCopyAll: document.getElementById('btn-copy-all'),
    btnExportDriveTxt: document.getElementById('btn-export-drive-txt'),
    btnExportDriveMd: document.getElementById('btn-export-drive-md'),

    toast: document.getElementById('toast')
  };
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
          updateDriveAuthUI();
          loadFromFirestore(user.uid);
        } else {
          currentUser = null;
          cachedAccessToken = null;
          renderUserUI();
          updateDriveAuthUI();
        }
      });
    } catch (e) {
      console.warn("Firebase Init:", e);
    }
  }
}

function handleGoogleSignIn(callback) {
  if (!auth) initFirebase();
  if (auth) {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/drive');

    return auth.signInWithPopup(provider).then((result) => {
      currentUser = result.user;
      const credential = result.credential;
      if (credential && credential.accessToken) {
        cachedAccessToken = credential.accessToken;
      }
      renderUserUI();
      updateDriveAuthUI();
      showToast(`Connected as ${result.user.displayName || 'Author'} with Google Drive!`);
      if (typeof callback === 'function') callback(cachedAccessToken);
      return cachedAccessToken;
    }).catch((error) => {
      console.error("Auth error:", error);
      showToast(`Sign in error: ${error.message}`);
      return null;
    });
  } else {
    showToast("Firebase Auth initializing...");
    return Promise.resolve(null);
  }
}

function handleSignOut() {
  if (auth) {
    auth.signOut().then(() => {
      cachedAccessToken = null;
      updateDriveAuthUI();
      showToast("Signed out.");
    });
  }
}

function renderUserUI() {
  if (currentUser) {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.add('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.remove('hidden');
    if (DOM.userName) DOM.userName.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    if (DOM.userAvatar && currentUser.photoURL) DOM.userAvatar.src = currentUser.photoURL;
    if (DOM.syncStatus) DOM.syncStatus.textContent = "☁️ Google Drive & Firestore";
  } else {
    if (DOM.btnGoogleSignIn) DOM.btnGoogleSignIn.classList.remove('hidden');
    if (DOM.userProfile) DOM.userProfile.classList.add('hidden');
  }
}

// ─── GOOGLE DRIVE INTEGRATION ───────────────────────────────

function getDriveAccessToken() {
  if (cachedAccessToken) return Promise.resolve(cachedAccessToken);
  return handleGoogleSignIn();
}

function updateDriveAuthUI() {
  if (!DOM.driveStatusDot || !DOM.driveAuthStatusText) return;
  if (currentUser && cachedAccessToken) {
    DOM.driveStatusDot.className = 'drive-status-indicator connected';
    DOM.driveAuthStatusText.textContent = `Connected: ${currentUser.email || currentUser.displayName || 'Active'}`;
    if (DOM.btnDriveLogin) DOM.btnDriveLogin.textContent = 'Re-authenticate';
  } else if (currentUser) {
    DOM.driveStatusDot.className = 'drive-status-indicator disconnected';
    DOM.driveAuthStatusText.textContent = `Signed in (${currentUser.email}) - Drive permission needed`;
    if (DOM.btnDriveLogin) DOM.btnDriveLogin.textContent = 'Grant Drive Access';
  } else {
    DOM.driveStatusDot.className = 'drive-status-indicator disconnected';
    DOM.driveAuthStatusText.textContent = 'Not connected to Google Drive';
    if (DOM.btnDriveLogin) DOM.btnDriveLogin.textContent = 'Connect Google Drive';
  }
}

async function uploadToGoogleDrive({ name, content, mimeType = 'text/plain', isBackup = false }) {
  const token = await getDriveAccessToken();
  if (!token) {
    showToast("Google Drive connection required.");
    return false;
  }

  showToast(`Uploading "${name}" to Google Drive...`);

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const metadata = {
    name: name,
    mimeType: mimeType,
    description: isBackup ? 'Typewriter Studio Manuscript Backup' : 'Typewriter Studio Draft',
    appProperties: {
      app: 'typewriter-studio',
      type: isBackup ? 'backup' : 'manuscript'
    }
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    content +
    close_delim;

  try {
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (response.ok) {
      const data = await response.json();
      showToast(`☁️ Saved "${name}" to Google Drive!`);
      if (DOM.driveModal && !DOM.driveModal.classList.contains('hidden')) {
        listGoogleDriveFiles();
      }
      return data;
    } else if (response.status === 401) {
      cachedAccessToken = null;
      updateDriveAuthUI();
      showToast("Drive session expired. Please sign in again.");
      return false;
    } else {
      const errData = await response.json().catch(() => ({}));
      console.error("Drive upload error:", errData);
      showToast(`Drive upload failed: ${errData.error?.message || 'Unknown error'}`);
      return false;
    }
  } catch (err) {
    console.error("Drive network error:", err);
    showToast(`Network error saving to Google Drive.`);
    return false;
  }
}

async function saveCurrentBookToDrive(format = 'txt') {
  const book = getActiveBook();
  if (!book) return;
  const ext = format === 'md' ? 'md' : 'txt';
  const mimeType = format === 'md' ? 'text/markdown' : 'text/plain';
  const cleanTitle = book.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const fileName = `${cleanTitle}_draft_${new Date().toISOString().slice(0, 10)}.${ext}`;
  const content = compileManuscriptText(format);

  const res = await uploadToGoogleDrive({
    name: fileName,
    content: content,
    mimeType: mimeType,
    isBackup: false
  });

  if (res && DOM.exportModal) DOM.exportModal.classList.add('hidden');
}

async function saveStudioBackupToDrive() {
  const backupData = JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    books: state.books,
    settings: state.settings
  }, null, 2);

  const fileName = `typewriter_backup_${new Date().toISOString().slice(0, 10)}.json`;
  return await uploadToGoogleDrive({
    name: fileName,
    content: backupData,
    mimeType: 'application/json',
    isBackup: true
  });
}

async function listGoogleDriveFiles() {
  if (!DOM.driveFilesList) return;
  const token = await getDriveAccessToken();
  if (!token) {
    DOM.driveFilesList.innerHTML = '<div class="drive-empty-notice">Sign in above to browse your Google Drive manuscripts.</div>';
    return;
  }

  DOM.driveFilesList.innerHTML = '<div class="drive-empty-notice">Fetching files from Google Drive...</div>';

  try {
    const query = encodeURIComponent("trashed = false and (name contains 'typewriter' or name contains 'draft' or name contains 'backup' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json')");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink)&orderBy=modifiedTime desc&pageSize=25`;

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedAccessToken = null;
        updateDriveAuthUI();
      }
      DOM.driveFilesList.innerHTML = '<div class="drive-empty-notice">Failed to load files from Google Drive. Please reconnect.</div>';
      return;
    }

    const data = await response.json();
    const files = data.files || [];

    if (files.length === 0) {
      DOM.driveFilesList.innerHTML = '<div class="drive-empty-notice">No Typewriter manuscripts found on Google Drive. Click "Save to Drive" above to create one!</div>';
      return;
    }

    DOM.driveFilesList.innerHTML = '';
    files.forEach(file => {
      const isJson = file.name.endsWith('.json') || file.mimeType === 'application/json';
      const isMd = file.name.endsWith('.md') || file.mimeType === 'text/markdown';
      const icon = isJson ? '🛡️' : (isMd ? '📝' : '📄');
      const dateStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const sizeStr = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '';

      const card = document.createElement('div');
      card.className = 'drive-file-card';
      card.innerHTML = `
        <div class="drive-file-meta">
          <span class="drive-file-icon">${icon}</span>
          <div class="drive-file-details">
            <span class="drive-file-title" title="${file.name}">${file.name}</span>
            <span class="drive-file-sub">${dateStr} ${sizeStr ? '• ' + sizeStr : ''}</span>
          </div>
        </div>
        <div class="drive-file-actions">
          <button class="btn-drive-action primary" data-id="${file.id}" data-name="${file.name}" data-json="${isJson}" title="Import into Typewriter Studio">📥 Load</button>
          ${file.webViewLink ? `<a href="${file.webViewLink}" target="_blank" class="btn-drive-action" title="Open in Google Drive Web">↗ View</a>` : ''}
          <button class="btn-drive-action danger" data-del-id="${file.id}" data-del-name="${file.name}" title="Delete file from Google Drive">🗑️</button>
        </div>
      `;

      const loadBtn = card.querySelector('.btn-drive-action.primary');
      if (loadBtn) {
        loadBtn.onclick = () => loadFileFromDrive(file.id, file.name, isJson);
      }

      const delBtn = card.querySelector('.btn-drive-action.danger');
      if (delBtn) {
        delBtn.onclick = () => deleteFileFromDrive(file.id, file.name);
      }

      DOM.driveFilesList.appendChild(card);
    });

  } catch (err) {
    console.error("List files error:", err);
    DOM.driveFilesList.innerHTML = '<div class="drive-empty-notice">Error loading files from Google Drive.</div>';
  }
}

async function loadFileFromDrive(fileId, fileName, isJson) {
  const token = await getDriveAccessToken();
  if (!token) return;

  const confirmed = confirm(`Load "${fileName}" from Google Drive into Typewriter Studio?`);
  if (!confirmed) return;

  showToast(`Downloading "${fileName}"...`);

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      showToast("Failed to download file from Google Drive.");
      return;
    }

    if (isJson) {
      const importedData = await response.json();
      if (importedData && importedData.books && importedData.books.length > 0) {
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
        showToast(`Loaded backup with ${state.books.length} book(s) from Google Drive!`);
      } else {
        alert("The selected JSON file does not have valid Typewriter Studio data.");
      }
    } else {
      const rawText = await response.text();
      const bookTitle = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const newBook = {
        id: 'book_' + Date.now(),
        title: bookTitle || "Drive Manuscript",
        pages: [],
        createdAt: Date.now()
      };

      const paragraphs = rawText.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
      const page = {
        id: 'page_' + Date.now(),
        number: 1,
        chunks: paragraphs.length > 0 ? paragraphs : [rawText.trim() || ''],
        locked: false,
        createdAt: Date.now()
      };
      newBook.pages.push(page);

      state.books.push(newBook);
      state.activeBookId = newBook.id;
      state.currentPageId = page.id;

      saveStorage();
      renderAll();
      closeDriveModal();
      closeOverlay();
      showToast(`Created book "${newBook.title}" from Google Drive text!`);
    }
  } catch (err) {
    console.error("Load drive file error:", err);
    showToast("Error importing file from Google Drive.");
  }
}

async function deleteFileFromDrive(fileId, fileName) {
  // Explicit confirmation dialog for deleting data via Workspace API
  const confirmed = confirm(`Are you sure you want to permanently delete "${fileName}" from your Google Drive? This action cannot be undone.`);
  if (!confirmed) return;

  const token = await getDriveAccessToken();
  if (!token) return;

  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.ok || response.status === 204) {
      showToast(`🗑️ Deleted "${fileName}" from Google Drive.`);
      listGoogleDriveFiles();
    } else {
      showToast("Failed to delete file from Google Drive.");
    }
  } catch (err) {
    console.error("Delete drive file error:", err);
    showToast("Error communicating with Google Drive.");
  }
}

function openDriveModal() {
  if (DOM.driveModal) {
    DOM.driveModal.classList.remove('hidden');
    updateDriveAuthUI();
    listGoogleDriveFiles();
  }
}

function closeDriveModal() {
  if (DOM.driveModal) {
    DOM.driveModal.classList.add('hidden');
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

// ─── BACKUP & RESTORE ───────────────────────────────────────

function exportBackupFile() {
  const backupData = JSON.stringify({
    version: 1,
    exportDate: new Date().toISOString(),
    books: state.books,
    settings: state.settings
  }, null, 2);

  const filename = `typewriter_backup_${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([backupData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

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
      showToast(`Target of ${state.settings.wordsPerPage} words reached! Page turned.`);
      createNewPage(true);
    } else {
      saveStorage();
      renderAll();
    }
  }

  if (DOM.writingSurface) {
    DOM.writingSurface.scrollTo({
      top: DOM.writingSurface.scrollHeight,
      behavior: 'smooth'
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

function renderAll() {
  applyTheme();
  applyFont();
  updateCommitHint();
  renderBookSlotsDropdown();
  renderSidebarPages();
  renderActivePage();
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
      renderAll();
      closeOverlay();
    };

    DOM.pagesList.appendChild(li);
  });
}

function renderActivePage() {
  const book = getActiveBook();
  const page = getCurrentPage();
  if (!page || !book) return;

  const totalPages = book.pages.length;
  if (DOM.pageHeaderInfo) {
    DOM.pageHeaderInfo.textContent = `Page ${page.number} of ${totalPages} • ${book.title.toUpperCase()} ${page.locked ? '(LOCKED)' : ''}`;
  }

  if (DOM.inkStream) {
    DOM.inkStream.innerHTML = '';

    page.chunks.forEach(chunkText => {
      const span = document.createElement('span');
      span.className = 'ink-chunk';
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

function applySettingsUI() {
  if (DOM.settingMaxChars) DOM.settingMaxChars.value = state.settings.maxChars;
  if (DOM.settingWordsPerPage) DOM.settingWordsPerPage.value = state.settings.wordsPerPage;
  if (DOM.settingCommitKey) DOM.settingCommitKey.value = state.settings.commitKey;
  if (DOM.settingVolume) DOM.settingVolume.value = state.settings.volume;
  if (DOM.btnSoundToggle) DOM.btnSoundToggle.textContent = state.settings.soundEnabled ? '🔊' : '🔇';
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

function exportManuscriptPDF() {
  const book = getActiveBook();
  if (!book) return;
  const cleanTitle = (book.title || 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (window.jspdf && window.jspdf.jsPDF) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'letter'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 54; // 0.75 in margin
      const maxWidth = pageWidth - margin * 2;
      let isFirstPage = true;

      book.pages.forEach((page, index) => {
        if (!isFirstPage) {
          doc.addPage();
        }
        isFirstPage = false;

        // Page Header
        doc.setFont('courier', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(40, 40, 40);

        if (index === 0) {
          doc.text(book.title, margin, margin + 10);
          doc.setFont('courier', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          doc.text(`Typewriter Studio Manuscript • ${new Date().toLocaleDateString()}`, margin, margin + 26);
          doc.setDrawColor(200, 200, 200);
          doc.line(margin, margin + 34, pageWidth - margin, margin + 34);
        }

        // Subhead Page Number
        const headerY = index === 0 ? margin + 55 : margin + 15;
        doc.setFont('courier', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(70, 70, 70);
        doc.text(`— PAGE ${page.number} OF ${book.pages.length} —`, margin, headerY);

        // Body Text
        doc.setFont('courier', 'normal');
        doc.setFontSize(11.5);
        doc.setTextColor(20, 20, 20);

        const pageText = page.chunks.join('\n\n');
        const splitLines = doc.splitTextToSize(pageText, maxWidth);

        let cursorY = headerY + 24;
        const lineHeight = 16;

        for (let i = 0; i < splitLines.length; i++) {
          if (cursorY + lineHeight > pageHeight - margin) {
            doc.addPage();
            cursorY = margin + 20;
          }
          doc.text(splitLines[i], margin, cursorY);
          cursorY += lineHeight;
        }

        // Footer
        doc.setFont('courier', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(140, 140, 140);
        doc.text(`${book.title} • Page ${page.number}`, margin, pageHeight - 30);
      });

      doc.save(filename);
      if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
      showToast(`Exported PDF: ${filename}`);
      return;
    } catch (err) {
      console.error("jsPDF generation failed:", err);
      showToast("PDF generation error. Falling back to print export.");
    }
  }

  // Graceful fallback for printing / PDF saving
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    let pagesHtml = '';
    book.pages.forEach(page => {
      pagesHtml += `
        <div class="print-page" style="page-break-after: always; padding: 40px; font-family: 'Courier New', monospace; max-width: 700px; margin: auto;">
          <div style="font-size: 13px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 24px; text-transform: uppercase;">
            ${book.title} — Page ${page.number} of ${book.pages.length}
          </div>
          <div style="font-size: 15px; line-height: 1.8; color: #111; white-space: pre-wrap;">${page.chunks.join('\n\n')}</div>
        </div>
      `;
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${book.title}</title>
        <style>
          @media print {
            body { margin: 0; background: #fff; }
            .print-page { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  }
}

function exportManuscriptDOCX() {
  const book = getActiveBook();
  if (!book) return;
  const cleanTitle = (book.title || 'manuscript').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.docx`;

  let pagesContent = '';
  book.pages.forEach((page, index) => {
    const pageBreak = index > 0 ? `<br clear=all style='mso-special-character:line-break;page-break-before:always'>` : '';
    const paragraphs = page.chunks.map(chunk => `<p class="MsoNormal" style="margin-bottom: 14pt; line-height: 1.5; font-family: 'Courier New', Courier, monospace; font-size: 12pt;">${chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');

    pagesContent += `
      ${pageBreak}
      <div class="Section1">
        <p style="font-family: 'Courier New', Courier, monospace; font-size: 10pt; color: #666666; border-bottom: 1pt solid #dddddd; padding-bottom: 4pt; margin-bottom: 18pt;">
          <strong>${book.title}</strong> &bull; PAGE ${page.number} OF ${book.pages.length}
        </p>
        ${paragraphs}
      </div>
    `;
  });

  const wordHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${book.title}</title>
      <!--[if gte mso 9]>
      <xml>
        <w:WordDocument>
          <w:View>Print</w:View>
          <w:Zoom>100</w:Zoom>
          <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
      </xml>
      <![endif]-->
      <style>
        @page Section1 {
          size: 8.5in 11.0in;
          margin: 1.0in 1.0in 1.0in 1.0in;
          mso-header-margin: 0.5in;
          mso-footer-margin: 0.5in;
          mso-paper-source: 0;
        }
        div.Section1 { page: Section1; }
        body {
          font-family: 'Courier New', Courier, monospace;
          color: #111111;
        }
        h1 {
          font-family: 'Courier New', Courier, monospace;
          font-size: 18pt;
          font-weight: bold;
          margin-bottom: 24pt;
        }
      </style>
    </head>
    <body>
      <h1>${book.title}</h1>
      <p style="font-size: 10pt; color: #888888; margin-bottom: 24pt;">Typewriter Studio Manuscript &bull; ${new Date().toLocaleDateString()}</p>
      ${pagesContent}
    </body>
    </html>
  `;

  const blob = new Blob([wordHtml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
  showToast(`Exported Word Document: ${filename}`);
}

function exportManuscript(format) {
  if (format === 'pdf') {
    exportManuscriptPDF();
    return;
  }
  if (format === 'docx') {
    exportManuscriptDOCX();
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

function copyManuscriptToClipboard() {
  const content = compileManuscriptText('txt');
  navigator.clipboard.writeText(content).then(() => {
    if (DOM.exportModal) DOM.exportModal.classList.add('hidden');
    showToast("Manuscript copied to clipboard!");
  }).catch(() => {
    showToast("Failed to copy to clipboard.");
  });
}

// ─── EVENT LISTENERS ────────────────────────────────────────

function setupEventListeners() {
  // ESC Key Listener & Global Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (DOM.driveModal && !DOM.driveModal.classList.contains('hidden')) {
        closeDriveModal();
      } else if (DOM.exportModal && !DOM.exportModal.classList.contains('hidden')) {
        DOM.exportModal.classList.add('hidden');
      } else {
        if (overlayOpen) closeOverlay();
        else openOverlay();
      }
      return;
    }

    if (!overlayOpen && document.activeElement === DOM.draftInput) {
      const isCtrlMode = state.settings.commitKey === 'ctrl-enter';
      const commitTriggered = isCtrlMode
        ? (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
        : (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey);

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

  // Clear all
  if (DOM.btnClearAll) {
    DOM.btnClearAll.onclick = () => {
      if (confirm("Are you sure you want to reset all books, pages, and preferences?")) {
        state.books = [];
        localStorage.clear();
        createNewBook("My First Book", false);
        closeOverlay();
        showToast("Studio data reset.");
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
      if (state.settings.theme === 'matrix') {
        state.settings.font = 'courier';
        if (DOM.settingFont) DOM.settingFont.value = 'courier';
        applyFont();
        showToast("Matrix theme activated (Courier font defaulted).");
      }
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

  if (DOM.btnExportPdf) DOM.btnExportPdf.onclick = () => exportManuscript('pdf');
  if (DOM.btnExportDocx) DOM.btnExportDocx.onclick = () => exportManuscript('docx');
  if (DOM.btnExportTxt) DOM.btnExportTxt.onclick = () => exportManuscript('txt');
  if (DOM.btnExportMd) DOM.btnExportMd.onclick = () => exportManuscript('md');
  if (DOM.btnCopyAll) DOM.btnCopyAll.onclick = copyManuscriptToClipboard;
  if (DOM.btnExportDriveTxt) DOM.btnExportDriveTxt.onclick = () => saveCurrentBookToDrive('txt');
  if (DOM.btnExportDriveMd) DOM.btnExportDriveMd.onclick = () => saveCurrentBookToDrive('md');

  // Google Drive Left Panel & Explorer Modal Listeners
  if (DOM.btnDriveSaveBook) DOM.btnDriveSaveBook.onclick = () => saveCurrentBookToDrive('txt');
  if (DOM.btnDriveSaveBackup) DOM.btnDriveSaveBackup.onclick = saveStudioBackupToDrive;
  if (DOM.btnDriveBrowserToggle) DOM.btnDriveBrowserToggle.onclick = openDriveModal;
  if (DOM.btnCloseDriveModal) DOM.btnCloseDriveModal.onclick = closeDriveModal;
  if (DOM.btnDriveLogin) DOM.btnDriveLogin.onclick = () => handleGoogleSignIn(() => listGoogleDriveFiles());
  if (DOM.btnDriveUploadCurrent) DOM.btnDriveUploadCurrent.onclick = () => saveCurrentBookToDrive('txt');
  if (DOM.btnDriveUploadBackup) DOM.btnDriveUploadBackup.onclick = saveStudioBackupToDrive;
  if (DOM.btnDriveRefresh) DOM.btnDriveRefresh.onclick = listGoogleDriveFiles;

  if (DOM.driveModal) {
    DOM.driveModal.onclick = (e) => {
      if (e.target === DOM.driveModal) {
        closeDriveModal();
      }
    };
  }
}

// ─── INITIALIZATION ─────────────────────────────────────────

function init() {
  initDOM();
  loadStorage();
  setupEventListeners();
  applySettingsUI();
  initFirebase();
  renderAll();

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
