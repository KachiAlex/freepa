import type { FormEvent } from 'react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

type LocationState = {
  from?: { pathname?: string }
}

function SignInPage() {
  const { signIn, resetPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LocationState | undefined)?.from?.pathname ?? '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    setError(null)
    setMessage(null)
    try {
      await resetPassword(email)
      setMessage('Check your email for password reset instructions.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <header>
          <h1>Sign in to Firebase Invoicer</h1>
          <p>Use your organization credentials to access invoicing tools.</p>
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
        {message ? <p className="auth-message">{message}</p> : null}

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <button type="button" className="button button--ghost" onClick={handleResetPassword}>
          Forgot password?
        </button>

        <p className="auth-alt">
          Need an account? <a href="/auth/sign-up">Create one</a>
        </p>
      </form>
    </div>
  )
}

export default SignInPage

