import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createOrganization } from '../../services/organizations';

type LocationState = {
  from?: { pathname?: string };
};

function SignUpPage() {
  const { signUp, refreshMembership } = useAuth();
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
      await createOrganization({ name: organizationName.trim() });
      await refreshMembership();

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
        <div className="brand">
          <span className="brand-symbol">f.</span>
          <div className="brand-text">
            free<span>pa</span>
          </div>
        </div>
        <header>
          <h1>Create your FreePA account</h1>
          <p>Start sending invoices, tracking payments, and managing clients effortlessly.</p>
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Confirm password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label>Organization name</label>
          <input
            type="text"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            placeholder="e.g. Acme Corp"
            required
          />
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="btn primary" disabled={loading}>
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
