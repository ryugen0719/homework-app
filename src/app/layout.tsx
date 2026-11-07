import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'宿題ノート',description:'勉強したことを記録し、先生と振り返るノートです。',robots:{index:false,follow:false},manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#fff8ec',width:'device-width',initialScale:1};
export default function RootLayout({children}:LayoutProps<'/'>){return <html lang="ja"><body>{children}</body></html>}
