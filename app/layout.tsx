import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaShell from '@/components/pwa-shell';

export const metadata: Metadata = {
  applicationName: 'FlowFocus',
  title: 'FlowFocus',
  description: '今日やるべきことと止まり案件を見つけやすくした、業務向け GTD / Project 管理アプリ',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FlowFocus'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <PwaShell />
        {children}
      </body>
    </html>
  );
}
