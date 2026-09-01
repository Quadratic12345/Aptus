import { db } from '@/lib/db';
import { scanHistory } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!idNum) return Response.json({ error: 'invalid id' }, { status: 400 });

  const rows = await db
    .select()
    .from(scanHistory)
    .where(eq(scanHistory.id, idNum))
    .limit(1);

  const row = rows[0];
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });

  return Response.json({
    id: row.id,
    targetUsername: row.targetUsername,
    scannedAt: row.scannedAt,
    profile: row.profileJson ? JSON.parse(row.profileJson) : null,
    skillGraph: row.skillGraphJson ? JSON.parse(row.skillGraphJson) : null,
    results: JSON.parse(row.resultsJson),
  });
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idNum = Number(id);
  if (!idNum) return Response.json({ error: 'invalid id' }, { status: 400 });

  await db.delete(scanHistory).where(eq(scanHistory.id, idNum));

  return Response.json({ ok: true });
}
