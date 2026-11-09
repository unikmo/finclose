import type { Metadata } from 'next';
import './globals.css';
import './service-start.css';
import './account-first.css';
import './payroll-onboarding.css';
import './payroll-v028-polish.css';
import './firm-portfolio.css';
import './prepare.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://finbuks.com'),
  title: {
    default: 'Finbuks — Book Close Support',
    template: '%s | Finbuks'
  },
  description: 'Choose the financial operations help you need: bookkeeping, account reconciliation, monthly close or year-end close.',
  openGraph: {
    siteName: 'Finbuks',
    type: 'website',
    locale: 'en_US'
  },
  twitter: {
    card: 'summary_large_image'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
