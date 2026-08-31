'use client';
import { signIn } from '@/lib/auth-client';

export default function SignInPage() {
  return (
    <div className="signin-shell">
      <div className="signin-art">
        <div className="signin-art-inner">
          <div className="brand"><span className="mark" />Aptus</div>
          <h2 className="signin-art-headline">
            Your skill graph.
            <br />
            Matched to real issues.
          </h2>
          <p className="signin-art-sub">
            Sign in with GitHub to save issues, track what you&apos;ve starred, and pick up right where you left off.
          </p>
        </div>
      </div>

      <div className="signin-form-side">
        <div className="signin-card">
          <div className="eyebrow"><span className="dot" />welcome back</div>
          <h1 className="signin-title">Sign in to Aptus</h1>
          <p className="sub">Use your GitHub account no password to remember.</p>

          <button
            className="scan-btn signin-github-btn"
            onClick={() => signIn.social({ provider: 'github', callbackURL: '/profile' })}
          >
            Continue with GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
