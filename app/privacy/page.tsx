import type { Metadata } from 'next';
import Link from 'next/link';
import { legalIdentityCheck, legalOperator } from '../../lib/legal-config';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Privacy information for Finbuks.',
  alternates: { canonical: '/privacy' }
};

export default function PrivacyPage() {
  const operator = legalOperator();
  const identity = legalIdentityCheck();

  return (
    <main className="legal-shell">
      <div className="legal-card">
        <Link href="/" className="legal-back">← Finbuks</Link>
        <h1>Privacy notice</h1>
        <p className="legal-lead">How Finbuks processes personal data when you visit the site, create an account, upload financial records or use the close workflow.</p>

        {!identity.ok && (
          <div className="legal-warning">
            <strong>Controller details are not yet configured.</strong>
            <p>This build remains pre-release. PILOT and PRODUCTION are blocked until the controller identity and contact information are complete.</p>
          </div>
        )}

        <section>
          <h2>1. Controller</h2>
          <p><strong>{operator.name || 'Not configured'}</strong></p>
          <p>{operator.address || 'Address not configured'}</p>
          <p>Email: {operator.privacy_contact_email || 'Not configured'}</p>
        </section>

        <section>
          <h2>2. What we process and why</h2>
          <ul>
            <li><strong>Account and authentication data</strong> to create accounts, verify identity, secure sessions and control access.</li>
            <li><strong>Company and financial records</strong> that you choose to provide so Finbuks can prepare bookkeeping, reconciliation, close and owner-summary outputs.</li>
            <li><strong>Uploaded documents</strong> such as statements, invoices and receipts where the selected workflow requires them.</li>
            <li><strong>Operational and security data</strong> such as timestamps, audit events, access roles, error information and technical request information needed to operate and protect the service.</li>
            <li><strong>Support and contact information</strong> when you contact us.</li>
          </ul>
        </section>

        <section>
          <h2>3. Legal bases</h2>
          <p>Depending on the situation, processing is based on performance of a contract or steps requested before entering a contract, compliance with legal obligations, and legitimate interests in securing, maintaining and improving the service. Where consent is legally required, Finbuks relies on consent and allows it to be withdrawn for future processing.</p>
        </section>

        <section>
          <h2>4. Service providers</h2>
          <p>Finbuks currently uses infrastructure from <strong>Vercel</strong> for the web application and <strong>Google Firebase</strong> for authentication, workflow/control data, the authoritative Firestore ledger and private file storage. Access is limited according to the role and purpose of the processing.</p>
          <p>Where a customer connects an external accounting provider, data is also exchanged with that provider as requested by the customer and within the configured connector permissions.</p>
        </section>

        <section>
          <h2>5. International transfers</h2>
          <p>Some infrastructure providers are global companies. Where personal data is transferred outside the European Economic Area, the applicable provider and Finbuks must use a lawful transfer mechanism and appropriate safeguards. The exact production subprocessor and transfer configuration must be documented before customer production use.</p>
        </section>

        <section>
          <h2>6. Retention</h2>
          <p>Finbuks keeps personal and financial data only for as long as needed for the relevant workflow, contractual obligations, security/audit requirements and applicable legal retention duties. Review-pack retention is controlled by the product lifecycle; signed-off financial evidence may be kept longer where required for the close record. Production retention periods must be documented in the customer agreement and processing records.</p>
        </section>

        <section>
          <h2>7. Cookies and device storage</h2>
          <p>Finbuks does not currently use advertising or analytics trackers. Authentication may use strictly necessary session storage/cookies so the requested service can remain secure and signed in. If non-essential analytics or marketing technology is added later, it must not be activated before the required consent mechanism and privacy information are in place.</p>
        </section>

        <section>
          <h2>8. Your rights</h2>
          <p>Subject to the GDPR and any applicable limitations, you may have rights to access, rectification, erasure, restriction, data portability, objection and withdrawal of consent. You also have the right to lodge a complaint with a competent data-protection supervisory authority.</p>
        </section>

        <section>
          <h2>9. Automated decisions</h2>
          <p>Finbuks prepares proposals, checks and summaries. The current product boundary does not make solely automated decisions producing legal or similarly significant effects for the customer. Accountant/reviewer approval remains part of the controlled close workflow.</p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>Privacy questions: {operator.privacy_contact_email || 'Not configured'}</p>
        </section>

        <p className="legal-updated">Last updated: 23 November 2026.</p>
      </div>
    </main>
  );
}
