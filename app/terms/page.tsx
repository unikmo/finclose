import type { Metadata } from 'next';
import Link from 'next/link';
import { legalIdentityCheck, legalOperator } from '../../lib/legal-config';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Pre-release terms of use for Finbuks.',
  alternates: { canonical: '/terms' }
};

export default function TermsPage() {
  const operator = legalOperator();
  const identity = legalIdentityCheck();

  return (
    <main className="legal-shell">
      <div className="legal-card">
        <Link href="/" className="legal-back">← Finbuks</Link>
        <h1>Terms of use</h1>
        <p className="legal-lead">These terms describe the current Finbuks pre-release product boundary. Commercial customer terms must be finalized before paid production use.</p>

        {!identity.ok && (
          <div className="legal-warning">
            <strong>Pre-release only.</strong>
            <p>The contracting operator is not yet fully configured. Finbuks must not be activated for PILOT or PRODUCTION until legal identity and customer terms are completed.</p>
          </div>
        )}

        <section>
          <h2>1. Provider</h2>
          <p>{operator.name || 'Operator not yet configured'}{operator.address ? ', ' + operator.address : ''}. Contact: {operator.email || 'not configured'}.</p>
        </section>

        <section>
          <h2>2. What Finbuks does</h2>
          <p>Finbuks is financial-operations software that can prepare bookkeeping and close work, reconcile records, surface exceptions and create owner-readable financial summaries. Available capabilities depend on the released service, country and connector.</p>
        </section>

        <section>
          <h2>3. Human review and professional responsibility</h2>
          <p>Finbuks outputs are prepared work products unless explicitly marked as final after the required review/approval workflow. Customers remain responsible for providing complete and accurate source information. Where an accountant, tax adviser, auditor or other professional is required by law, contract or the customer's own governance, Finbuks does not replace that professional.</p>
        </section>

        <section>
          <h2>4. No unauthorized execution</h2>
          <p>The current controlled product does not automatically initiate customer payments, file statutory returns or post entries to an external accounting system unless a separately released feature expressly says otherwise and the customer has authorized it.</p>
        </section>

        <section>
          <h2>5. Accounts and security</h2>
          <p>Users must keep credentials secure, use only accounts they are authorized to access, and promptly report suspected unauthorized use. Access may be restricted to protect customer data, investigate misuse or comply with legal obligations.</p>
        </section>

        <section>
          <h2>6. Customer data</h2>
          <p>The customer retains responsibility for the lawfulness of data supplied to Finbuks and for ensuring it is permitted to process and share that data for the requested service. Finbuks processes personal data as described in the <Link href="/privacy">Privacy notice</Link> and, where applicable, under a data-processing agreement.</p>
        </section>

        <section>
          <h2>7. Availability and changes</h2>
          <p>Pre-release functionality may change as controls, connectors and jurisdictional rule packs are validated. Finbuks must not represent a draft country rule pack or unreleased feature as production-approved.</p>
        </section>

        <section>
          <h2>8. Liability and commercial terms</h2>
          <p>Pricing, payment terms, service levels, liability allocation, governing law, termination and any sector-specific obligations must be set in the final customer agreement before paid production use. This pre-release page does not invent those terms.</p>
        </section>

        <p className="legal-updated">Last updated: 23 November 2026.</p>
      </div>
    </main>
  );
}
