import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QM-Handbuch · Kopierbare Mustervorlage',
  description: 'Vollständige, anpassbare QM-Handbuch-Vorlage für Heilmittelpraxen.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
