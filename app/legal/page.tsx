import type { Metadata } from 'next';
import Link from 'next/link';
import { legalIdentityCheck, legalOperator } from '../../lib/legal-config';

export const metadata: Metadata = {
  title: 'Legal notice',
  description: 'Legal provider information for Finbuks.',
  alternates: { canonical: '/legal' }
};

export default function LegalPage() {
  const operator = legalOperator();
  const check = legalIdentityCheck();

  return (
    <main className="legal-shell">
      <div className="legal-card">
        <Link href="/" className="legal-back">← Finbuks</Link>
        <h1>Legal notice</h1>
        <p className="legal-lead">Provider information for Finbuks under the German Digital Services Act (DDG).</p>

        {!check.ok && (
          <div className="legal-warning">
            <strong>Pre-release legal configuration incomplete.</strong>
            <p>Finbuks must not enter PILOT or PRODUCTION until the operator identity below is fully configured. No details are invented or inferred.</p>
          </div>
        )}

        <section>
          <h2>Service provider</h2>
          <dl className="legal-details">
            <div><dt>Name</dt><dd>{operator.name || 'Not configured'}</dd></div>
            {operator.legal_form && <div><dt>Legal form</dt><dd>{operator.legal_form}</dd></div>}
            {operator.representative && <div><dt>Represented by</dt><dd>{operator.representative}</dd></div>}
            <div><dt>Address</dt><dd>{operator.address || 'Not configured'}</dd></div>
          </dl>
        </section>

        <section>
          <h2>Contact</h2>
          <dl className="legal-details">
            <div><dt>Email</dt><dd>{operator.email || 'Not configured'}</dd></div>
            {operator.phone && <div><dt>Phone</dt><dd>{operator.phone}</dd></div>}
          </dl>
        </section>

        {(operator.register_name || operator.register_number) && (
          <section>
            <h2>Register</h2>
            <dl className="legal-details">
              <div><dt>Register</dt><dd>{operator.register_name || 'Not configured'}</dd></div>
              <div><dt>Registration number</dt><dd>{operator.register_number || 'Not configured'}</dd></div>
            </dl>
          </section>
        )}

        {operator.vat_id && (
          <section>
            <h2>VAT identification number</h2>
            <p>{operator.vat_id}</p>
          </section>
        )}

        <section>
          <h2>Product boundary</h2>
          <p>Finbuks is financial-operations software. It prepares, reconciles and presents accounting work for human review. Unless expressly stated for a separately released feature, Finbuks does not itself provide regulated tax, legal, audit or investment advice and does not automatically submit filings, initiate payments or post to an external accounting system.</p>
        </section>

        <p className="legal-updated">Last updated: 23 November 2026.</p>
      </div>
    </main>
  );
}
