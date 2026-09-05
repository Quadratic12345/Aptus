
const KEYWORDS = [
  'networking',
  'concurrency',
  'database',
  'authentication',
  'oauth',
  'jwt',
  'graphql',
  'websocket',
  'grpc',
  'docker',
  'kubernetes',
  'ci/cd',
  'testing',
  'cli',
  'parser',
  'compiler',
  'machine learning',
  'nlp',
  'frontend',
  'react',
  'vue',
  'svelte',
  'ui',
  'accessibility',
  'security',
  'encryption',
  'caching',
  'queue',
  'messaging',
  'microservices',
  'serverless',
  'logging',
  'monitoring',
  'performance',
  'optimization',
  'algorithm',
  'orm',
  'migration',
  'schema',
  'validation',
  'middleware',
  'routing',
  'scheduler',
  'cron',
  'webhook',
  'rate limit',
  'load balancing',
  'distributed',
  'goroutine',
  'async',
  'streaming',
  'image processing',
  'regex',
  'plugin',
  'sdk',
  'api',
  'rest',
  'http',
  'tcp',
  'udp',
  'interpreter',
  'protocol',
  'sqlite',
  'postgres',
  'redis',
  'vector',
  'embedding',
  'llm',
];

const EXCLUDE_FROM_SEARCH = new Set([
  'HTML',
  'CSS',
  'Markdown',
  'Jupyter Notebook',
]);
const KNOWN_ORGS = new Set([
  'kubernetes', 'facebook', 'microsoft', 'google', 'googlecloudplatform',
  'apache', 'tensorflow', 'nodejs', 'golang', 'rust-lang', 'docker',
  'hashicorp', 'elastic', 'grafana', 'prometheus', 'envoyproxy', 'vercel',
  'angular', 'vuejs', 'facebookresearch', 'pytorch', 'spring-projects',
  'redis', 'mongodb', 'django', 'pandas-dev', 'scikit-learn', 'flutter',
  'dotnet', 'aws', 'kubernetes-sigs', 'cncf', 'openai', 'huggingface',
]);

