import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'宿題ノート',description:'週の宿題を計画して、毎日の進み具合を先生と確かめるノートです。',robots:{index:false,follow:false},manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#f5f4ee',width:'device-width',initialScale:1};
export default function RootLayout({children}:LayoutProps<'/'>){return <html lang="ja"><body>{children}</body></html>}
