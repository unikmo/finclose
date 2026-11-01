import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Short answers about what FinClose does and does not do.',
  alternates: { canonical: '/faq' }
};

const questions = [
  ['Who decides?', 'Your accountant. FinClose prepares proposals and flags items. It decides nothing and posts nothing to your books.'],
  ['Why upload prior records?', 'They show FinClose your balances, open items and earlier decisions before it sees current data. This is not another sign-up step.'],
  ['What can I upload?', 'XLSX, XLS, CSV and PDF for prior records. Receipts: PDF, PNG or JPG, up to 25 MB. PDF statements must be text, not scans.'],
  ['Why are my files held for review?', 'During the pilot, uploads are quarantined until an administrator clears them. Nothing is processed before that.'],
  ['Are the VAT figures a return?', 'No. They are an estimate and a worksheet for your accountant. They are not a filing. Estonian rules are a draft that an accountant has not yet checked.'],
  ['How long is my data kept?', 'Review packs are deleted automatically after a set time. The date shows on each pack. A signed-off pack is kept longer.'],
  ['Can I erase my data?', 'Yes. On Saved packs, erase everything for a company. This cannot be undone, so download what you need first.']
];

export default function Faq() {
  return (
    <main className="pr-shell">
      <header className="pr-nav">
        <Link href="/" className="pr-brand" aria-label="FinClose home">
          <span className="pr-logo">F</span>
          <span>FinClose <em>FAQ</em></span>
        </Link>
      </header>
      <section className="pr-body">
        <h1>FAQ</h1>
        {questions.map(([q, a]) => (
          <div key={q}>
            <h2>{q}</h2>
            <p className="pr-note">{a}</p>
          </div>
        ))}
        <p className="pr-note"><Link href="/how-it-works">How it works</Link></p>
      </section>
    </main>
  );
}
