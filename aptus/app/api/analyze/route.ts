
import { runAnalysis } from '@/lib/github-matchmaker';
import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { desc, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

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
        // 1. Check for a recent cached scan of this exact username, from
        // ANYONE who searched it — no sign-in required to benefit here.
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

        // 2. No cache hit — run a fresh scan, capturing each piece as it
        // streams so we can save it once the scan completes.
        let capturedProfile: unknown = null;
        let capturedSkillGraph: unknown = null;
        let capturedResults: unknown = null;

        const wrappedEmit = (obj: Record<string, unknown>) => {
          if (obj.type === 'profile') capturedProfile = obj.data;
          else if (obj.type === 'skillgraph') capturedSkillGraph = obj.data;
          else if (obj.type === 'results') capturedResults = obj.data;
          emit(obj);
        };

        await runAnalysis(cleanUsername, token, wrappedEmit);

        // 3. Save the fresh scan for future cache hits — works whether or
        // not the requester is signed in; falls back to "anonymous".
        if (capturedResults) {
          try {
            const session = await auth.api.getSession({ headers: req.headers });
            const scannedBy = session?.user?.name?.trim() || 'anonymous';

            await db.insert(scanHistory).values({
              scannedBy,
              targetUsername: cleanUsername,
              profileJson: capturedProfile ? JSON.stringify(capturedProfile) : null,
              skillGraphJson: capturedSkillGraph ? JSON.stringify(capturedSkillGraph) : null,
              resultsJson: JSON.stringify(capturedResults),
            });
          } catch {
            // history save is best-effort — never fail the response over it
          }
        }
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
