import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saved review packs',
  robots: { index: false, follow: false }
};

export default function PacksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
