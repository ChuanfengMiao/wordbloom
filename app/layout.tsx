import type { Metadata } from 'next';
import '@fontsource-variable/nunito';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://wordbloom-vocabulary.miaomiaozi520.chatgpt.site'),
  title: 'WordBloom — Know your words',
  description: 'A calm, private vocabulary inventory for mapping the English words you know.',
  openGraph: {
    title: 'WordBloom — Know your words',
    description: 'Know your words. Grow with confidence.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'WordBloom — Know your words. Grow with confidence.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WordBloom — Know your words',
    description: 'Know your words. Grow with confidence.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
