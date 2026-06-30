# LORE-V2: Agent Onboarding & System Architecture Guide

Welcome, Agent. This document contains comprehensive architecture blueprints, state synchronization details, and design requirements for the **LORE-V2** workspace. Read this document before making any changes.

---

## 1. Project Overview & Core Concept
**LORE** is an atmospheric, premium, dark terminal-style digital archive cataloging historical conspiracies, paranormal anomalies, true crime events, and psychological experiments (e.g., CIA MK-Ultra, Burari deaths, Dyatlov Pass). 

The target user experience relies on deep immersion—incorporating retro forensic HUD designs, ambient terminal audio, clean typography, monochromatic colors, and structured layers of redacted/revealed evidence.

---

## 2. Technical Stack
- **Frontend**: Single Page Application built with React (Vite, CSS Modules / Tailwind, Lucide Icons).
- **Backend**: Express-like local Node.js server (`server.cjs`) for offline development.
- **Serverless API**: Deployed as Vercel Serverless Functions under the `/api` directory.
- **Database**: SQLite powered by `better-sqlite3` (`db.cjs`).

---

## 3. SQLite Serverless Architecture & Distributed State
### The Problem: Ephemeral /tmp on Vercel
Vercel serverless function containers are stateless and ephemeral. The SQLite database is created in the container's writeable `/tmp/lore.db` directory.
1. When a container goes to sleep or restarts, the `/tmp` folder is wiped out, and any local database edits (like saves, additions, or edits) are lost.
2. Multiple containers run concurrently. They do *not* share `/tmp` files. If container A handles a write (`PUT`), container B's SQLite database remains stale.
3. `/tmp/lore.db` is often preserved across requests within the *same* warm container instance, meaning stale data persists and won't re-seed if we only seed when `storyCount === 0`.

### The Persistence Strategy: GitHub Sync
To solve this, the application uses **GitHub Sync** as the single source of truth for persisted data:
- **`public/content/stories.json`**: Persisted list of all published stories.
- **`public/content/concept_index.json`**: Hashed search index of concepts mapping to story IDs.

When a user edits a story or pastes a cover image in the Admin Panel:
1. The client performs a local database call (`PUT /api/stories/:id`) to update the active container's SQLite database.
2. If GitHub Sync credentials (`ghToken`) are configured, the client compiles the updated list in memory and commits `stories.json` and `concept_index.json` **directly to GitHub** via the GitHub API.
3. Vercel receives a webhook from GitHub, rebuilds the site, and deploys the new commit.

### The Solutions Implemented:
#### A. Vercel Edge CDN Sync Gating (Zero-Reload Verification)
When saving a cover image from the outside, the application does *not* reload the page instantly (which would reset user search queries and filters). Instead, it enters a polling phase:
- It queries the live CDN endpoint (`/content/stories.json?t=...`) every **3 seconds**.
- A styled modal displays a visual progress bar that advances smoothly to 90% over 15 seconds.
- The loop only resolves (setting progress to 100%, showing success, and closing the modal) once Vercel's Edge CDN serves the new image URL.
- State is updated **optimistically in-place** inside React (`adminStories` and `stories`), decrementing missing image counters and removing warning badges in real-time.

#### B. SQLite Startup Upsert Sync (Enforcing Alignment)
To prevent warm containers from serving stale databases, the `seed()` function in `db.cjs` executes an `INSERT OR REPLACE` transaction on **every container startup**:
```javascript
// db.cjs
try {
  const data = JSON.parse(fs.readFileSync(STORIES_FILE, 'utf8'));
  if (data && Array.isArray(data.stories)) {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO stories (
        story_id, title, ...
      ) VALUES (?, ?, ...)
    `);
    const transaction = db.transaction((stories) => {
      for (const s of stories) {
        insertStmt.run(s.story_id, s.title, ...);
      }
    });
    transaction(data.stories);
  }
} catch (e) {
  console.error(e);
}
```
This forces warm or preserved containers to instantly align their SQLite `stories` table with the deployed `stories.json` file on module import.

---

## 4. Key Components & Code Locations

### Backend / Database Layer
- **[db.cjs](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/db.cjs)**: SQLite database connection, table initialization, and seeding/sync. Contains the filesystem existence check (`fs.existsSync(path.join(__dirname, 'public', img))`) to prevent updated covers from reverting.
- **[server.cjs](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/server.cjs)**: Local Dev Server handling APIs and image uploads (`POST /api/upload-image`).
- **[/api/stories](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/api/stories)**: Serverless functions for fetching, creating, and publishing dossiers.

### Frontend Components (`/src/components`)
- **[AdminPanel.jsx](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/src/components/AdminPanel.jsx)**: Admin center. Handles fast copy-paste image uploading, Vercel Edge polling, in-place reactive updates, and Google Image search generation (which extracts only the short-title prefix of story titles to get optimal searches).
- **[StoryCatalog.jsx](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/src/components/StoryCatalog.jsx)**: Catalog view. Handles hover animations and slides up full-height overlays containing Layer 1 sentences. If a cover is missing, renders a typographic cover gradient based on story ID hash values.
- **[ApprovalCard.jsx](file:///c:/Users/Black_Phoenix/.gemini/antigravity/scratch/lore-v2/src/components/ApprovalCard.jsx)**: Handles the queue of new AI dossiers, supporting quick cover pastes and typographic gradient fallbacks.

---

## 5. Architectural Invariants (Must Maintain)
1. **Never use `window.location.reload()` on sync completion**: Keep state updates reactive and in-place.
2. **Never check local images solely against a hardcoded whitelist**: Keep `fs.existsSync` checks active in `db.cjs` to verify physical files.
3. **Pop-up blocker avoidance**: Always generate Google search shortcuts using raw HTML `<a>` tags with `target="_blank" rel="noopener noreferrer"`. Never call programmatic `window.open()` inside buttons.
4. **Google Search Queries**: Always split/clean the title at colons (`:`) or dashes (`-`) to query Google Images using the main short-title.
5. **No Placeholders**: Always maintain typographic fallback covers (colored gradients, HUD metadata, centered text) if files are offline.

---

*End of Dossier.*
