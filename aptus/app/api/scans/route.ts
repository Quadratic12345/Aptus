import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scannedBy = searchParams.get('scannedBy');
  if (!scannedBy) return Response.json({ error: 'scannedBy required' }, { status: 400 });

  const rows = await db
    .select()
    .from(scanHistory)
    .where(eq(scanHistory.scannedBy, scannedBy))
    .orderBy(desc(scanHistory.scannedAt))
    .limit(30);

  const parsed = rows.map((r) => ({
    id: r.id,
    targetUsername: r.targetUsername,
    scannedAt: r.scannedAt,
    profile: r.profileJson ? JSON.parse(r.profileJson) : null,
    skillGraph: r.skillGraphJson ? JSON.parse(r.skillGraphJson) : null,
    results: JSON.parse(r.resultsJson),
  }));

  return Response.json(parsed);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { scannedBy, targetUsername, profile, skillGraph, results } = body;

  if (!scannedBy || !targetUsername || !results) {
    return Response.json({ error: 'missing fields' }, { status: 400 });
  }

  await db.insert(scanHistory).values({
    scannedBy,
    targetUsername,
    profileJson: profile ? JSON.stringify(profile) : null,
    skillGraphJson: skillGraph ? JSON.stringify(skillGraph) : null,
    resultsJson: JSON.stringify(results),
  });

  return Response.json({ ok: true });
}
