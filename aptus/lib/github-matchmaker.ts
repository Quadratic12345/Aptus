const KEYWORDS = ['networking','concurrency','database','authentication','oauth','jwt','graphql','websocket','grpc',
  'docker','kubernetes','ci/cd','testing','cli','parser','compiler','machine learning','nlp','frontend','react',
  'vue','svelte','ui','accessibility','security','encryption','caching','queue','messaging','microservices',
  'serverless','logging','monitoring','performance','optimization','algorithm','orm','migration','schema',
  'validation','middleware','routing','scheduler','cron','webhook','rate limit','load balancing','distributed',
  'goroutine','async','streaming','image processing','regex','plugin','sdk','api','rest','http','tcp','udp',
  'interpreter','protocol','sqlite','postgres','redis','vector','embedding','llm'];

const EXCLUDE_FROM_SEARCH = new Set(['HTML', 'CSS', 'Markdown', 'Jupyter Notebook']);

export type Emit = (event: Record<string, unknown>) => void;

interface GhIssue {
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  repository_url: string;
  comments: number;
  labels: { name: string }[];
  _matchedLanguage?: string;
}

async function ghFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.message?.includes('rate limit')
        ? 'GitHub rate limit hit even with a token — wait a bit and retry.'
        : 'GitHub API refused the request (403). Check your token.'
    );
  }
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}

