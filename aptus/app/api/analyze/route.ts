import { runAnalysis } from '@/lib/github-matchmaker';

export const runtime = 'nodejs';

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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (obj: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        await runAnalysis(username.trim().replace(/^@/, ''), token, emit);
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
