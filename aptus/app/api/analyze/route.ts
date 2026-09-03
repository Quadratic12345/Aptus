
import { runAnalysis } from '@/lib/github-matchmaker';
import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { desc, gte, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

const CACHE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: Request) {
  const { username } = await req.json();
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return new Response(JSON.stringify({ type: 'error', message: 'GITHUB_TOKEN is not set on the server.' }) + '\n', {
      status: 500,
    });
  }
  if (!username || typeof username !== 'string') {
    return new Response(JSON.stringify({ type: 'error', message: 'Missing username.' }) + '\n', { status: 400 });
  }

  const cleanUsername = username.trim().replace(/^@/, '');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

      try {
        // Check for a recent cached scan of this exact username (any user's
        // past search counts) before touching the GitHub API at all.
        const cutoff = new Date(Date.now() - CACHE_WINDOW_MS);
        const cached = await db
          .select()
          .from(scanHistory)
          .where(
            sql`lower(${scanHistory.targetUsername}) = lower(${cleanUsername}) and ${gte(scanHistory.scannedAt, cutoff)}`
          )
          .orderBy(desc(scanHistory.scannedAt))
          .limit(1);

        if (cached.length > 0) {
          const row = cached[0];
          emit({ type: 'status', stage: 0, message: `Using cached scan from ${new Date(row.scannedAt).toLocaleTimeString()}...` });
          if (row.profileJson) emit({ type: 'profile', data: JSON.parse(row.profileJson) });
          emit({ type: 'status', stage: 1, message: 'Loading cached skill graph...' });
          if (row.skillGraphJson) emit({ type: 'skillgraph', data: JSON.parse(row.skillGraphJson) });
          emit({ type: 'status', stage: 2, message: 'Loading cached matches...' });
          emit({ type: 'status', stage: 3, message: 'Done.' });
          emit({ type: 'results', data: JSON.parse(row.resultsJson) });
          controller.close();
          return;
        }

        await runAnalysis(cleanUsername, token, emit);
      } catch (e) {
        emit({ type: 'error', message: e instanceof Error && e.message === 'NOT_FOUND'
          ? `No GitHub user found for "${username}".`
          : e instanceof Error ? e.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  });
}
