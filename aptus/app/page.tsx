'use client';
import { useState, useRef } from 'react';

type Scored = {
  issue: { title: string; html_url: string; repository_url: string; comments: number; labels: { name: string }[]; _matchedLanguage: string };
  score: number; difficulty: number; probability: number; estimatedHours: [number, number];
  matchedKeywords: string[]; prBonusKeywords: string[]; prKeywordCounts: Record<string, number>;
  repoCount: number; langShare: number;
};

function diffClass(d: number) { return d <= 4 ? 'diff-easy' : d <= 7 ? 'diff-mid' : 'diff-hard'; }

export default function Home() {
  const [username, setUsername] = useState('');
  const [stage, setStage] = useState(-1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empty, setEmpty] = useState('');
  const [skillGraph, setSkillGraph] = useState<{ languageShare: Record<string, number>; keywords: string[]; prKeywordCounts: Record<string, number> } | null>(null);
  const [results, setResults] = useState<Scored[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function scan() {
    const u = username.trim().replace(/^@/, '');
    if (!u) { setStatus('Enter a GitHub username first.'); return; }

    setLoading(true); setStage(-1); setStatus(''); setError(''); setEmpty('');
    setSkillGraph(null); setResults(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u }),
      });
      if (!res.body) throw new Error('No response stream.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === 'status') { setStage(evt.stage); setStatus(evt.message); }
          else if (evt.type === 'skillgraph') setSkillGraph(evt.data);
          else if (evt.type === 'results') { setResults(evt.data); setStatus(`Done — ${evt.data.length} matches ranked.`); }
          else if (evt.type === 'empty') setEmpty(evt.message);
          else if (evt.type === 'error') setError(evt.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const langEntries = skillGraph ? Object.entries(skillGraph.languageShare).sort((a, b) => b[1] - a[1]).slice(0, 6) : [];

  return (
    <div className="wrap">
      <div className="eyebrow"><span className="dot" />compatibility engine</div>
      <h1>Open Source Contribution Matchmaker</h1>
      <p className="sub">Reads your repos and pull requests, builds a skill graph, and scores live open issues against it — ranked by fit, not by luck.</p>

      <div className="cmdbar">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && scan()}
          placeholder="github username, e.g. torvalds"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="scan-btn" disabled={loading} onClick={scan}>Scan</button>
      </div>
      <div className="status-line">{status}{loading && <span className="blink" />}</div>

      <div className="pipeline">
        {['Developer', 'Skill Graph', 'GH Issues', 'Score'].map((label, i) => (
          <>
            <div className="node" key={label}>
              <div className={`node-dot${stage >= i ? ' active' : ''}`}>◆</div>
              <div className={`node-label${stage >= i ? ' active' : ''}`}>{label}</div>
            </div>
            {i < 3 && <div className={`connector${stage > i ? ' active' : ''}`} key={label + '-c'}><div className="pulse" /></div>}
          </>
        ))}
      </div>

      {skillGraph && (
        <div className="panel">
          <div className="panel-title">◈ SKILL GRAPH</div>
          {langEntries.map(([lang, share]) => (
            <div className="lang-row" key={lang}>
              <div className="lang-name">{lang}</div>
              <div className="lang-bar-track"><div className="lang-bar-fill" style={{ width: `${Math.round(share * 100)}%` }} /></div>
              <div className="lang-pct">{Math.round(share * 100)}%</div>
            </div>
          ))}
          <div className="tags">
            {skillGraph.keywords.length === 0 && <span className="tag">no strong domain signals detected</span>}
            {skillGraph.keywords.map((k) => (
              <span className={`tag${skillGraph.prKeywordCounts[k] ? ' hot' : ''}`} key={k}>
                {k}{skillGraph.prKeywordCounts[k] ? ` (${skillGraph.prKeywordCounts[k]} past PR${skillGraph.prKeywordCounts[k] > 1 ? 's' : ''})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {results && (
        <>
          <div className="results-head">
            <h2>Top {results.length} matches for {username}</h2>
            <div className="note">ranked by compatibility, not recency</div>
          </div>
          {results.map((s) => {
            const repoFull = s.issue.repository_url.replace('https://api.github.com/repos/', '');
            const lit = Math.round(s.score / 20);
            return (
              <div className="card" key={s.issue.html_url}>
                <div className="card-top">
                  <div>
                    <div className="card-repo">{repoFull}</div>
                    <div className="card-title"><a href={s.issue.html_url} target="_blank" rel="noopener">{s.issue.title}</a></div>
                  </div>
                  <div className="signal">
                    <div className="signal-bars">
                      {[0, 1, 2, 3, 4].map((b) => <div className={`bar${b < lit ? ' on' : ''}`} key={b} />)}
                    </div>
                    <div className="signal-pct">{s.score}%</div>
                  </div>
                </div>
                <div className="why">
                  You have <b>{s.repoCount}</b> repositor{s.repoCount === 1 ? 'y' : 'ies'} using <b>{s.issue._matchedLanguage}</b> (~{Math.round(s.langShare * 100)}% of your recent code).
                  {s.prBonusKeywords.length > 0 && <> You&apos;ve previously opened <b>{s.prKeywordCounts[s.prBonusKeywords[0]]}</b> pull request{s.prKeywordCounts[s.prBonusKeywords[0]] > 1 ? 's' : ''} touching <b>{s.prBonusKeywords[0]}</b>.</>}
                  {s.matchedKeywords.length > 0 && <> This issue involves {s.matchedKeywords.slice(0, 3).map((k) => <b key={k}>{k}</b>).reduce((a, b) => <>{a}, {b}</>)} — territory your own repos already cover.</>}
                </div>
                <div className="stat-row">
                  <div className="stat"><span className="k">Difficulty</span><span className={`v ${diffClass(s.difficulty)}`}>{s.difficulty}/10</span></div>
                  <div className="stat"><span className="k">Est. time</span><span className="v">{s.estimatedHours[0]}–{s.estimatedHours[1]}h</span></div>
                  <div className="stat"><span className="k">Success probability</span><span className="v">{s.probability}%</span></div>
                  <div className="stat"><span className="k">Open comments</span><span className="v">{s.issue.comments}</span></div>
                </div>
                <div className="labels-row">{s.issue.labels.slice(0, 5).map((l) => <span className="lbl" key={l.name}>{l.name}</span>)}</div>
              </div>
            );
          })}
          <div className="disclaimer">Difficulty, time, and probability are heuristic estimates from public GitHub signals — not a guarantee. Read the issue before committing.</div>
        </>
      )}

      {empty && <div className="empty">{empty}</div>}
      {error && <div className="err">&gt; {error}</div>}
    </div>
  );
}
