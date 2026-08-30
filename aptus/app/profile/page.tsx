
'use client';

import {
  useState,
  useEffect,
  Suspense,
} from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Saved = {
  id: number;
  issueUrl: string;
  issueTitle: string;
  repoFullName: string;
  matchScore: number | null;
  difficulty: number | null;
  savedAt: string;
};

function ProfileInner() {
  const searchParams = useSearchParams();

  const [username, setUsername] = useState(
    searchParams.get('username') || ''
  );

  const [items, setItems] = useState<
    Saved[] | null
  >(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState('');

  async function load(u: string) {
    const trimmed = u.trim();

    if (!trimmed) {
      setError(
        'Enter a GitHub username first.'
      );
      setItems(null);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(
        `/api/issues/saved?username=${encodeURIComponent(
          trimmed
        )}`,
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
        let message = `Request failed with status ${res.status}.`;

        if (text.trim()) {
          try {
            const errorData =
              JSON.parse(text);

            if (errorData?.error) {
              message =
                errorData.error;
            } else if (
              errorData?.message
            ) {
              message =
                errorData.message;
            }
          } catch {
            // Response wasn't JSON.
          }
        }

        throw new Error(message);
      }

      if (!text.trim()) {
        setItems([]);
        return;
      }

      let data: unknown;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          'The saved-issues API returned invalid JSON.'
        );
      }

      if (Array.isArray(data)) {
        setItems(data as Saved[]);
      } else {
        setItems([]);
      }
    } catch (e) {
      setItems([]);

      setError(
        e instanceof Error
          ? e.message
          : 'Could not load saved issues.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (username.trim()) {
      load(username);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function unsave(issueUrl: string) {
    if (!username.trim()) {
      setError(
        'GitHub username is required.'
      );
      return;
    }

    setError('');

    try {
      const res = await fetch(
        '/api/issues/saved',
        {
          method: 'DELETE',
          headers: {
            'Content-Type':
              'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            username: username.trim(),
            issueUrl,
          }),
        }
      );

      const text = await res.text();

      if (!res.ok) {
        let message =
          'Failed to unsave the issue.';

        if (text.trim()) {
          try {
            const data =
              JSON.parse(text);

            if (data?.error) {
              message = data.error;
            } else if (
              data?.message
            ) {
              message = data.message;
            }
          } catch {
            // Ignore invalid JSON.
          }
        }

        throw new Error(message);
      }

      setItems((prev) =>
        prev
          ? prev.filter(
              (item) =>
                item.issueUrl !==
                issueUrl
            )
          : []
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not unsave issue.'
      );
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="mark" />
          OSS MATCHMAKER
        </div>

        <Link
          className="star-btn"
          href="/"
        >
          ← Back to Scanner
        </Link>
      </div>

      <div className="shell">
        <div className="hero">
          <div className="eyebrow">
            <span className="dot" />
            profile
          </div>

          <h1>Saved Issues</h1>

          <p className="sub">
            Every issue you&apos;ve
            starred, tied to your
            GitHub username.
          </p>

          <div className="cmdbar">
            <input
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  load(username);
                }
              }}
              placeholder="github username"
              autoComplete="off"
              spellCheck={false}
            />

            <button
              className="scan-btn"
              disabled={loading}
              onClick={() =>
                load(username)
              }
            >
              {loading
                ? 'Loading...'
                : 'Load'}
            </button>
          </div>

          {error && (
            <div className="err">
              &gt; {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="status-line">
            Loading saved issues...
            <span className="blink" />
          </div>
        )}

        {items && (
          <>
            <div className="toolbar">
              <h2>
                {items.length} saved issue
                {items.length === 1
                  ? ''
                  : 's'}
              </h2>
            </div>

            {items.length > 0 ? (
              <div className="results-grid">
                {items.map((it) => (
                  <div
                    className="card"
                    key={it.id}
                  >
                    <div className="card-top">
                      <div>
                        <div className="card-repo">
                          {
                            it.repoFullName
                          }
                        </div>

                        <a
                          className="card-title"
                          href={it.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {
                            it.issueTitle
                          }
                        </a>
                      </div>
                    </div>

                    <div className="stat-grid">
                      <div className="stat-box">
                        <span className="k">
                          Match
                        </span>

                        <span className="v">
                          {it.matchScore ??
                            '—'}
                          {it.matchScore !==
                          null
                            ? '%'
                            : ''}
                        </span>
                      </div>

                      <div className="stat-box">
                        <span className="k">
                          Difficulty
                        </span>

                        <span className="v">
                          {it.difficulty ??
                            '—'}
                          {it.difficulty !==
                          null
                            ? '/10'
                            : ''}
                        </span>
                      </div>

                      <div className="stat-box">
                        <span className="k">
                          Saved
                        </span>

                        <span className="v">
                          {it.savedAt
                            ? new Date(
                                it.savedAt
                              ).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="card-actions">
                      <button
                        className="icon-btn"
                        onClick={() =>
                          unsave(
                            it.issueUrl
                          )
                        }
                        disabled={loading}
                      >
                        ✕ Unsave
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">
                No saved issues yet for{' '}
                {username}.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileInner />
    </Suspense>
  );
}
