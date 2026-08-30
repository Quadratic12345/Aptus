
import { db } from '@/lib/db';
import { savedIssues } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const username = searchParams.get('username')?.trim();

    if (!username) {
      return Response.json(
        { error: 'username required' },
        { status: 400 }
      );
    }

    const rows = await db
      .select({
        id: savedIssues.id,
        issueUrl: savedIssues.issueUrl,
        issueTitle: savedIssues.issueTitle,
        repoFullName: savedIssues.repoFullName,
        matchScore: savedIssues.matchScore,
        difficulty: savedIssues.difficulty,
        savedAt: savedIssues.savedAt,
      })
      .from(savedIssues)
      .where(eq(savedIssues.githubUsername, username))
      .orderBy(desc(savedIssues.savedAt));

    return Response.json(rows);
  } catch (error) {
    console.error('GET /api/issues/saved error:', error);

    return Response.json(
      {
        error: 'Failed to load saved issues.',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const username =
      typeof body.username === 'string'
        ? body.username.trim().replace(/^@/, '')
        : '';

    const issueUrl =
      typeof body.issueUrl === 'string'
        ? body.issueUrl.trim()
        : '';

    const issueTitle =
      typeof body.issueTitle === 'string'
        ? body.issueTitle.trim()
        : '';

    const repoFullName =
      typeof body.repoFullName === 'string'
        ? body.repoFullName.trim()
        : '';

    if (
      !username ||
      !issueUrl ||
      !issueTitle ||
      !repoFullName
    ) {
      return Response.json(
        { error: 'missing fields' },
        { status: 400 }
      );
    }

    await db
      .insert(savedIssues)
      .values({
        githubUsername: username,
        issueUrl,
        issueTitle,
        repoFullName,
        matchScore:
          typeof body.matchScore === 'number'
            ? body.matchScore
            : null,
        difficulty:
          typeof body.difficulty === 'number'
            ? body.difficulty
            : null,
      })
      .onConflictDoNothing({
        target: [
          savedIssues.githubUsername,
          savedIssues.issueUrl,
        ],
      });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('POST /api/issues/saved error:', error);

    return Response.json(
      { error: 'Failed to save issue.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();

    const username =
      typeof body.username === 'string'
        ? body.username.trim().replace(/^@/, '')
        : '';

    const issueUrl =
      typeof body.issueUrl === 'string'
        ? body.issueUrl.trim()
        : '';

    if (!username || !issueUrl) {
      return Response.json(
        { error: 'missing fields' },
        { status: 400 }
      );
    }

    await db
      .delete(savedIssues)
      .where(
        and(
          eq(savedIssues.githubUsername, username),
          eq(savedIssues.issueUrl, issueUrl)
        )
      );

    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'DELETE /api/issues/saved error:',
      error
    );

    return Response.json(
      { error: 'Failed to unsave issue.' },
      { status: 500 }
    );
  }
}
