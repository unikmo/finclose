import type { Metadata } from 'next';
import './globals.css';
import './service-start.css';
import './account-first.css';
import './payroll-onboarding.css';
import './payroll-v028-polish.css';
import './firm-portfolio.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://antibalcony.com'),
  title: {
    default: 'FinClose — Bookkeeping, Payroll & Close Support',
    template: '%s | FinClose'
  },
  description: 'Choose the financial operations help you need: bookkeeping, payroll, account reconciliation, monthly close or year-end close.',
  openGraph: {
    siteName: 'FinClose',
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
