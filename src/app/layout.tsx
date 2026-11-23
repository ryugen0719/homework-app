import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import AppSoundProvider from '../components/sounds/AppSoundProvider';
import './globals.css';
export const metadata: Metadata = {
  title: '宿題ノート',
  description: '勉強したことを記録し、先生と振り返るノートです。',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}else{document.documentElement.setAttribute('data-theme','light')}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <AppSoundProvider>{children}</AppSoundProvider>
        <Toaster
          position="top-center"
          offset={16}
          toastOptions={{
            className: '!rounded-xl !border !border-line !bg-card !text-ink !shadow-card !font-sans !text-xs sm:!text-sm !font-semibold',
          }}
        />
      </body>
    </html>
  );
}
