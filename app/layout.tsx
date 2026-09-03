import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FinClose Lab',
  description: 'Synthetic-data financial operations test environment.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
