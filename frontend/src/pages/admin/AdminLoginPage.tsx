import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

type LocationState = {
  from?: { pathname?: string };
  reason?: string;
};

function AdminLoginPage() {
  const { signIn, user, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | undefined;
  const redirectTo = state?.from?.pathname ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    state?.reason === 'not-authorized'
      ? 'This account is not authorized for admin access.'
      : null,
  );

  useEffect(() => {
    if (user && isPlatformAdmin) {
      navigate(redirectTo, { replace: true });
    }
  }, [user, isPlatformAdmin, navigate, redirectTo]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      // give auth context a moment to refresh claims
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (!isPlatformAdmin) {
        setError('This account is not authorized for admin access.');
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <header>
          <h1>Admin sign in</h1>
          <p>Sign in with a FREEPA platform admin account.</p>
        </header>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default AdminLoginPage;

