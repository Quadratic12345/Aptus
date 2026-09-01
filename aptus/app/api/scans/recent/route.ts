import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { desc, gte } from 'drizzle-orm';

export async function GET() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(scanHistory)
    .where(gte(scanHistory.scannedAt, sevenDaysAgo))
    .orderBy(desc(scanHistory.scannedAt))
    .limit(50);

  const seen = new Set<string>();
  const deduped = [];

  for (const r of rows) {
    if (seen.has(r.targetUsername)) continue;
    seen.add(r.targetUsername);

    deduped.push({
      id: r.id,
      targetUsername: r.targetUsername,
      scannedAt: r.scannedAt,
      profile: r.profileJson ? JSON.parse(r.profileJson) : null,
      skillGraph: r.skillGraphJson ? JSON.parse(r.skillGraphJson) : null,
      results: JSON.parse(r.resultsJson),
    });

    if (deduped.length >= 8) break;
  }

  return Response.json(deduped);
}
