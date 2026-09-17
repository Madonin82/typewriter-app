# Note to Self

A forward-only micro-drafting studio designed to cure editing paralysis. Write in short bursts, commit them to ink, and keep moving.

**Live demo:** https://madonin82.github.io/typewriter-app

## The Philosophy

Traditional writing tools invite endless back-editing, which traps writers in perfectionism. Note to Self separates drafting from committing:

1. **Draft** — Write your current thought in a small, focused buffer.
2. **Commit** — Press Enter and the text is permanently pressed into the ink stream.
3. **Move forward** — Ink can't be edited after commit. The only direction is ahead.

## Features

### ✍️ Writing

- **Forward-only drafting** — A character-limited draft buffer with auto-commit; once text is ink, it stays ink.
- **Typewriter physics** — Authentic keystroke sounds (Web Audio, adjustable volume) and tactile scrolling.
- **Keystroke replay** — Replays your exact typing rhythm on commit and calculates your WPM, at 1x–10x speed.
- **Commit timestamps** — Optional per-commit timestamps in the page margin.
- **Previous-page context** — A faded ghost preview of the prior page's closing line above the ink stream.
- **Words-per-page target** — Pages automatically lock and turn when the target is reached.
- **Locked pages** — Finished pages are protected behind a floating overlay.

### 📚 Books & Pages

- **Multiple books** — Create, rename, search, and delete books; page descriptions double as chapter labels.
- **In-book search** — Find text across the current book and jump straight to the page.

### 📊 Manuscript Analysis

- Real-time readability metrics computed off-thread in a Web Worker (zero UI lag): Flesch Reading Ease, grade level, word/sentence/paragraph counts, unique words, average words per sentence, estimated reading and speaking time, plus a page-by-page progress breakdown.

### 💾 Import, Export & Backup

- **Export** — Manuscript to TXT, Markdown, PDF, or EPUB ebook; copy to clipboard; direct export to Google Drive / Google Docs.
- **Import** — Load manuscripts from device (.txt, .md, .epub, .json) or straight from Google Drive.
- **Session backups** — One-click full-session snapshots (.json) to device or Drive, with inspect-before-restore.
- **Safety archive** — Deleting a book or resetting the studio automatically preserves a restorable snapshot. Your work is never silently lost.

### ☁️ Sync

- **Firebase email/password auth** with real-time **Firestore sync** across devices, plus a live sync-status indicator.
- Fully usable offline — local-first storage is the default, cloud is opt-in.

### 🎨 Customization

- **Paper tones** — Warm Cream, Clean White, Vintage Sepia, Midnight Ink, Matrix CRT green.
- **Typewriter fonts** — Courier Prime, Special Elite, system monospace.
- **Commit shortcut** — Enter or Ctrl+Enter (your choice for line breaks vs. committing).

### 📱 Installable Anywhere

- Progressive Web App — install to desktop or phone home screen, works offline via service worker with seamless background updates. Mobile layout with notch support.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)

### Run it locally

```bash
git clone https://github.com/Madonin82/typewriter-app.git
cd typewriter-app
npm install
npm start
```

Open http://localhost:3000 — no build step, the server serves the static app directly.

### Cloud sync (optional)

Sync features need a Firebase project. Copy `.env.example` to `.env` and add your Firebase API key. Everything else — writing, export, local backups — works with no configuration at all.

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | App shell and UI markup |
| `app.js` | Application logic (vanilla JS, no framework) |
| `style.css` | All styling, themes, and responsive layout |
| `text-worker.js` | Web Worker for readability analysis |
| `server.js` | Zero-dependency static server with smart cache headers |
| `sw.js` / `manifest.json` | PWA service worker and install manifest |
| `jspdf.umd.min.js` / `jszip.min.js` | Bundled locally — PDF and ZIP export work offline |

## Built With

- HTML5 / CSS3 / Vanilla JavaScript (no framework, no build step)
- Node.js static server
- Firebase Auth + Firestore (optional sync)
- Google Drive API (backup & export)
- jsPDF, JSZip, Web Audio API, Web Workers