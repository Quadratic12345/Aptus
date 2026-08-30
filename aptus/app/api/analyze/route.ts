
import { runAnalysis } from '@/lib/github-matchmaker';

export const runtime = 'nodejs';

export async function POST(
  req: Request
) {
  try {
    const body =
      await req.json();

    const rawUsername =
      body?.username;

    if (
      !rawUsername ||
      typeof rawUsername !==
        'string'
    ) {
      return new Response(
        JSON.stringify({
          type: 'error',
          message:
            'Missing username.',
        }) + '\n',
        {
          status: 400,
          headers: {
            'Content-Type':
              'application/x-ndjson',
          },
        }
      );
    }

    const username =
      rawUsername
        .trim()
        .replace(/^@/, '');

    if (!username) {
      return new Response(
        JSON.stringify({
          type: 'error',
          message:
            'GitHub username is required.',
        }) + '\n',
        {
          status: 400,
          headers: {
            'Content-Type':
              'application/x-ndjson',
          },
        }
      );
    }

    const token =
      process.env.GITHUB_TOKEN;

    if (!token) {
      return new Response(
        JSON.stringify({
          type: 'error',
          message:
            'GITHUB_TOKEN is not set on the server.',
        }) + '\n',
        {
          status: 500,
          headers: {
            'Content-Type':
              'application/x-ndjson',
          },
        }
      );
    }

    const stream =
      new ReadableStream({
        async start(
          controller
        ) {
          const encoder =
            new TextEncoder();

          const emit = (
            obj: Record<
              string,
              unknown
            >
          ) => {
            controller.enqueue(
              encoder.encode(
                JSON.stringify(
                  obj
                ) + '\n'
              )
            );
          };

          try {
            console.log(
              `[Aptus] Analyzing GitHub user: ${username}`
            );

            await runAnalysis(
              username,
              token,
              emit
            );

            console.log(
              `[Aptus] Analysis complete: ${username}`
            );
          } catch (error) {
            console.error(
              '[Aptus] Analysis error:',
              error
            );

            if (
              error instanceof Error &&
              error.message ===
                'NOT_FOUND'
            ) {
              emit({
                type: 'error',
                message: `No GitHub user found for "${username}".`,
              });
            } else {
              emit({
                type: 'error',
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown GitHub API error.',
              });
            }
          } finally {
            controller.close();
          }
        },
      });

    return new Response(
      stream,
      {
        status: 200,
        headers: {
          'Content-Type':
            'application/x-ndjson',
          'Cache-Control':
            'no-cache, no-transform',
          Connection:
            'keep-alive',
        },
      }
    );
  } catch (error) {
    console.error(
      '[Aptus] Request error:',
      error
    );

    return new Response(
      JSON.stringify({
        type: 'error',
        message:
          'Invalid request body.',
      }) + '\n',
      {
        status: 400,
        headers: {
          'Content-Type':
            'application/x-ndjson',
        },
      }
    );
  }
}
