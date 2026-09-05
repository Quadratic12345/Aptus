
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';

type Saved = {
  id: number;
  issueUrl: string;
  issueTitle: string;
  repoFullName: string;
  matchScore: number | null;
  difficulty: number | null;
  savedAt: string;
};

type HistoryEntry = {
  id: number;
  targetUsername: string;
  scannedAt: string;
  profile: { avatarUrl: string; name: string | null; login: string } | null;
  results: {
    issue: { title: string; html_url: string; repository_url: string };
    score: number;
  }[];
};

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState('');

  const githubUsername = session?.user?.name || '';
  console.log('[Aptus debug] githubUsername used for fetch:', JSON.stringify(githubUsername));

  useEffect(() => {
    if (!githubUsername) return;

    fetch(`/api/issues/saved?username=${encodeURIComponent(githubUsername)}`)
      .then((res) => res.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load saved issues.'));

    fetch(`/api/scans?scannedBy=${encodeURIComponent(githubUsername)}`)
      .then((res) => res.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load search history.'));
  }, [githubUsername]);

  async function unsave(issueUrl: string) {
    await fetch('/api/issues/saved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: githubUsername, issueUrl }),
    });
    setItems((prev) => prev?.filter((i) => i.issueUrl !== issueUrl) || null);
  }

  return (
    <>
      <div className="topbar">
        <Link className="brand-link" href="/">
          Aptus
        </Link>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link className="star-btn" href="/">
            ← Back to Scanner
          </Link>

          {session && (
            <button className="icon-btn" onClick={() => signOut()}>
              Sign out
            </button>
          )}
        </div>
      </div>

      <div className="shell">
        <div className="hero" style={{ padding: '52px 0 24px' }}>
          <div className="eyebrow"><span className="dot" />profile</div>
          <h1>Your Activity</h1>

          {isPending && <p className="sub">Loading your session...</p>}

          {!isPending && !session && (
            <>
              <p className="sub">You need to sign in to see your saved issues and search history.</p>
              <Link className="scan-btn" href="/sign-in">Sign In</Link>
            </>
          )}

          {session && <p className="sub">Signed in as @{githubUsername}</p>}
        </div>

        {error && <div className="err">&gt; {error}</div>}

        {items && (
          <>
            <div className="toolbar">
              <h2>{items.length} saved issue{items.length === 1 ? '' : 's'}</h2>
            </div>

            {items.length > 0 ? (
              <div className="results-grid">
                {items.map((it) => (
                  <div className="card" key={it.id}>
                    <div className="card-top">
                      <div>
                        <div className="card-repo">{it.repoFullName}</div>
                        <a className="card-title" href={it.issueUrl} target="_blank" rel="noopener">{it.issueTitle}</a>
                      </div>
                    </div>
                    <div className="stat-grid">
                      <div className="stat-box"><span className="k">Match</span><span className="v">{it.matchScore ?? '—'}%</span></div>
                      <div className="stat-box"><span className="k">Difficulty</span><span className="v">{it.difficulty ?? '—'}/10</span></div>
                      <div className="stat-box"><span className="k">Saved</span><span className="v">{it.savedAt ? new Date(it.savedAt).toLocaleDateString() : '—'}</span></div>
                    </div>
                    <div className="card-actions">
                      <button className="icon-btn" onClick={() => unsave(it.issueUrl)}>✕ Unsave</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              session && <div className="empty">No saved issues yet.</div>
            )}
          </>
        )}

        {history && (
          <>
            <div className="toolbar">
              <h2>Search history</h2>
            </div>

            {history.length > 0 ? (
              <div className="results-grid">
                {history.map((h) => (
                  <div className="card" key={h.id}>
                    <div className="card-top">
                      <div>
                        <div className="card-repo">
                          scanned {new Date(h.scannedAt).toLocaleDateString()}
                        </div>
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {h.profile?.avatarUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={h.profile.avatarUrl}
                              alt={h.targetUsername}
                              style={{ width: 22, height: 22, borderRadius: '50%' }}
                            />
                          )}
                          @{h.targetUsername}
                        </div>
                      </div>
                    </div>

                    <p className="sub" style={{ margin: '10px 0 0', fontStyle: 'normal', textAlign: 'left' }}>
                      {h.results.length} matched issue{h.results.length === 1 ? '' : 's'} — cached, no GitHub calls needed to view.
                    </p>

                    <div className="card-actions">
                      <button
                        className="icon-btn"
                        onClick={() => setExpanded(expanded === h.id ? null : h.id)}
                      >
                        {expanded === h.id ? '▲ Hide issues' : '▼ Show issues'}
                      </button>
                    </div>

                    {expanded === h.id && (
                      <div className="labels-row" style={{ flexDirection: 'column', alignItems: 'stretch', marginTop: '12px' }}>
                        {h.results.map((r) => (
                          <a
                            key={r.issue.html_url}
                            href={r.issue.html_url}
                            target="_blank"
                            rel="noopener"
                            className="lbl"
                            style={{ padding: '8px 10px', textAlign: 'left' }}
                          >
                            {r.score}% — {r.issue.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              session && <div className="empty">No searches yet — scan a username on the main page.</div>
            )}
          </>
        )}
      </div>

      <div className="page-footer">
        <span>© {new Date().getFullYear()} Aptus. All rights reserved.</span>
        <span>Made with <span className="heart">♥</span> by Sankalp</span>
      </div>
    </>
  );
}
