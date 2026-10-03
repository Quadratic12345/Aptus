import { db } from '@/lib/db';
import { deviceScans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const identity = searchParams.get('identity');
  if (!identity) return Response.json({ error: 'identity required' }, { status: 400 });

  const rows = await db
    .select()
    .from(deviceScans)
    .where(eq(deviceScans.deviceId, identity))
    .orderBy(desc(deviceScans.scannedAt))
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
