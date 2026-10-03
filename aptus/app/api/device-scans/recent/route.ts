import { db } from '@/lib/db';
import { deviceScans } from '@/lib/db/schema';
import { desc, gte, eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = searchParams.get('identity');
  if (!identity) return Response.json([]);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: deviceScans.id,
      targetUsername: deviceScans.targetUsername,
      scannedAt: deviceScans.scannedAt,
      profileJson: deviceScans.profileJson,
    })
    .from(deviceScans)
    .where(and(eq(deviceScans.deviceId, identity), gte(deviceScans.scannedAt, sevenDaysAgo)))
    .orderBy(desc(deviceScans.scannedAt))
    .limit(30);

  const seen = new Set<string>();
  const deduped = [];

  for (const r of rows) {
    if (seen.has(r.targetUsername)) continue;
    seen.add(r.targetUsername);

    let avatarUrl: string | null = null;
    if (r.profileJson) {
      try {
        avatarUrl = JSON.parse(r.profileJson).avatarUrl ?? null;
      } catch {
        avatarUrl = null;
      }
    }

    deduped.push({ id: r.id, targetUsername: r.targetUsername, scannedAt: r.scannedAt, avatarUrl });
    if (deduped.length >= 8) break;
  }

  return Response.json(deduped);
}
