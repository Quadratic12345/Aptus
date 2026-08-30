'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Solved = {
  id: number;
  issueUrl: string;
  issueTitle: string;
  repoFullName: string;
  matchScore: number | null;
  difficulty: number | null;
  solvedAt: string;
};

function ProfileInner() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(searchParams.get('username') || '');
  const [items, setItems] = useState<Solved[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(u: string) {
    if (!u.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/issues/solved?username=${encodeURIComponent(u.trim())}`);
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    if (username) load(username);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function unmark(issueUrl: string) {
    await fetch('/api/issues/solved', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, issueUrl }),
    });
    setItems((prev) => prev?.filter((i) => i.issueUrl !== issueUrl) || null);
  }

  return (
    <>
      <div className="topbar">
        <div className="brand"><span className="mark" />OSS MATCHMAKER</div>
        <Link className="star-btn" href="/">← Back to Scanner</Link>
      </div>

      <div className="shell">
        <div className="hero">
          <div className="eyebrow"><span className="dot" />profile</div>
          <h1>Solved Issues</h1>
          <p className="sub">Every issue you&apos;ve marked as solved, tied to your GitHub username.</p>

          <div className="cmdbar">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(username)}
              placeholder="github username"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="scan-btn" disabled={loading} onClick={() => load(username)}>Load</button>
          </div>
        </div>

        {items && (
          <>
            <div className="toolbar">
              <h2>{items.length} solved issue{items.length === 1 ? '' : 's'}</h2>
            </div>
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
                    <div className="stat-box"><span className="k">Solved</span><span className="v">{new Date(it.solvedAt).toLocaleDateString()}</span></div>
                  </div>
                  <div className="card-actions">
                    <button className="icon-btn" onClick={() => unmark(it.issueUrl)}>✕ Unmark</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {items && items.length === 0 && <div className="empty">No solved issues yet for {username}.</div>}
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
