# Note to Self

A writing app for drafting books. You write in short chunks, commit them, and keep going — committed text can't be edited, so you move forward instead of re-reading what you just wrote.

**Live demo:** https://madonin82.github.io/typewriter-app

**Station (public reading page):** https://madonin82.github.io/typewriter-app/#/station/

## Writing

- Draft in a small text buffer (200 characters max), then press Enter to commit. Committed text is permanent.
- Typewriter keystroke sounds via Web Audio, volume adjustable, can be turned off.
- Keystroke replay: replays your typing rhythm on commit and shows WPM, at 1x-10x speed.
- Optional per-commit timestamps in the page margin.
- Ghost preview of the previous page's last line above the current page.
- Words-per-page target: pages lock and turn when the target is reached. Locked pages can't be edited.
- Multiple books: create, rename, search, delete. Page descriptions work as chapter labels.
- In-book search across the current book.
- Focus mode: dims everything except the line you're typing.

## Progress

- Book word target (default 80,000) with live progress and a projected finish date based on recent activity.
- Best-WPM badge per book, with a notification when you beat it.
- Both can be toggled in settings.

## Station

The Station is a public page where readers can read what you publish. One permanent URL, no login required to read.

- **Publish**: writes a snapshot of the book to the public Station immediately, then shows you the link. The book appears as an open draft.
- **Update Station**: pushes new commits to the public open draft.
- **Go Live**: streams committed text to readers in near-real time with an ON AIR badge. End the stream from the ESC menu.
- **Unpublish**: removes the book from the Station.
- Readers can change paper theme, font, size, spacing, and timestamps for themselves; their settings stay on their device.
- `#/admin` is a dashboard of live and published books (owner only).
- Readers see how many pages are new since their last visit and can jump straight to the first unread one.

## Chat

A live chat room built into the app (`#/chat`).

- Messages send instantly and appear for everyone in the room.
- See who's online right now and who's typing.
- Chat history is stored with the app's cloud sync; online status and typing indicators use the Realtime Database (rules in `database.rules.json`).

## Analysis

Readability stats computed in a Web Worker: Flesch Reading Ease, grade level, word/sentence/paragraph counts, unique words, average words per sentence, estimated reading and speaking time, per-page breakdown.

## Import, export, backup

- Export: TXT, Markdown, DOCX, PDF, EPUB, copy to clipboard, Google Drive / Google Docs.
- Import: .txt, .md, .epub, .json from device or Google Drive.
- Session backups: full snapshots (.json) to device or Drive, inspect before restore.
- Deleting a book or resetting the app keeps a restorable snapshot automatically.

## Sync

- Sign in with Google or email/password. Email verification is required to sync.
- Firestore sync across devices, owner-only security rules (each account sees only its own data). Rules are in `firestore.rules`.
- Works fully offline. Sync is opt-in.

## Customization

- Paper: Warm Cream, Clean White, Vintage Sepia, Midnight Ink, Matrix CRT green.
- Fonts: Courier Prime, Special Elite, system monospace.
- Commit key: Enter or Ctrl+Enter.
- PWA: installable on desktop and phone, works offline.

## Run it locally

Requires [Node.js](https://nodejs.org/).

```bash
git clone https://github.com/Madonin82/typewriter-app.git
cd typewriter-app
npm install
npm start
```

Open http://localhost:3000. No build step.

### Cloud sync (optional)

Copy `.env.example` to `.env` and add your Firebase API key. Everything else works without it.

### Firestore rules

Rules live in `firestore.rules` (`firebase.json` points the CLI at it). Deploy with `firebase deploy --only firestore:rules`, or paste the file into the Firebase console Rules tab.
Chat presence/typing rules live in `database.rules.json` — deploy with `firebase deploy --only database`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | App markup |
| `app.js` | All application logic (vanilla JS) |
| `style.css` | Styling and themes |
| `text-worker.js` | Analysis Web Worker |
| `server.js` | Static file server |
| `sw.js` / `manifest.json` | PWA service worker and manifest |
| `firestore.rules` | Firestore security rules |
| `database.rules.json` | Realtime Database security rules (chat presence/typing) |
| `jspdf.umd.min.js` / `jszip.min.js` | Bundled locally so PDF/ZIP export work offline |

## License

Personal, non-commercial use only. See `LICENSE`.
