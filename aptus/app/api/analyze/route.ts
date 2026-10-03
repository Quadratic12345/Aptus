import { runAnalysis } from '@/lib/github-matchmaker';
import { db } from '@/lib/db';
import { scanHistory, deviceScans } from '@/lib/db/schema';
import { desc, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';

const CACHE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

async function saveDeviceScan(
  deviceId: string,
  targetUsername: string,
  profile: unknown,
  skillGraph: unknown,
  results: unknown
) {
  try {
    await db.insert(deviceScans).values({
      deviceId,
      targetUsername,
      profileJson: profile ? JSON.stringify(profile) : null,
      skillGraphJson: skillGraph ? JSON.stringify(skillGraph) : null,
      resultsJson: JSON.stringify(results),
    });
  } catch {
    // best-effort — never fail the response over a private-history write
  }
}

export async function POST(req: Request) {
  const { username, forceRefresh, clientId } = await req.json();
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
        const session = await auth.api.getSession({ headers: req.headers });
        const deviceIdentity = session?.user?.name?.trim() || clientId || 'anonymous';

        // Shared cache check
        const cutoff = new Date(Date.now() - CACHE_WINDOW_MS);
        const cached = forceRefresh
          ? []
          : await db
              .select()
              .from(scanHistory)
              .where(
                sql`lower(${scanHistory.targetUsername}) = lower(${cleanUsername}) and ${gte(scanHistory.scannedAt, cutoff)}`
              )
              .orderBy(desc(scanHistory.scannedAt))
              .limit(1);

        if (cached.length > 0) {
          const row = cached[0];
          const parsedProfile = row.profileJson ? JSON.parse(row.profileJson) : null;
          const parsedSkillGraph = row.skillGraphJson ? JSON.parse(row.skillGraphJson) : null;
          const parsedResults = JSON.parse(row.resultsJson);

          emit({ type: 'status', stage: 0, message: `Using cached scan from ${new Date(row.scannedAt).toLocaleTimeString()}...` });
          if (parsedProfile) emit({ type: 'profile', data: parsedProfile });
          emit({ type: 'status', stage: 1, message: 'Loading cached skill graph...' });
          if (parsedSkillGraph) emit({ type: 'skillgraph', data: parsedSkillGraph });
          emit({ type: 'status', stage: 2, message: 'Loading cached matches...' });
          emit({ type: 'status', stage: 3, message: 'Done.' });
          emit({ type: 'results', data: parsedResults });

          // Saved GitHub a call, but this device still needs its own
          // private history entry for this scan.
          await saveDeviceScan(deviceIdentity, cleanUsername, parsedProfile, parsedSkillGraph, parsedResults);

          controller.close();
          return;
        }

        // No cache hit run a fresh scan
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

        if (capturedResults) {
          // Shared cache — purely for GitHub rate-limit protection.
          try {
            await db.insert(scanHistory).values({
              scannedBy: deviceIdentity,
              targetUsername: cleanUsername,
              profileJson: capturedProfile ? JSON.stringify(capturedProfile) : null,
              skillGraphJson: capturedSkillGraph ? JSON.stringify(capturedSkillGraph) : null,
              resultsJson: JSON.stringify(capturedResults),
            });
          } catch {
            // best-effort
          }

          // Private per-device/per-person history.
          await saveDeviceScan(deviceIdentity, cleanUsername, capturedProfile, capturedSkillGraph, capturedResults);
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
