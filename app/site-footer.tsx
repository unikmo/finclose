import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link href="/" aria-label="Finbuks home">
            <img src="/brand/finbuks-logo-approved-on-dark.png" alt="Finbuks" className="site-footer-wordmark" />
          </Link>
        </div>

        <nav className="site-footer-nav" aria-label="Footer navigation">
          <div>
            <strong>Product</strong>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/faq">FAQ</Link>
          </div>
          <div>
            <strong>Legal</strong>
            <Link href="/legal">Legal notice</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </nav>

        <div className="site-footer-note">
          <span>Finbuks prepares financial work for review.</span>
          <span>No automatic filing, payment or external posting.</span>
        </div>
      </div>
    </footer>
  );
}
