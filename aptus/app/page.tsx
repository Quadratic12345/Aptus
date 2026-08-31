
'use client';

import { useSession } from '@/lib/auth-client';
import StarIcon from '@/components/ui/star-icon';
import RefreshIcon from '@/components/ui/refresh-icon';
import Link from 'next/link';
import { useState, useRef, Fragment, useMemo } from 'react';

const REPO_URL = 'https://github.com/Quadratic12345/Aptus';

type Scored = {
  issue: {
    title: string;
    html_url: string;
    repository_url: string;
    comments: number;
    labels: { name: string }[];
    _matchedLanguage: string;
  };
  score: number;
  difficulty: number;
  probability: number;
  estimatedHours: [number, number];
  matchedKeywords: string[];
  prBonusKeywords: string[];
  prKeywordCounts: Record<string, number>;
  breakdown: {
    language: number;
    keywords: number;
    prHistory: number;
    accessibility: number;
  };
  repoCount: number;
  langShare: number;
};

type Profile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  followers: number;
  publicRepos: number;
  htmlUrl: string;
};

type SavedIssue = {
  id: number;
  issueUrl: string;
  issueTitle: string;
  repoFullName: string;
  matchScore: number | null;
  difficulty: number | null;
  savedAt: string;
};

function diffClass(d: number) {
  return d <= 4
    ? 'diff-easy'
    : d <= 7
      ? 'diff-mid'
      : 'diff-hard';
}

const SEGMENT_COLORS = [
  'var(--accent)',
  'var(--pink)',
  'var(--good)',
  'var(--mid)',
];

