for open source

<div align="center">

# Aptus

**Open Source Contribution Matchmaker**

Not another issue browser. Aptus reads your GitHub repos and pull requests, builds a skill graph from them, and scores live open-source issues against it — so what you see is ranked by fit, not by luck.


<img src="place1.png" alt="Aptus landing page" width="800" />

</div>

---

## Table of Contents

- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Database schema](#database-schema)
- [API routes](#api-routes)
- [How the compatibility score works](#how-the-compatibility-score-works)
- [Caching strategy](#caching-strategy)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Roadmap](#roadmap)
- [License](#license)

---

## What it does

1. **Reads your GitHub profile** — pulls your top repositories, sums the languages you actually write in (by byte share, not just a single "primary language"), and extracts domain keywords (`concurrency`, `authentication`, `caching`, etc.) from repo descriptions and topics.
2. **Scans your pull request history** — so an issue matching something you've *already shipped* gets a real, evidence-backed bonus.
3. **Searches live GitHub issues** — pulls open `good first issue` / `help wanted` tickets filtered to your top languages, including issues from both small repos and large, high-star organizations.
4. **Scores every candidate issue** — language match, keyword overlap, PR history bonus, and accessibility signals combine into a single compatibility percentage, with a full breakdown shown per issue.
5. **Estimates difficulty, time, and success probability** — heuristics derived from labels, discussion volume, and body length. Clearly labeled as estimates, not guarantees.
6. **Lets you save, refresh, and revisit** — star issues to your account, refresh for a new shuffled set of matches, and browse your full search history later without re-hitting the GitHub API.

---

## Screenshots



| Sign In | Profile — Saved & History |
|---|---|
| <img src="place2.png" width="380" /> | <img src="./docs/images/profile.png" width="380" /> |

---

## Architecture

```mermaid
flowchart TD
    U[User's Browser] -->|types GitHub username| P[app/page.tsx]
    P -->|POST /api/analyze| A[app/api/analyze/route.ts]

    A -->|1: check cache| DB[(Postgres — Neon)]
    DB -->|cache hit, last 1hr| A
    A -->|NDJSON stream| P

    A -->|2: cache miss| GM[lib/github-matchmaker.ts]
    GM -->|GitHub REST + Search API| GH[api.github.com]
    GH --> GM
    GM -->|scored results| A
    A -->|3: save scan| DB

    P -->|save/unsave issue| SI[app/api/issues/saved/route.ts]
    SI --> DB

    P -->|view history & saved| PR[app/profile/page.tsx]
    PR --> SI
    PR -->|/api/scans, /api/scans/recent, /api/scans/[id]| SC[scan history routes]
    SC --> DB

    U -->|Sign in with GitHub| SA[app/sign-in/page.tsx]
    SA --> BA[better-auth]
    BA -->|OAuth| GH
    BA --> DB
```

**Request flow for a scan:**

1. The browser POSTs a username to `/api/analyze`.
2. The route first checks Postgres for a scan of that username within the last hour — **from anyone**, signed in or not — and streams that back immediately if found.
3. On a cache miss, `lib/github-matchmaker.ts` does the real work: fetches the user's profile and repos, computes language share and keyword overlap, scans PR history, searches GitHub for matching open issues across several star-count tiers, scores everything, and streams results back as newline-delimited JSON (NDJSON) so the UI can show live progress instead of one long blocking request.
4. Once a fresh scan completes, it's saved to `scan_history` for future cache hits — this happens server-side automatically, independent of whether the requester is signed in.
5. Signed-in users can additionally star issues (`saved_issues` table) and browse their full search history from `/profile`.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, Turbopack) |
| Language | TypeScript |
| Auth | better-auth, GitHub OAuth provider |
| Database | PostgreSQL (Neon, serverless) |
| ORM | Drizzle ORM |
| Styling | Plain CSS (custom design system, no framework) |
| Data source | GitHub REST API + GitHub Search API |
| Streaming | NDJSON over `ReadableStream` (no external streaming library) |

---

## Project structure

```
Aptus/
├── app/
│   ├── page.tsx                     # main scanner UI
│   ├── globals.css                  # design system: colors, layout, components
│   ├── layout.tsx
│   ├── sign-in/
│   │   └── page.tsx                 # GitHub OAuth sign-in, split image/form layout
│   ├── profile/
│   │   └── page.tsx                 # saved issues + search history
│   └── api/
│       ├── analyze/
│       │   └── route.ts             # main scan endpoint — cache check, streaming, save
│       ├── auth/
│       │   └── [...all]/route.ts    # better-auth handler
│       ├── issues/
│       │   └── saved/route.ts       # GET / POST / DELETE starred issues
│       └── scans/
│           ├── route.ts             # GET history list / POST a scan record
│           ├── recent/route.ts      # lightweight "recently analyzed" feed (7-day window)
│           └── [id]/route.ts        # full cached scan detail, fetched on demand
├── lib/
│   ├── github-matchmaker.ts         # core logic: skill graph, search, scoring
│   ├── auth.ts                      # better-auth server config
│   ├── auth-client.ts               # better-auth React hooks (useSession, signIn, signOut)
│   └── db/
│       ├── index.ts                 # Drizzle + Neon client
│       ├── schema.ts                # saved_issues, scan_history tables
│       └── auth-schema.ts           # better-auth's own tables (generated)
├── components/
│   └── ui/
│       ├── star-icon.tsx
│       ├── refresh-icon.tsx
│       └── github-icon.tsx
├── drizzle.config.ts
└── .env                             # DATABASE_URL, GITHUB_TOKEN, GITHUB_CLIENT_ID/SECRET, BETTER_AUTH_SECRET
```

---

## Database schema

**`saved_issues`** — issues a signed-in user has starred

| Column | Type | Notes |
|---|---|---|
| `id` | serial | primary key |
| `github_username` | text | signed-in user's identity |
| `issue_url` | text | unique per user |
| `issue_title` | text | |
| `repo_full_name` | text | |
| `match_score` | integer | snapshot at save time |
| `difficulty` | integer | snapshot at save time |
| `saved_at` | timestamp | default now |

**`scan_history`** — every completed scan, used both as a browsable history and as the cache

| Column | Type | Notes |
|---|---|---|
| `id` | serial | primary key |
| `scanned_by` | text | signed-in username, or `"anonymous"` |
| `target_username` | text | the GitHub user that was scanned |
| `profile_json` | text | JSON-stringified profile snapshot |
| `skill_graph_json` | text | JSON-stringified skill graph snapshot |
| `results_json` | text | JSON-stringified scored issue list |
| `scanned_at` | timestamp | default now — cache freshness is checked against this |

better-auth manages its own additional tables (users, sessions, accounts) via `lib/db/auth-schema.ts`, generated with the better-auth CLI.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Run (or serve cached) analysis for a username; streams NDJSON |
| `/api/issues/saved` | GET / POST / DELETE | List, star, or unstar an issue |
| `/api/scans` | GET / POST | Full search history for a user / save a scan record |
| `/api/scans/recent` | GET | Lightweight global "recently analyzed" feed, last 7 days |
| `/api/scans/[id]` | GET / DELETE | Full cached scan detail on demand / remove a history entry |
| `/api/auth/[...all]` | GET / POST | better-auth's catch-all handler (sign in, callback, sign out, session) |

---

## How the compatibility score works

No ML, no embeddings — every number is deterministic arithmetic over GitHub API responses.

| Component | Max points | Basis |
|---|---|---|
| Language match | 45 | Your byte-share of that issue's language across your top repos |
| Keyword overlap | 36 | +9 per shared domain keyword between your repos and the issue text (capped) |
| PR history bonus | 12 | +6 per keyword that also appears in your past PR titles/bodies |
| Accessibility | ~10 | `good first issue` label, low comment count, and a small bump for issues from popular/high-star repos |

Difficulty (1–10), estimated hours, and success probability are separate, simpler heuristics layered on top of the match score — based on labels, body length, and comment count. All are explicitly surfaced as estimates in the UI, not guarantees.

---

## Caching strategy

- Every scan — signed in or anonymous — is saved to `scan_history` immediately after completion.
- Before running a fresh scan, `/api/analyze` checks for **any** scan of that username within the last hour and serves it instantly if found, skipping GitHub entirely.
- The homepage also shows a **"Recently analyzed"** row: a lightweight, deduplicated feed of usernames scanned globally in the last 7 days. Clicking a chip fetches that one cached record on demand — the list itself never carries full result payloads, keeping it fast to load.

---

## Getting started

```bash
git clone https://github.com/Quadratic12345/Aptus.git
cd Aptus
npm install
```

Set up your `.env` (see [Environment variables](#environment-variables) below), then:

```bash
npx drizzle-kit push      # create/sync database tables
npm run dev
```

Visit `http://localhost:3000`.

### GitHub OAuth App setup

Create one at **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**:
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

### GitHub personal access token

Create a fine-grained token at **GitHub → Settings → Developer settings → Personal access tokens** with **public repositories (read-only)** access — this powers the server-side analysis calls, separate from OAuth sign-in.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `GITHUB_TOKEN` | Server-side token for analysis API calls (5,000 req/hr) |
| `GITHUB_CLIENT_ID` | OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret |
| `BETTER_AUTH_SECRET` | Random secret — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Base URL of the app (`http://localhost:3000` in dev) |

---

## Roadmap

- [ ] Private repository inclusion for self-scans, via a broader OAuth scope requested only when a user scans their own username
- [ ] Per-user GitHub tokens (via OAuth) instead of one shared server token, raising the effective rate limit further
- [ ] Basic rate limiting on `/api/analyze` itself
- [ ] Configurable cache window (currently fixed at 1 hour)

---

## License

<!-- Add your chosen license here, e.g. MIT -->

---

<div align="center">

Made with ♥ by Sankalp

</div>
