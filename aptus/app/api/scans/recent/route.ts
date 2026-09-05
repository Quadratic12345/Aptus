export const dynamic = 'force-dynamic';
import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { desc, gte } from 'drizzle-orm';

export async function GET() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: scanHistory.id,
      targetUsername: scanHistory.targetUsername,
      scannedAt: scanHistory.scannedAt,
      profileJson: scanHistory.profileJson,
    })
    .from(scanHistory)
    .where(gte(scanHistory.scannedAt, sevenDaysAgo))
    .orderBy(desc(scanHistory.scannedAt))
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

    deduped.push({
      id: r.id,
      targetUsername: r.targetUsername,
      scannedAt: r.scannedAt,
      avatarUrl,
    });

    if (deduped.length >= 8) break;
  }

  return Response.json(deduped);
}