export default function Home() {
  const { data: session } = useSession();

  const [username, setUsername] = useState('');
  const [stage, setStage] = useState(-1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);

  const [skillGraph, setSkillGraph] = useState<{
    languageShare: Record<string, number>;
    keywords: string[];
    prKeywordCounts: Record<string, number>;
  } | null>(null);

  const [results, setResults] = useState<Scored[] | null>(null);

  const [sortBy, setSortBy] = useState<
    'match' | 'easiest' | 'fastest' | 'probability'
  >('match');

  const [activeLangs, setActiveLangs] = useState<Set<string>>(
    new Set()
  );

  // URLs of issues that are actually saved in the database.
  const [saved, setSaved] = useState<Set<string>>(
    new Set()
  );

  const [copied, setCopied] = useState<string | null>(null);

  const [solvedMarked, setSolvedMarked] = useState<Set<string>>(
    new Set()
  );

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Load saved issues from the database.
   *
   * This is separate from the visual "saved" state so that
   * refreshing/scanning doesn't lose the user's saved issues.
   */
  async function loadSavedIssues(u: string) {
    const trimmed = u.trim().replace(/^@/, '');

    if (!trimmed) {
      setSaved(new Set());
      return;
    }

    try {
      const res = await fetch(
        `/api/issues/saved?username=${encodeURIComponent(trimmed)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
        }
      );

      const text = await res.text();

      if (!res.ok) {
        console.warn(
          'Could not load saved issues:',
          res.status,
          text
        );
        return;
      }

      if (!text.trim()) {
        setSaved(new Set());
        return;
      }

      let data: unknown;

      try {
        data = JSON.parse(text);
      } catch {
        console.warn(
          'Saved issues API returned invalid JSON.'
        );
        return;
      }

      if (!Array.isArray(data)) {
        setSaved(new Set());
        return;
      }

      const urls = data
        .map((item: SavedIssue) => item.issueUrl)
        .filter(
          (url): url is string =>
            typeof url === 'string' && url.length > 0
        );

      setSaved(new Set(urls));
    } catch (e) {
      console.warn(
        'Could not load saved issues:',
        e
      );
    }
  }

  async function scan() {
    const u = username.trim().replace(/^@/, '');

    if (!u) {
      setStatus('Enter a GitHub username first.');
      return;
    }

    setLoading(true);
    setStage(-1);
    setStatus('');
    setError('');
    setEmpty('');
    setProfile(null);
    setSkillGraph(null);
    setResults(null);
    setActiveLangs(new Set());
    setSortBy('match');

    // Load existing saved issues before displaying new results.
    await loadSavedIssues(u);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: u,
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Request failed with status ${res.status}.`
        );
      }

      if (!res.body) {
        throw new Error('No response stream.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split('\n');

        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const evt = JSON.parse(line);

            if (evt.type === 'status') {
              setStage(evt.stage);
              setStatus(evt.message);
            } else if (evt.type === 'profile') {
              setProfile(evt.data);
            } else if (evt.type === 'skillgraph') {
              setSkillGraph(evt.data);
            } else if (evt.type === 'results') {
              setResults(evt.data);
              setStatus(
                `Done — ${evt.data.length} matches ranked.`
              );
            } else if (evt.type === 'empty') {
              setEmpty(evt.message);
            } else if (evt.type === 'error') {
              setError(evt.message);
            }
          } catch {
            console.warn(
              'Could not parse stream event:',
              line
            );
          }
        }
      }

      // Reload saved issues after the scan as well.
      // This keeps the UI synchronized with the database.
      await loadSavedIssues(u);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Save or unsave an issue in the database.
   *
   * Saved issues are keyed to the signed-in user's
   * GitHub username/name instead of the username being scanned.
   */
  async function toggleSaved(s: Scored) {
    if (!session) {
      window.location.href = '/sign-in';
      return;
    }

    const url = s.issue.html_url;
    const isCurrentlySaved = saved.has(url);

    const me = session?.user?.name?.trim().replace(/^@/, '') || '';

    setSaved((prev) => {
      const next = new Set(prev);
      isCurrentlySaved
        ? next.delete(url)
        : next.add(url);
      return next;
    });

    if (isCurrentlySaved) {
      await fetch('/api/issues/saved', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: me,
          issueUrl: url,
        }),
      });
    } else {
      const repoFull =
        s.issue.repository_url.replace(
          'https://api.github.com/repos/',
          ''
        );

      await fetch('/api/issues/saved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: me,
          issueUrl: url,
          issueTitle: s.issue.title,
          repoFullName: repoFull,
          matchScore: s.score,
          difficulty: s.difficulty,
        }),
      });
    }
  }

  function copyLink(url: string) {
    if (!navigator.clipboard) {
      setError('Clipboard access is not available.');
      return;
    }

    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(url);

        setTimeout(() => {
          setCopied((c) =>
            c === url ? null : c
          );
        }, 1500);
      })
      .catch(() => {
        setError('Could not copy the link.');
      });
  }

  function toggleLang(lang: string) {
    setActiveLangs((prev) => {
      const next = new Set(prev);

      if (next.has(lang)) {
        next.delete(lang);
      } else {
        next.add(lang);
      }

      return next;
    });
  }

  /**
   * NOTE: this now writes to the same /api/issues/saved table
   * that the Save button uses (the old /api/issues/solved route
   * no longer exists). Functionally redundant with Save right now —
   * consider removing this button, or repurposing it to track a
   * distinct "solved" status via an extra column later.
   */
  async function markSolved(s: Scored) {
    if (!session) {
      window.location.href = '/sign-in';
      return;
    }

    const me = session?.user?.name?.trim().replace(/^@/, '') || '';

    if (!me) {
      setError('Could not determine your signed-in username.');
      return;
    }

    const repoFull = s.issue.repository_url.replace(
      'https://api.github.com/repos/',
      ''
    );

    try {
      const res = await fetch('/api/issues/saved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: me,
          issueUrl: s.issue.html_url,
          issueTitle: s.issue.title,
          repoFullName: repoFull,
          matchScore: s.score,
          difficulty: s.difficulty,
        }),
      });

      const text = await res.text();

      if (!res.ok) {
        let message =
          'Failed to mark issue as solved.';

        if (text.trim()) {
          try {
            const data = JSON.parse(text);

            if (data?.error) {
              message = data.error;
            } else if (data?.message) {
              message = data.message;
            }
          } catch {
            // Response wasn't JSON.
          }
        }

        throw new Error(message);
      }

      setSolvedMarked((prev) => {
        const next = new Set(prev);
        next.add(s.issue.html_url);
        return next;
      });

      // This also counts as "saved" now, since it's the same table.
      setSaved((prev) => new Set(prev).add(s.issue.html_url));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not mark issue as solved.'
      );
    }
  }

  const availableLangs = useMemo(
    () =>
      results
        ? Array.from(
          new Set(
            results.map(
              (s) => s.issue._matchedLanguage
            )
          )
        )
        : [],
    [results]
  );

  const displayed = useMemo(() => {
    if (!results) return [];

    let list = [...results];

    if (activeLangs.size > 0) {
      list = list.filter((s) =>
        activeLangs.has(
          s.issue._matchedLanguage
        )
      );
    }

    switch (sortBy) {
      case 'easiest':
        list.sort(
          (a, b) =>
            a.difficulty - b.difficulty
        );
        break;

      case 'fastest':
        list.sort(
          (a, b) =>
            a.estimatedHours[0] -
            b.estimatedHours[0]
        );
        break;

      case 'probability':
        list.sort(
          (a, b) =>
            b.probability - a.probability
        );
        break;

      case 'match':
      default:
        list.sort(
          (a, b) =>
            b.score - a.score
        );
        break;
    }

    return list;
  }, [results, sortBy, activeLangs]);

  const langEntries = skillGraph
    ? Object.entries(
      skillGraph.languageShare
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
    : [];

  const stageLabels = [
    'Developer',
    'Skill Graph',
    'GH Issues',
    'Score',
  ];

  return (
    <>
    <div className="topbar">
      <Link className="brand-link" href="/">
        Aptus
      </Link>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <a className="star-btn" href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <span className="icon">
            <StarIcon />
          </span>
          Star on GitHub
        </a>

        {session ? (
          <Link className="star-btn" href="/profile">
            {session.user.name || 'My Profile'}
          </Link>
        ) : (
          <Link className="star-btn" href="/sign-in">
            Sign In
          </Link>
        )}
      </div>
    </div>
      <div className="shell">
        <div className="hero">
          <div
            className="eyebrow"
            style={{
              justifyContent: 'center',
              fontSize: '14px',
            }}
          >
            <span className="dot" />
            <span>compatibility engine</span>
          </div>

          <h1>
            Open Source{' '}
            <span
              style={{
                color: 'var(--accent)',
              }}
            >
              Contribution
            </span>{' '}
            Matchmaker
          </h1>

          <p className="sub">
            Reads your repos and pull requests,
            builds a skill graph, and scores live
            open issues against it ranked by fit,
            not by luck.
          </p>

          <div className="cmdbar">
            <input
              ref={inputRef}
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  scan();
                }
              }}
              placeholder="enter your github username"
              autoComplete="off"
              spellCheck={false}
            />

            <button
              className="scan-btn"
              disabled={loading}
              onClick={scan}
            >
              {loading ? 'Scanning...' : 'Scan'}
            </button>
          </div>

          <div className="status-line">
            {status}
            {loading && (
              <span className="blink" />
            )}
          </div>

          <div className="rail">
            {stageLabels.map((label, i) => (
              <Fragment key={label}>
                <div className="rail-step">
                  <div
                    className={`rail-num${stage >= i
                      ? ' active'
                      : ''
                      }`}
                  >
                    {i + 1}
                  </div>

                  <div
                    className={`rail-label${stage >= i
                      ? ' active'
                      : ''
                      }`}
                  >
                    {label}
                  </div>
                </div>

                {i <
                  stageLabels.length - 1 && (
                    <div
                      className={`rail-line${stage > i
                        ? ' active'
                        : ''
                        }`}
                    />
                  )}
              </Fragment>
            ))}
          </div>
        </div>

        {profile && (
          <div className="block">
            <div className="block-label">
              ◈ Developer
            </div>

            <div className="profile-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="avatar"
                src={profile.avatarUrl}
                alt={profile.login}
              />

              <div className="profile-info">
                <div className="profile-name">
                  {profile.name ||
                    profile.login}
                </div>

                <div className="profile-login">
                  @{profile.login}
                </div>

                {profile.bio && (
                  <p className="profile-bio">
                    {profile.bio}
                  </p>
                )}
              </div>

              <div className="profile-stats">
                <div className="profile-stat">
                  <b>
                    {profile.followers}
                  </b>
                  <span>Followers</span>
                </div>

                <div className="profile-stat">
                  <b>
                    {profile.publicRepos}
                  </b>
                  <span>Repos</span>
                </div>
              </div>

              <a
                className="profile-link"
                href={profile.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Profile →
              </a>
            </div>
          </div>
        )}

        {skillGraph && (
          <div className="block">
            <div className="block-label">
              ◈ Skill Graph
            </div>

            {langEntries.map(
              ([lang, share]) => (
                <div
                  className="lang-row"
                  key={lang}
                >
                  <div className="lang-name">
                    {lang}
                  </div>

                  <div className="lang-bar-track">
                    <div
                      className="lang-bar-fill"
                      style={{
                        width: `${Math.round(
                          share * 100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="lang-pct">
                    {Math.round(
                      share * 100
                    )}
                    %
                  </div>
                </div>
              )
            )}

            <div className="tags">
              {skillGraph.keywords.length ===
                0 && (
                  <span className="tag">
                    no strong domain signals
                    detected
                  </span>
                )}

              {skillGraph.keywords.map(
                (k) => (
                  <span
                    className={`tag${skillGraph
                      .prKeywordCounts[k]
                      ? ' hot'
                      : ''
                      }`}
                    key={k}
                  >
                    {k}

                    {skillGraph
                      .prKeywordCounts[k]
                      ? ` (${skillGraph
                        .prKeywordCounts[k]
                      } past PR${skillGraph
                        .prKeywordCounts[k] >
                        1
                        ? 's'
                        : ''
                      })`
                      : ''}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {results && (
          <>
            <div className="toolbar">
              <h2>
                Top {displayed.length}{' '}
                matches for {username}
              </h2>

              <div className="toolbar-controls">
                <button
                  className="chip"
                  onClick={scan}
                  disabled={loading}
                >
                  <RefreshIcon />
                  Refresh
                </button>

                {availableLangs.map(
                  (lang) => (
                    <button
                      key={lang}
                      className={`chip${activeLangs.has(
                        lang
                      )
                        ? ' active'
                        : ''
                        }`}
                      onClick={() =>
                        toggleLang(
                          lang
                        )
                      }
                    >
                      {lang}
                    </button>
                  )
                )}

                <select
                  className="select"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target
                        .value as typeof sortBy
                    )
                  }
                >
                  <option value="match">
                    Best match
                  </option>

                  <option value="easiest">
                    Easiest first
                  </option>

                  <option value="fastest">
                    Fastest
                  </option>

                  <option value="probability">
                    Highest probability
                  </option>
                </select>
              </div>
            </div>

            <div className="results-grid">
              {displayed.map((s) => {
                const repoFull =
                  s.issue.repository_url.replace(
                    'https://api.github.com/repos/',
                    ''
                  );

                const isSaved =
                  saved.has(
                    s.issue.html_url
                  );

                const isMarkedSolved =
                  solvedMarked.has(
                    s.issue.html_url
                  );

                return (
                  <div
                    className="card"
                    key={s.issue.html_url}
                  >
                    <div className="card-top">
                      <div>
                        <div className="card-repo">
                          {repoFull}
                        </div>

                        <a
                          className="card-title"
                          href={
                            s.issue.html_url
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.issue.title}
                        </a>
                      </div>

                      <div
                        className="ring"
                        style={{
                          background: `conic-gradient(var(--accent) ${s.score}%, var(--panel-2) 0)`,
                        }}
                      >
                        <div className="ring-inner">
                          <b>
                            {s.score}
                          </b>
                          <small>
                            PCT
                          </small>
                        </div>
                      </div>
                    </div>

                    <div
                      className="breakdown"
                      title={`Language ${s.breakdown
                        ?.language ?? 0
                        } · Keywords ${s.breakdown
                          ?.keywords ?? 0
                        } · PR history ${s.breakdown
                          ?.prHistory ?? 0
                        } · Accessibility ${s.breakdown
                          ?.accessibility ??
                        0
                        }`}
                    >
                      {[
                        s.breakdown
                          ?.language ?? 0,
                        s.breakdown
                          ?.keywords ?? 0,
                        s.breakdown
                          ?.prHistory ?? 0,
                        s.breakdown
                          ?.accessibility ??
                        0,
                      ].map(
                        (v, i) => (
                          <div
                            key={i}
                            style={{
                              width: `${v}%`,
                              background:
                                SEGMENT_COLORS[
                                i
                                ],
                            }}
                          />
                        )
                      )}
                    </div>

                    <div className="why">
                      You have{' '}
                      <b>
                        {s.repoCount}
                      </b>{' '}
                      repositor
                      {s.repoCount ===
                        1
                        ? 'y'
                        : 'ies'}{' '}
                      using{' '}
                      <b>
                        {
                          s.issue
                            ._matchedLanguage
                        }
                      </b>{' '}
                      (~
                      {Math.round(
                        s.langShare *
                        100
                      )}
                      % of your recent code).

                      {s
                        .prBonusKeywords
                        .length >
                        0 && (
                          <>
                            {' '}
                            You&apos;ve
                            previously
                            opened{' '}
                            <b>
                              {
                                s
                                  .prKeywordCounts[
                                s
                                  .prBonusKeywords[0]
                                ]
                              }
                            </b>{' '}
                            pull
                            request
                            {s
                              .prKeywordCounts[
                              s
                                .prBonusKeywords[0]
                            ] > 1
                              ? 's'
                              : ''}{' '}
                            touching{' '}
                            <b>
                              {
                                s
                                  .prBonusKeywords[0]
                              }
                            </b>
                            .
                          </>
                        )}

                      {s
                        .matchedKeywords
                        .length >
                        0 && (
                          <>
                            {' '}
                            This issue
                            involves{' '}
                            <b>
                              {s.matchedKeywords
                                .slice(
                                  0,
                                  3
                                )
                                .join(
                                  ', '
                                )}
                            </b>{' '}
                            — territory
                            your own
                            repos already
                            cover.
                          </>
                        )}
                    </div>

                    <div className="stat-grid">
                      <div className="stat-box">
                        <span className="k">
                          Difficulty
                        </span>

                        <span
                          className={`v ${diffClass(
                            s.difficulty
                          )}`}
                        >
                          {
                            s.difficulty
                          }
                          /10
                        </span>
                      </div>

                      <div className="stat-box">
                        <span className="k">
                          Est. time
                        </span>

                        <span className="v">
                          {
                            s
                              .estimatedHours[0]
                          }
                          –
                          {
                            s
                              .estimatedHours[1]
                          }
                          h
                        </span>
                      </div>

                      <div className="stat-box">
                        <span className="k">
                          Odds
                        </span>

                        <span className="v">
                          {
                            s.probability
                          }
                          %
                        </span>
                      </div>

                      <div className="stat-box">
                        <span className="k">
                          Comments
                        </span>

                        <span className="v">
                          {
                            s.issue
                              .comments
                          }
                        </span>
                      </div>
                    </div>

                    <div className="labels-row">
                      {s.issue.labels
                        .slice(0, 5)
                        .map((l) => (
                          <span
                            className="lbl"
                            key={
                              l.name
                            }
                          >
                            {l.name}
                          </span>
                        ))}
                    </div>

                    <div className="card-actions">
                      <button
                        className={`icon-btn${isSaved
                          ? ' saved'
                          : ''
                          }`}
                        onClick={() =>
                          toggleSaved(s)
                        }
                      >
                        {isSaved
                          ? '★ Saved'
                          : '☆ Save'}
                      </button>

                      <button
                        className="icon-btn"
                        onClick={() =>
                          copyLink(
                            s.issue
                              .html_url
                          )
                        }
                      >
                        {copied ===
                          s.issue
                            .html_url
                          ? '✓ Copied'
                          : '⎘ Copy link'}
                      </button>

                      <button
                        className={`icon-btn${isMarkedSolved
                          ? ' saved'
                          : ''
                          }`}
                        onClick={() =>
                          markSolved(s)
                        }
                        disabled={
                          isMarkedSolved
                        }
                      >
                        {isMarkedSolved
                          ? '✓ Marked Solved'
                          : '✔ Mark Solved'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="disclaimer">
              Difficulty, time, and
              probability are heuristic
              estimates from public GitHub
              signals not a guarantee. Read
              the issue before committing.
            </div>
          </>
        )}

        {empty && (
          <div className="empty">
            {empty}
          </div>
        )}

        {error && (
          <div className="err">
            &gt; {error}
          </div>
        )}
      </div>
    </>
  );
}