function orgFromRepoUrl(repoUrl: string): string | null {
  const match = repoUrl.match(/\/repos\/([^/]+)\//);
  return match ? match[1].toLowerCase() : null;
}

export type Emit = (
  event: Record<string, unknown>
) => void;

interface GhIssue {
  id: number;
  title: string;
  body: string | null;
  html_url: string;
  repository_url: string;
  comments: number;
  labels: { name: string }[];
  _matchedLanguage?: string;
  _popularity?: number;
}

type GithubErrorKind =
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'API_ERROR';

class GithubApiError extends Error {
  kind: GithubErrorKind;
  status: number;

  constructor(
    kind: GithubErrorKind,
    status: number,
    message: string
  ) {
    super(message);
    this.name = 'GithubApiError';
    this.kind = kind;
    this.status = status;
  }
}

async function ghFetch(
  url: string,
  token: string
) {
  const res = await fetch(url, {
    headers: {
      Accept:
        'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version':
        '2022-11-28',
      'User-Agent': 'Aptus',
    },
    cache: 'no-store',
  });

  /*
   * 404 specifically means that the requested
   * GitHub resource does not exist.
   *
   * We no longer turn every failed request into
   * "user not found".
   */
  if (res.status === 404) {
    throw new GithubApiError(
      'NOT_FOUND',
      404,
      'GitHub resource not found.'
    );
  }

  if (
    res.status === 401
  ) {
    throw new GithubApiError(
      'AUTH',
      401,
      'GitHub authentication failed. Check your GITHUB_TOKEN.'
    );
  }

  if (res.status === 403) {
    const body = await res
      .json()
      .catch(() => ({}));

    const message =
      typeof body?.message === 'string'
        ? body.message
        : '';

    if (
      message
        .toLowerCase()
        .includes('rate limit')
    ) {
      throw new GithubApiError(
        'RATE_LIMIT',
        403,
        'GitHub rate limit hit. Please wait a bit and retry.'
      );
    }

    throw new GithubApiError(
      'FORBIDDEN',
      403,
      message ||
        'GitHub API refused the request. Check your token and permissions.'
    );
  }

  if (!res.ok) {
    let message = '';

    try {
      const body = await res.json();

      if (
        body &&
        typeof body.message === 'string'
      ) {
        message = body.message;
      }
    } catch {
      // Ignore non-JSON error responses.
    }

    throw new GithubApiError(
      'API_ERROR',
      res.status,
      message ||
        `GitHub API error: ${res.status}`
    );
  }

  return res.json();
}

function extractKeywords(
  text: string | null | undefined
): string[] {
  if (!text) return [];

  const t = text.toLowerCase();

  return KEYWORDS.filter((k) =>
    t.includes(k)
  );
}

function delay(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];

  for (
    let i = a.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function randomPage(
  max: number
): number {
  return (
    Math.floor(Math.random() * max) + 1
  );
}

async function searchIssuesForLanguage(lang: string, token: string): Promise<GhIssue[]> {
  const base = 'https://api.github.com/search/issues?per_page=15&sort=created&order=desc&q=';

  const tiers: { query: string; popularity: number }[] = [
    // Broadest possible query for popular repos — no label requirement,
    // so it actually surfaces big orgs whenever the language matches.
    { query: `is:issue is:open language:${lang} stars:>500`, popularity: 3 },
    { query: `is:issue is:open language:${lang} label:"good first issue" stars:>50`, popularity: 1 },
    { query: `is:issue is:open language:${lang}`, popularity: 0 },
  ];

  const collected: GhIssue[] = [];
  const seenIds = new Set<number>();

  for (const tier of tiers) {

    let data: { items?: GhIssue[] } | null = null;

    try {
      const page = randomPage(2);
      data = await ghFetch(`${base}${encodeURIComponent(tier.query)}&page=${page}`, token);
      if (!data?.items?.length && page !== 1) {
        await delay(120);
        data = await ghFetch(`${base}${encodeURIComponent(tier.query)}&page=1`, token);
      }
    } catch {
    }

    for (const it of data?.items || []) {
      if (seenIds.has(it.id)) continue;
      seenIds.add(it.id);
      collected.push({ ...it, _matchedLanguage: lang, _popularity: tier.popularity });
    }

    await delay(120);
  }

  return collected;
}

function computeDifficulty(
  issue: GhIssue
): number {
  let score = 3;

  const labels = (
    issue.labels || []
  ).map((l) =>
    l.name.toLowerCase()
  );

  if (
    labels.some(
      (l) =>
        l.includes(
          'good first issue'
        ) ||
        l.includes('beginner') ||
        l.includes('easy')
    )
  ) {
    score -= 2;
  }

  if (
    labels.some((l) =>
      l.includes('help wanted')
    )
  ) {
    score += 0.5;
  }

  if (
    labels.some((l) =>
      l.includes('bug')
    )
  ) {
    score += 1;
  }

  if (
    labels.some(
      (l) =>
        l.includes('enhancement') ||
        l.includes('feature')
    )
  ) {
    score += 1;
  }

  if (
    labels.some(
      (l) =>
        l.includes('hard') ||
        l.includes('advanced') ||
        l.includes('complex')
    )
  ) {
    score += 2.5;
  }

  score += Math.min(
    (issue.body?.length || 0) / 900,
    3
  );

  score += Math.min(
    (issue.comments || 0) / 12,
    2
  );

  return Math.max(
    1,
    Math.min(10, Math.round(score))
  );
}

function estimateHours(
  difficulty: number
): [number, number] {
  const table: Record<
    number,
    [number, number]
  > = {
    1: [1, 3],
    2: [2, 4],
    3: [3, 6],
    4: [4, 8],
    5: [6, 10],
    6: [8, 13],
    7: [8, 15],
    8: [12, 20],
    9: [16, 28],
    10: [20, 40],
  };

  return (
    table[difficulty] || [4, 10]
  );
}

interface Breakdown {
  language: number;
  keywords: number;
  prHistory: number;
  accessibility: number;
}

function computeMatch(
  issue: GhIssue,
  skillGraph: {
    languageShare: Record<
      string,
      number
    >;
    keywords: string[];
  },
  prKeywordCounts: Record<
    string,
    number
  >
) {
  const text =
    `${issue.title || ''} ${
      issue.body || ''
    }`.toLowerCase();

  const langShare =
    skillGraph.languageShare[
      issue._matchedLanguage!
    ] || 0.05;

  const languagePoints =
    Math.round(langShare * 45);

  const matchedKeywords =
    skillGraph.keywords.filter(
      (k) => text.includes(k)
    );

  const keywordPoints = Math.min(
    matchedKeywords.length * 9,
    36
  );

  const prBonusKeywords =
    matchedKeywords.filter(
      (k) => prKeywordCounts[k]
    );

  const prPoints = Math.min(
    prBonusKeywords.length * 6,
    12
  );

  const labels = (issue.labels || []).map((l) => l.name.toLowerCase());
  let accessibilityPoints = 0;
  if (labels.some((l) => l.includes('good first issue'))) accessibilityPoints += 4;
  if ((issue.comments || 0) <= 2) accessibilityPoints += 3;
  accessibilityPoints += (issue._popularity ?? 0) * 8; // meaningful weight for well-known repos/orgs, not just a nudge

  const rawScore =
    languagePoints +
    keywordPoints +
    prPoints +
    accessibilityPoints;

  const score = Math.max(
    5,
    Math.min(
      100,
      Math.round(rawScore)
    )
  );

  const breakdown: Breakdown = {
    language: languagePoints,
    keywords: keywordPoints,
    prHistory: prPoints,
    accessibility:
      accessibilityPoints,
  };

  return {
    score,
    matchedKeywords,
    prBonusKeywords,
    breakdown,
  };
}

function computeProbability(
  matchScore: number,
  difficulty: number
): number {
  const p =
    38 +
    matchScore * 0.52 -
    difficulty * 3.1;

  return Math.max(
    20,
    Math.min(95, Math.round(p))
  );
}

export async function runAnalysis(
  username: string,
  token: string,
  emit: Emit
) {
  /*
   * Normalize the username here too, so this
   * function is safe even if called elsewhere.
   */
  const cleanUsername = username
    .trim()
    .replace(/^@/, '');

  if (!cleanUsername) {
    throw new Error(
      'GitHub username is required.'
    );
  }

  /*
   * STEP 1 — Verify GitHub user
   */
  emit({
    type: 'status',
    stage: 0,
    message: `Fetching profile for ${cleanUsername}...`,
  });

  let user;

  try {
    user = await ghFetch(
      `https://api.github.com/users/${encodeURIComponent(
        cleanUsername
      )}`,
      token
    );
  } catch (error) {
    if (
      error instanceof GithubApiError
    ) {
      if (
        error.kind === 'NOT_FOUND'
      ) {
        throw new Error(
          'NOT_FOUND'
        );
      }

      throw new Error(
        error.message
      );
    }

    throw error;
  }

  /*
   * STEP 2 — Emit profile
   */
  emit({
    type: 'profile',
    data: {
      login: user.login,
      name: user.name,
      avatarUrl:
        user.avatar_url,
      bio: user.bio,
      followers:
        user.followers,
      publicRepos:
        user.public_repos,
      htmlUrl:
        user.html_url,
    },
  });

  /*
   * STEP 3 — Read repositories
   */
  emit({
    type: 'status',
    stage: 0,
    message:
      'Reading repositories...',
  });

  const repos = await ghFetch(
    `https://api.github.com/users/${encodeURIComponent(
      cleanUsername
    )}/repos?per_page=100&sort=updated`,
    token
  );

  const nonForks =
    Array.isArray(repos)
      ? repos.filter(
        (r: {
          fork: boolean;
        }) => !r.fork
      )
      : [];

  if (nonForks.length === 0) {
    emit({
      type: 'empty',
      message: `${cleanUsername} has no public non-fork repositories to build a skill graph from yet.`,
    });

    return;
  }

  /*
   * STEP 4 — Build skill graph
   */
  emit({
    type: 'status',
    stage: 1,
    message: `Mapping skill graph from ${nonForks.length} repositories...`,
  });

  const topRepos = [
    ...nonForks,
  ]
    .sort(
      (a, b) =>
        (b.stargazers_count || 0) -
        (a.stargazers_count || 0) ||
        new Date(
          b.updated_at
        ).getTime() -
        new Date(
          a.updated_at
        ).getTime()
    )
    .slice(0, 5);

  const languageBytes: Record<
    string,
    number
  > = {};

  const repoCountByLang: Record<
    string,
    number
  > = {};

  const keywordSet =
    new Set<string>();

  for (const repo of topRepos) {
    try {
      const langs =
        await ghFetch(
          `https://api.github.com/repos/${cleanUsername}/${repo.name}/languages`,
          token
        );

      for (const [
        lang,
        bytes,
      ] of Object.entries(
        langs
      ) as [
        string,
        number
      ][]) {
        languageBytes[lang] =
          (languageBytes[lang] ||
            0) + bytes;

        repoCountByLang[lang] =
          (repoCountByLang[lang] ||
            0) + 1;
      }
    } catch (error) {
      /*
       * Don't silently swallow auth/rate
       * limit problems.
       */
      if (
        error instanceof GithubApiError &&
        (
          error.kind ===
          'RATE_LIMIT' ||
          error.kind ===
          'AUTH' ||
          error.kind ===
          'FORBIDDEN'
        )
      ) {
        throw error;
      }
    }

    for (const k of extractKeywords(
      `${repo.description || ''} ${(repo.topics || []).join(
        ' '
      )
      } ${repo.name}`
    )) {
      keywordSet.add(k);
    }
  }

  const totalBytes =
    Object.values(
      languageBytes
    ).reduce(
      (a, b) => a + b,
      0
    ) || 1;

  const languageShare: Record<
    string,
    number
  > = {};

  for (const [
    lang,
    bytes,
  ] of Object.entries(
    languageBytes
  )) {
    languageShare[lang] =
      bytes / totalBytes;
  }

  /*
   * STEP 5 — Pull request history
   */
  emit({
    type: 'status',
    stage: 1,
    message:
      'Scanning past pull requests...',
  });

  const prKeywordCounts: Record<
    string,
    number
  > = {};

  try {
    const prData =
      await ghFetch(
        `https://api.github.com/search/issues?per_page=30&sort=created&order=desc&q=${encodeURIComponent(
          `author:${cleanUsername} type:pr`
        )}`,
        token
      );

    for (const pr of
      prData.items || []) {
      for (const k of extractKeywords(
        `${pr.title || ''} ${pr.body || ''
        }`
      )) {
        prKeywordCounts[k] =
          (prKeywordCounts[k] ||
            0) + 1;
      }
    }
  } catch (error) {
    /*
     * PR history is optional.
     *
     * Authentication/rate-limit errors
     * should still be surfaced.
     */
    if (
      error instanceof GithubApiError &&
      (
        error.kind ===
        'RATE_LIMIT' ||
        error.kind ===
        'AUTH' ||
        error.kind ===
        'FORBIDDEN'
      )
    ) {
      throw error;
    }
  }

  const skillGraph = {
    languageShare,
    repoCountByLang,
    keywords: Array.from(
      new Set([
        ...keywordSet,
        ...Object.keys(
          prKeywordCounts
        ),
      ])
    ),
  };

  emit({
    type: 'skillgraph',
    data: {
      languageShare,
      keywords:
        skillGraph.keywords,
      prKeywordCounts,
    },
  });

  /*
   * STEP 6 — Find languages
   */
  emit({
    type: 'status',
    stage: 2,
    message:
      'Searching open issues that match your languages...',
  });

  const topLangsAll =
    Object.entries(
      languageShare
    )
      .sort(
        (a, b) => b[1] - a[1]
      )
      .map(
        (entry) => entry[0]
      );

  let topLangs =
    topLangsAll
      .filter(
        (lang) =>
          !EXCLUDE_FROM_SEARCH.has(
            lang
          )
      )
      .slice(0, 3);

  if (topLangs.length === 0) {
    topLangs =
      topLangsAll.slice(0, 3);
  }

  if (topLangs.length === 0) {
    emit({
      type: 'empty',
      message:
        "Couldn't detect a strong language signal from public repos.",
    });

    return;
  }

  /*
   * STEP 7 — Search issues
   */
  let allIssues: GhIssue[] =
    [];

  for (const lang of topLangs) {
    try {
      const issues =
        await searchIssuesForLanguage(
          lang,
          token
        );

      allIssues.push(
        ...issues
      );

      await delay(150);
    } catch (error) {
      /*
       * Do not hide serious GitHub API
       * errors.
       */
      if (
        error instanceof GithubApiError &&
        (
          error.kind ===
          'RATE_LIMIT' ||
          error.kind ===
          'AUTH' ||
          error.kind ===
          'FORBIDDEN'
        )
      ) {
        throw error;
      }
    }
  }

  /*
   * Remove duplicate issues.
   */
   const seen = new Set<number>();
   allIssues = allIssues.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));

   // Explicitly recognize well-known orgs by name, on top of the generic
   // star-count popularity tiers — catches cases where a big org's repo
   // might not clear the star threshold for some reason.
   for (const issue of allIssues) {
     const org = orgFromRepoUrl(issue.repository_url);
     if (org && KNOWN_ORGS.has(org)) {
       issue._popularity = 5;
     }
   }
  /*
   * STEP 8 — Score
   */
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

  // Score alone under-represents big/popular repos, since a strong keyword
  // match from a small repo can easily outscore a weaker-matching issue from
  // a well-known org. So instead of relying purely on score, reserve a few
  // guaranteed slots for high-popularity issues, then fill the rest normally.
  const popularCandidates = scoredAll.filter((s) => (s.issue._popularity ?? 0) >= 3);
  const otherCandidates = scoredAll.filter((s) => (s.issue._popularity ?? 0) < 3);

  const guaranteedPopular = popularCandidates.slice(0, 3);
  const remainingSlots = Math.max(8 - guaranteedPopular.length, 0);

  const otherPool = otherCandidates.slice(0, 15);
  const fillers = shuffle(otherPool).slice(0, remainingSlots);

  const scored = shuffle([...guaranteedPopular, ...fillers]);

  emit({ type: 'results', data: scored });
}
