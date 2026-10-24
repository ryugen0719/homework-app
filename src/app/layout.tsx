import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'宿題ノート',description:'毎日の宿題を記録して、先生に提出するノートです。',robots:{index:false,follow:false},manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#F6F7F9',width:'device-width',initialScale:1};
export default function RootLayout({children}:LayoutProps<'/'>){return <html lang="ja"><body>{children}</body></html>}
