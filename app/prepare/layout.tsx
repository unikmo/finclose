import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prepare books for review',
  robots: { index: false, follow: false }
};

export default function PrepareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
