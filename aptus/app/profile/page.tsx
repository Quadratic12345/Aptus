
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/auth-client';

type Saved = {
  id: number;
  issueUrl: string;
  issueTitle: string;
  repoFullName: string;
  matchScore: number | null;
  difficulty: number | null;
  savedAt: string;
};

export default function ProfilePage() {
  const { data: session, isPending } = useSession();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [error, setError] = useState('');

  const githubUsername = session?.user?.githubUsername || session?.user?.name || '';

  useEffect(() => {
    if (!githubUsername) return;
    fetch(`/api/issues/saved?username=${encodeURIComponent(githubUsername)}`)
      .then((res) => res.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load saved issues.'));
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
        <div className="brand"><span className="mark" />Aptus</div>
        <Link className="star-btn" href="/">← Back to Scanner</Link>
      </div>

      <div className="shell">
        <div className="hero">
          <div className="eyebrow"><span className="dot" />profile</div>
          <h1>Saved Issues</h1>

          {isPending && <p className="sub">Loading your session...</p>}

          {!isPending && !session && (
            <>
              <p className="sub">You need to sign in to see your saved issues.</p>
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
      </div>
    </>
  );
}
