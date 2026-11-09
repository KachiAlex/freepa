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
        <div className="brand">
          <span className="brand-symbol">f.</span>
          <div className="brand-text">
            free<span>pa</span>
          </div>
        </div>
        <header>
          <h1>Admin sign in</h1>
          <p>Sign in with a FreePA platform admin account.</p>
        </header>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default AdminLoginPage;
