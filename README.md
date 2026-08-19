# Yassin's League

A small football-style tournament manager for one league at a time: add players,
play a full round-robin group stage, then a Champions-League-inspired knockout
bracket with a third-place play-off and a final podium.

Two ways in from the landing page:

- **Login as Player** — opens immediately, strictly read-only, no password.
- **Login as Admin** — one shared password, then full control of the league.

Everything is stored in **Cloud Firestore**, so refreshing the page or opening
the site on another device shows the same live tournament. There is **no Firebase
Authentication** anywhere in this project.

---

## Tech stack

| Piece      | What is used                       |
| ---------- | ---------------------------------- |
| Framework  | Next.js 15 (App Router)            |
| Language   | TypeScript, React 19               |
| Styling    | Tailwind CSS v4                    |
| Icons      | lucide-react                       |
| Database   | Firebase Web SDK v12 → Cloud Firestore |
| Hosting    | Vercel                             |

No authentication library, no server routes, no API layer — the browser talks to
Firestore directly.

---

## Firebase setup (step by step)

You only need a Firebase project with **Cloud Firestore** turned on. Nothing else.

### 1. Create the Firestore database

1. Open the [Firebase console](https://console.firebase.google.com/) and pick your project.
2. In the left sidebar choose **Build → Firestore Database**.
3. Click **Create database**.
4. Choose a location close to you (for example `eur3` or `nam5`). **This cannot be changed later.**
5. When asked for a starting mode, pick **Start in test mode** — you will paste
   proper rules in step 3 anyway.
6. Click **Create** and wait for the database to finish provisioning.

### 2. Register a Web App and copy its config

1. Click the **gear icon → Project settings**.
2. Scroll to **Your apps**. If there is no web app yet, click the **`</>` (Web)** icon.
3. Give it any nickname (e.g. `yassins-league-web`). **Do not** tick "Firebase Hosting".
4. Click **Register app**. Firebase shows a `firebaseConfig` object like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyD...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abc123def456",
   };
   ```

5. Those six values are everything the app needs. `measurementId` is **not** used
   and can be ignored — this project does not include Analytics.

> These values are public client identifiers. They are safe to put in
> `NEXT_PUBLIC_*` variables; they are not secrets. **You do not need a service
> account key** — this app never runs Firebase Admin.

### 3. Publish the security rules

In the console go to **Firestore Database → Rules**, replace what is there with the
contents of [`firestore.rules`](./firestore.rules), and click **Publish**:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /leagues/{leagueId} {
      allow read, write: if true;

      match /{document=**} {
        allow read, write: if true;
      }
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

This allows open access to the one league the app uses and blocks everything else
in the project. See **[Security, honestly](#security-honestly)** below.

### 4. That is it

No Authentication providers, no Storage, no Functions, no indexes. The app only
uses single-collection reads, so Firestore's automatic indexes are enough.

---

## Environment variables

Copy [`.env.example`](./.env.example) to `.env.local` and fill in the six values
from step 2.

| Variable                                   | Required | Where it comes from                |
| ------------------------------------------ | -------- | ---------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | yes      | `firebaseConfig.apiKey`            |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | yes      | `firebaseConfig.authDomain`        |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | yes      | `firebaseConfig.projectId`         |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | optional | `firebaseConfig.storageBucket`     |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | optional | `firebaseConfig.messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | yes      | `firebaseConfig.appId`             |
| `NEXT_PUBLIC_ADMIN_PASSWORD`               | optional | defaults to `jtyasin11m`           |
| `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`      | local only | e.g. `127.0.0.1:8080` — never set this on Vercel |

`measurementId` is intentionally absent: Analytics is not used.

If the required variables are missing the app does **not** crash — it shows a
panel naming exactly which ones to add.

---

## Run it locally

```bash
npm install
```

Then either point it at your real Firebase project (put the values in `.env.local`) or
at the local emulator:

```bash
npm run emulator
```

That starts the Firestore emulator on port 8080 (it needs Java, and downloads a
small JAR on first run). Keep it running and, in a second terminal:

```bash
npm run dev
```

Open <http://localhost:3000>.

### Other scripts

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # tournament logic test suite (no database needed)
```

There are two further suites that need the emulator running:

```bash
npx tsx scripts/test-firestore.ts   # full flows against a real database
npx tsx scripts/test-scale.ts       # 100 players / 4,950 fixtures
```

---

## Firestore data model

One active league lives under `leagues/current`:

```
leagues/current                      tournament state + the setup draft roster
  ├── players/{playerId}             one document per player   (max 100)
  ├── matchdays/{md0001…}            one document per matchday (max 99)
  └── knockout/bracket               the whole knockout tree   (max 32 ties)
