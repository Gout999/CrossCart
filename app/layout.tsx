import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const geist = localFont({ src: './fonts/geist-variable.woff2', variable: '--font-geist', display: 'swap', weight: '100 900' });
const mono = localFont({ src: './fonts/geist-mono-variable.woff2', variable: '--font-mono', display: 'swap', weight: '100 900', preload: false });
const editorial = localFont({ src: './fonts/instrument-serif-italic.ttf', variable: '--font-editorial', display: 'swap', weight: '400', style: 'italic' });
export const metadata: Metadata = { title: 'CrossCart | Your choice. Your exact approval.', description: 'Compare the details, approve one exact purchase, and follow payment, order and recovery in a working demo.' };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en" data-theme="light" className={`${geist.variable} ${mono.variable} ${editorial.variable}`}><body>{children}</body></html>; }
