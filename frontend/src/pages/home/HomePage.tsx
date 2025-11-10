import { Link } from 'react-router-dom';
import heroIllustration from '../../assets/react.svg';

function HomePage() {
  return (
    <div className="home">
      <header className="home__hero">
        <div className="home__hero-copy">
          <p className="home__badge">Firebase-native invoicing</p>
          <h1>Send invoices, get paid, stay compliant.</h1>
          <p className="home__lead">
            FREEPA streamlines billing for founders and finance teams—multi-tenant Firestore, automated payment links
            via Flutterwave &amp; Paystack, and audit-ready records from day one.
          </p>
          <div className="home__cta">
            <Link to="/auth/sign-up" className="button button--primary">
              Get started
            </Link>
            <Link to="/auth/sign-in" className="button button--ghost">
              Sign in
            </Link>
          </div>
          <ul className="home__highlights">
            <li>✔ Multi-organization dashboard</li>
            <li>✔ Automated payment reconciliation</li>
            <li>✔ Secure Firebase infrastructure</li>
          </ul>
        </div>
        <div className="home__hero-art">
          <img src={heroIllustration} alt="Dashboard illustration" className="home__illustration" />
        </div>
      </header>

      <section className="home__section">
        <h2>Designed for teams that scale</h2>
        <div className="home__cards">
          <article className="home__card">
            <h3>Smart invoicing</h3>
            <p>
              Draft, schedule, and send invoices with branded templates. Keep every client organized with searchable
              history.
            </p>
          </article>
          <article className="home__card">
            <h3>Payments that just work</h3>
            <p>
              Accept payments instantly through Flutterwave &amp; Paystack. Track settlement status without leaving
              FREEPA.
            </p>
          </article>
          <article className="home__card">
            <h3>Financial compliance</h3>
            <p>
              Immutable audit logs, per-tenant controls, automated reminders, and exportable reports keep finance teams
              confident.
            </p>
          </article>
        </div>
      </section>

      <section className="home__section home__section--cta">
        <div className="home__cta-panel">
          <h2>Join teams modernizing their billing</h2>
          <p>
            Try FREEPA free today. Spin up tenants, invite teammates, and connect payment providers in minutes.
          </p>
          <Link to="/auth/sign-up" className="button button--primary">
            Create account
          </Link>
        </div>
      </section>
    </div>
  );
}

export default HomePage;

