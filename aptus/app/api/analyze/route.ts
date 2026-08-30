import { db } from '@/lib/db';
import { solvedIssues } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  if (!username) return Response.json({ error: 'username required' }, { status: 400 });

  const rows = await db
    .select()
    .from(solvedIssues)
    .where(eq(solvedIssues.githubUsername, username))
    .orderBy(desc(solvedIssues.solvedAt));

  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { username, issueUrl, issueTitle, repoFullName, matchScore, difficulty } = body;
  if (!username || !issueUrl || !issueTitle || !repoFullName) {
    return Response.json({ error: 'missing fields' }, { status: 400 });
  }

  await db
    .insert(solvedIssues)
    .values({
      githubUsername: username,
      issueUrl,
      issueTitle,
      repoFullName,
      matchScore: matchScore ?? null,
      difficulty: difficulty ?? null,
    })
    .onConflictDoNothing({ target: [solvedIssues.githubUsername, solvedIssues.issueUrl] });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { username, issueUrl } = await req.json();
  if (!username || !issueUrl) return Response.json({ error: 'missing fields' }, { status: 400 });

  await db
    .delete(solvedIssues)
    .where(and(eq(solvedIssues.githubUsername, username), eq(solvedIssues.issueUrl, issueUrl)));

  return Response.json({ ok: true });
}
