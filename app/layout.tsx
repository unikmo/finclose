import type { Metadata } from 'next';
import './globals.css';
import './service-start.css';
import './account-first.css';

export const metadata: Metadata = {
  title: 'FinClose — Bookkeeping, Payroll & Close Support',
  description: 'Choose the financial operations help you need: bookkeeping, payroll, account reconciliation, monthly close or year-end close.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