function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase();
  return KEYWORDS.filter((k) => t.includes(k));
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPage(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

async function searchIssuesForLanguage(lang: string, token: string): Promise<GhIssue[]> {
  const base = 'https://api.github.com/search/issues?per_page=15&sort=created&order=desc&q=';
  const attempts = [
    `is:issue is:open language:${lang} label:"good first issue" stars:>50`,
    `is:issue is:open language:${lang} label:"help wanted" stars:>50`,
    `is:issue is:open language:${lang} stars:>20`,
    `is:issue is:open language:${lang}`,
  ];

  for (const q of attempts) {
    try {
      const page = randomPage(2);
      const data = await ghFetch(`${base}${encodeURIComponent(q)}&page=${page}`, token);
      if (data.items?.length) {
        return data.items.map((it: GhIssue) => ({ ...it, _matchedLanguage: lang }));
      }
      await delay(120);
    } catch {
      /* try next tier */
    }
  }
  return [];
}

function computeDifficulty(issue: GhIssue): number {
  let score = 3;
  const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
  if (labels.some((l) => l.includes('good first issue') || l.includes('beginner') || l.includes('easy'))) score -= 2;
  if (labels.some((l) => l.includes('help wanted'))) score += 0.5;
  if (labels.some((l) => l.includes('bug'))) score += 1;
  if (labels.some((l) => l.includes('enhancement') || l.includes('feature'))) score += 1;
  if (labels.some((l) => l.includes('hard') || l.includes('advanced') || l.includes('complex'))) score += 2.5;
  score += Math.min((issue.body?.length || 0) / 900, 3);
  score += Math.min((issue.comments || 0) / 12, 2);
  return Math.max(1, Math.min(10, Math.round(score)));
}

function estimateHours(difficulty: number): [number, number] {
  const table: Record<number, [number, number]> = {
    1: [1, 3], 2: [2, 4], 3: [3, 6], 4: [4, 8], 5: [6, 10],
    6: [8, 13], 7: [8, 15], 8: [12, 20], 9: [16, 28], 10: [20, 40],
  };
  return table[difficulty] || [4, 10];
}

interface Breakdown {
  language: number;
  keywords: number;
  prHistory: number;
  accessibility: number;
}

function computeMatch(
  issue: GhIssue,
  skillGraph: { languageShare: Record<string, number>; keywords: string[] },
  prKeywordCounts: Record<string, number>
) {
  const text = `${issue.title || ''} ${issue.body || ''}`.toLowerCase();
  const langShare = skillGraph.languageShare[issue._matchedLanguage!] || 0.05;

  const languagePoints = Math.round(langShare * 45);
  const matchedKeywords = skillGraph.keywords.filter((k) => text.includes(k));
  const keywordPoints = Math.min(matchedKeywords.length * 9, 36);
  const prBonusKeywords = matchedKeywords.filter((k) => prKeywordCounts[k]);
  const prPoints = Math.min(prBonusKeywords.length * 6, 12);

  const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
  let accessibilityPoints = 0;
  if (labels.some((l) => l.includes('good first issue'))) accessibilityPoints += 4;
  if ((issue.comments || 0) <= 2) accessibilityPoints += 3;

  const rawScore = languagePoints + keywordPoints + prPoints + accessibilityPoints;
  const score = Math.max(5, Math.min(100, Math.round(rawScore)));

  const breakdown: Breakdown = {
    language: languagePoints,
    keywords: keywordPoints,
    prHistory: prPoints,
    accessibility: accessibilityPoints,
  };

  return { score, matchedKeywords, prBonusKeywords, breakdown };
}

function computeProbability(matchScore: number, difficulty: number): number {
  const p = 38 + matchScore * 0.52 - difficulty * 3.1;
  return Math.max(20, Math.min(95, Math.round(p)));
}

export async function runAnalysis(username: string, token: string, emit: Emit) {
  emit({ type: 'status', stage: 0, message: `Fetching profile for ${username}...` });
  const user = await ghFetch(`https://api.github.com/users/${encodeURIComponent(username)}`, token);
  emit({
    type: 'profile',
    data: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      followers: user.followers,
      publicRepos: user.public_repos,
      htmlUrl: user.html_url,
    },
  });

  emit({ type: 'status', stage: 0, message: 'Reading repositories...' });
  const repos = await ghFetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
    token
  );
  const nonForks = repos.filter((r: { fork: boolean }) => !r.fork);
  if (nonForks.length === 0) {
    emit({ type: 'empty', message: `${username} has no public non-fork repositories to build a skill graph from yet.` });
    return;
  }

  emit({ type: 'status', stage: 1, message: `Mapping skill graph from ${nonForks.length} repositories...` });
  const topRepos = [...nonForks]
    .sort(
      (a, b) =>
        (b.stargazers_count || 0) - (a.stargazers_count || 0) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 8);

  const languageBytes: Record<string, number> = {};
  const repoCountByLang: Record<string, number> = {};
  const keywordSet = new Set<string>();

  for (const repo of topRepos) {
    try {
      const langs = await ghFetch(`https://api.github.com/repos/${username}/${repo.name}/languages`, token);
      for (const [lang, bytes] of Object.entries(langs) as [string, number][]) {
        languageBytes[lang] = (languageBytes[lang] || 0) + bytes;
        repoCountByLang[lang] = (repoCountByLang[lang] || 0) + 1;
      }
    } catch {
      /* non-fatal */
    }
    for (const k of extractKeywords(`${repo.description || ''} ${(repo.topics || []).join(' ')} ${repo.name}`)) {
      keywordSet.add(k);
    }
  }

  const totalBytes = Object.values(languageBytes).reduce((a, b) => a + b, 0) || 1;
  const languageShare: Record<string, number> = {};
  for (const [lang, bytes] of Object.entries(languageBytes)) languageShare[lang] = bytes / totalBytes;

  emit({ type: 'status', stage: 1, message: 'Scanning past pull requests...' });
  const prKeywordCounts: Record<string, number> = {};
  try {
    const prData = await ghFetch(
      `https://api.github.com/search/issues?per_page=30&sort=created&order=desc&q=${encodeURIComponent(
        `author:${username} type:pr`
      )}`,
      token
    );
    for (const pr of prData.items || []) {
      for (const k of extractKeywords(`${pr.title || ''} ${pr.body || ''}`)) {
        prKeywordCounts[k] = (prKeywordCounts[k] || 0) + 1;
      }
    }
  } catch {
    /* non-fatal */
  }

  const skillGraph = {
    languageShare,
    repoCountByLang,
    keywords: Array.from(new Set([...keywordSet, ...Object.keys(prKeywordCounts)])),
  };
  emit({ type: 'skillgraph', data: { languageShare, keywords: skillGraph.keywords, prKeywordCounts } });

  emit({ type: 'status', stage: 2, message: 'Searching open issues that match your languages...' });
  const topLangsAll = Object.entries(languageShare)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);
  let topLangs = topLangsAll.filter((l) => !EXCLUDE_FROM_SEARCH.has(l)).slice(0, 3);
  if (topLangs.length === 0) topLangs = topLangsAll.slice(0, 3);
  if (topLangs.length === 0) {
    emit({ type: 'empty', message: "Couldn't detect a strong language signal from public repos." });
    return;
  }

  let allIssues: GhIssue[] = [];
  for (const lang of topLangs) {
    try {
      allIssues.push(...(await searchIssuesForLanguage(lang, token)));
      await delay(150);
    } catch {
      /* skip this language */
    }
  }
  const seen = new Set<number>();
  allIssues = allIssues.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

  emit({ type: 'status', stage: 3, message: 'Scoring compatibility...' });
  const scoredAll = allIssues
    .map((issue) => {
      const { score, matchedKeywords, prBonusKeywords, breakdown } = computeMatch(issue, skillGraph, prKeywordCounts);
      const difficulty = computeDifficulty(issue);
      const probability = computeProbability(score, difficulty);
      const [lo, hi] = estimateHours(difficulty);
      return {
        issue,
        score,
        difficulty,
        probability,
        estimatedHours: [lo, hi],
        matchedKeywords,
        prBonusKeywords,
        prKeywordCounts,
        breakdown,
        repoCount: repoCountByLang[issue._matchedLanguage!] || 0,
        langShare: languageShare[issue._matchedLanguage!] || 0,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Widen to a quality pool, then shuffle so repeated scans/refreshes surface different issues.
  const pool = scoredAll.slice(0, 15);
  const scored = shuffle(pool).slice(0, 8);

  emit({ type: 'results', data: scored });
}
