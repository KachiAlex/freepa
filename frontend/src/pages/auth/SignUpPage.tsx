import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import { getFunctionsInstance } from '../../firebase/config';

type LocationState = {
  from?: { pathname?: string };
};

function SignUpPage() {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as LocationState | undefined)?.from?.pathname ?? '/app';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Use a password that is at least 8 characters long.');
      return;
    }

    if (!organizationName.trim()) {
      setError('Please provide your organization or business name.');
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      await signIn(email, password);

      const functions = getFunctionsInstance();
      const provisionTenant = httpsCallable<{ organizationName: string }, { organizationId: string }>(
        functions,
        'provisionTenant',
      );
      await provisionTenant({ organizationName: organizationName.trim() });

      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <header>
          <h1>Create your FREEPA account</h1>
          <p>Start sending invoices, tracking payments, and managing clients effortlessly.</p>
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Organization name</span>
          <input
            type="text"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="e.g. Acme Corp"
            required
          />
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="button button--primary" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-alt">
          Already have an account? <Link to="/auth/sign-in">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

export default SignUpPage;

