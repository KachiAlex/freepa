import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-symbol">f.</span>
          <div className="brand-text">
            free<span>pa</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/auth/sign-in" className="btn">
            Sign in
          </Link>
          <Link to="/auth/sign-up" className="btn primary">
            Get started
          </Link>
        </div>
      </nav>

      <header className="landing-hero">
        <p className="eyebrow">Self-hosted invoicing</p>
        <h1>Send invoices, get paid, stay compliant.</h1>
        <p>
          FreePA streamlines billing for founders and finance teams — multi-tenant workspaces,
          automated payment links via Flutterwave &amp; Paystack, and audit-ready records from day
          one.
        </p>
        <div className="hero-actions">
          <Link to="/auth/sign-up" className="btn primary">
            Create free account
          </Link>
          <Link to="/auth/sign-in" className="btn">
            Sign in to your workspace
          </Link>
        </div>
      </header>

      <section className="landing-cards">
        <article className="landing-card">
          <span className="stat-ico" style={{ background: '#eaf0ff', color: '#4d6ae7' }}>
            ▤
          </span>
          <h3>Smart invoicing</h3>
          <p>
            Draft, send and track invoices with structured line items and branded templates. Keep
            every client organized with searchable history.
          </p>
        </article>
        <article className="landing-card">
          <span className="stat-ico" style={{ background: '#e8f8f2', color: '#139974' }}>
            ◈
          </span>
          <h3>Payments that just work</h3>
          <p>
            Accept payments instantly through Flutterwave &amp; Paystack. Webhook-confirmed
            settlement status without leaving FreePA.
          </p>
        </article>
        <article className="landing-card">
          <span className="stat-ico" style={{ background: '#f1ebff', color: '#8162c0' }}>
            ▥
          </span>
          <h3>Financial compliance</h3>
          <p>
            Audit events, per-tenant role controls and automated reconciliation keep finance teams
            confident — all on your own infrastructure.
          </p>
        </article>
      </section>
    </div>
  );
}

export default HomePage;