```

| Path                    | Holds                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `leagues/current`       | `status`, `mode`, `playerCount`, `matchesOrganized`, `bracketOrganized`, `bracketSize`, `qualifiedIds`, `draftPlayers` |
| `players/{id}`          | `name`, `order`                                                                                    |
| `matchdays/{id}`        | `matchday` plus a `matches` map keyed by fixture id: `{ index, matchday, playerAId, playerBId, scoreA, scoreB }` |
| `knockout/bracket`      | `size`, `participants`, and a `matches` map of ties: `{ round, slot, seedAId, seedBId, isThirdPlace, result }` |

**Why fixtures are grouped by matchday.** A 100-player league is 4,950 fixtures.
One document each would mean 4,950 reads on every page load. Grouped by matchday
it is 99 documents of about 7 KB — far below the 1 MB document limit — and a
single fixture can still be updated on its own through a nested field path
(`matches.<id>.scoreA`), so saving one score does not rewrite the others.

**Only facts are stored.** Player names, fixtures and entered scores. The league
table, who is in which knockout round, the champion and the tournament status are
all recalculated from those facts on every render. That is why editing a result
can never leave stale points behind and why a player can never appear in a round
they did not win their way into.

---

## Admin vs player

|                              | Admin | Player |
| ---------------------------- | :---: | :----: |
| View standings, fixtures, bracket, results | ✅ | ✅ |
| Add / remove players         | ✅    | ❌     |
| Start league                 | ✅    | ❌     |
| Organise matches             | ✅    | ❌     |
| Enter / edit scores          | ✅    | ❌     |
| Start bracket                | ✅    | ❌     |
| Reset league                 | ✅    | ❌     |

The player route (`/view`) imports no write functions at all and renders every
component in read-only mode, so there is no edit control to reach.

The admin password is checked in the browser and remembered in `sessionStorage`
for that tab only.

---

## How the tournament works

### Choosing the format

When the admin presses **Start League**, the player count decides everything:

- **Exactly 2, 4, 8, 16 or 32 players** → straight to a knockout bracket of that
  size. No group stage, and no Group tab.
- **Any other count (3, 5, 6, 7, 9, 10, 20, 50, 100 …)** → a full round-robin
  group stage first.

### Group stage

**Organize Matches** builds the schedule with the circle method: every pair of
players meets exactly once — `n × (n − 1) / 2` fixtures — arranged into matchdays
so nobody is scheduled twice on the same day. With an odd number of players a
virtual bye is added, which is what gives one player a rest each round. The draw
is shuffled, so the same names produce a different schedule every time.

Standings use football scoring — **win 3, draw 1, loss 0** — and sort by:

1. Points (desc)
2. Goal difference (desc)
3. Goals for (desc)
4. Player name (A→Z, deterministic fallback)

### Qualification

Once every group fixture has a result, **Start Bracket** appears. The bracket size
is the largest of 2, 4, 8, 16, 32 that is not bigger than the number of players:

| Players | Bracket |
| ------- | ------- |
| 2–3     | 2       |
| 4–7     | 4       |
| 8–15    | 8       |
| 16–31   | 16      |
| 32–100  | 32      |

The top players in the final table qualify — 10 players → top 8, 17 → top 16,
50 → top 32, and so on.

### Knockout

Qualified players are **shuffled** before pairing, so the draw is not simply
1st v 2nd. Later rounds start out showing `Winner of Match 3` rather than a
guessed name, and fill in as results are saved.

- A knockout tie **cannot end level** — the admin is asked for the score after
  extra time or penalties, and nobody advances on a draw.
- Re-scoring an earlier tie automatically clears any later result it invalidated,
  so the bracket can never keep a player in a round they no longer belong in.
- With 4 or more players there is a **third-place play-off** between the two
  semifinal losers. The tournament is only finished once that is played too.

When the final (and third-place tie) are done, a champion panel appears and a
permanent **Results** page shows the podium plus the final table.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project** and import the repository. The framework is
   detected automatically; no build settings need changing.
3. Open **Settings → Environment Variables** and add each `NEXT_PUBLIC_FIREBASE_*`
   value from `.env.example`, for **Production**, **Preview** and **Development**.
4. Do **not** set `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST` — that is for local use only.
5. Deploy.

`NEXT_PUBLIC_*` variables are inlined at build time, so **redeploy after changing
any of them**.

Optionally add your Vercel domain under **Firebase console → Project settings →
Authorized domains**. It is not required for Firestore, but it keeps the project
tidy.

---

## Security, honestly

This app has **no Firebase Authentication**, by design — it is a private
tournament between friends.

The admin password is a **client-side convenience only**. It stops a friend from
casually editing scores; it does **not** protect the database. The Firestore rules
above allow anyone who knows the project id to read and write the league data
directly, bypassing the app entirely. That is a deliberate trade for simplicity.

So:

- Do not put anything private or sensitive in this database.
- Do not reuse this pattern for anything that matters.
- If you ever need real protection, the honest fix is Firebase Authentication plus
  rules that check `request.auth` — not a stronger password in the browser.

---

## Project layout

```
src/
  app/
    page.tsx            landing page (admin / player choice)
    admin/page.tsx      admin console
    view/page.tsx       read-only player view
  components/           UI: bracket, standings, fixtures, dialogs, podium
  hooks/useLeague.ts    the four Firestore listeners + derived read-model
  lib/
    types.ts            Player, Match, BracketMatch, Tournament, Standings…
    schedule.ts         round-robin generation
    standings.ts        table calculation
    bracket.ts          bracket build, resolution, podium, placements
    tournament.ts       derived state machine
    db.ts               all Firestore reads and writes
    firebase.ts         lazy SDK init + friendly errors
    validation.ts       roster and score validation
scripts/                test suites and dev helpers
```
