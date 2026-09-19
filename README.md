# Note to Self

A forward-only micro-drafting studio designed to cure editing paralysis. Write in short bursts, commit them to ink, and keep moving.

**Live demo:** https://madonin82.github.io/typewriter-app

**Audience page:** https://madonin82.github.io/typewriter-app/#/station/

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

### 📈 Progress & Pace

- **Finish Projection** — Set a book word target (default 80,000) and the header shows live progress plus a projected finish date computed from your recent writing activity.
- **Race Your Ghost** — A best-WPM badge tracks your personal record per book, with a toast and sound when you set a new one.
- Both can be toggled independently in settings.

### 📚 Books & Pages

- **Multiple books** — Create, rename, search, and delete books; page descriptions double as chapter labels.
- **In-book search** — Find text across the current book and jump straight to the page.

### 📡 Public Station

- **Publish a book** — Push any book to your public Station with one click; a share modal hands you the direct reader URL (`#/station/{book}`) with copy and open actions.
- **Station names** — Give each published book a short display name (up to 40 characters) shown on its Station card and reading header.
- **Go live** — Toggle live mode and your committed ink streams to readers in near-real-time, with an ON AIR badge and auto-scroll that keeps readers pinned to your latest words as you type.
- **Author's view, reader's choice** — Your display settings (paper theme, font, size, spacing, timestamps) travel with the published book, so readers see it the way you see it. Readers can open the display menu (gear icon) to switch paper (light / dark / sepia), fonts, text size, and spacing, toggle timestamps independently, or reset to your view — their preferences are remembered per book, on their device only.
- **Station home** — `#/station/` lists everything you've published, live books first. No login needed to read.
- **Safety rails** — Closing the tab while a book is live or published prompts you first (and stops the broadcast); logging out with a book published or live asks for confirmation; the writer re-checks the Station on login so a stream can never get stranded; unpublishing is instant.
- **Station admin** — `#/admin` (owner only) is mission control for the public Station: a realtime dashboard of everything live and published, with End stream, Unpublish, and View controls.

### 📊 Manuscript Analysis

- Real-time readability metrics computed off-thread in a Web Worker (zero UI lag): Flesch Reading Ease, grade level, word/sentence/paragraph counts, unique words, average words per sentence, estimated reading and speaking time, plus a page-by-page progress breakdown.

### 💾 Import, Export & Backup

- **Export** — Manuscript to TXT, Markdown, PDF, or EPUB ebook; copy to clipboard; direct export to Google Drive / Google Docs.
- **Import** — Load manuscripts from device (.txt, .md, .epub, .json) or straight from Google Drive.
- **Session backups** — One-click full-session snapshots (.json) to device or Drive, with inspect-before-restore.
- **Safety archive** — Deleting a book or resetting the studio automatically preserves a restorable snapshot. Your work is never silently lost.

### ☁️ Sync

- **Firebase auth** — Sign in with Google or email/password; verified email is required to sync.
- **Firestore sync** — Real-time sync across devices behind owner-only security rules (each account can read and write only its own data), plus a live sync-status indicator. Security rules live in `firestore.rules`, version-controlled in the repo.
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

### Deploying Firestore rules

Security rules are version-controlled in `firestore.rules` (`firebase.json` wires it up for the CLI). Deploy with:

```bash
firebase deploy --only firestore:rules
```

or paste the file's contents into the Firebase console Rules tab. Console edits and the file can drift — treat the file as the source of truth.

## Project Structure

| File | Purpose |
| --- | --- |
| `index.html` | App shell and UI markup |
| `app.js` | Application logic (vanilla JS, no framework) |
| `style.css` | All styling, themes, and responsive layout |
| `text-worker.js` | Web Worker for readability analysis |
| `server.js` | Zero-dependency static server with smart cache headers |
| `sw.js` / `manifest.json` | PWA service worker and install manifest |
| `firestore.rules` | Version-controlled Firestore security rules |
| `firebase.json` | Firebase CLI config (points at `firestore.rules`) |
| `jspdf.umd.min.js` / `jszip.min.js` | Bundled locally — PDF and ZIP export work offline |

## Built With

- HTML5 / CSS3 / Vanilla JavaScript (no framework, no build step)
- Node.js static server
- Firebase Auth + Firestore (verified-email-gated sync)
- Google Drive API (backup & export)
- jsPDF, JSZip, Web Audio API, Web Workers

## License

Personal, non-commercial use only — see the `LICENSE` file for the full terms.
