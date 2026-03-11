import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '業務TodoカンバンMVP',
  description: 'Next.js + Supabase で作るシンプルな業務Todoカンバン'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
