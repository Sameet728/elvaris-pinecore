import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://elvariscapital.in'),
  title: {
    default: 'Elvaris Capital — Quantitative Pine Script Platform',
    template: '%s | Elvaris Capital',
  },
  description:
    'Institutional Pine Script v5 Quantitative Backtesting Engine, Monte Carlo Multi-Variable Optimizer, and MetaTrader 5 Parity Suite. Engineered by Elvaris Capital (parent organization: elvariscapital.in).',
  keywords: [
    'Elvaris Capital',
    'elvariscapital.in',
    'Pine Script backtester',
    'TradingView Pine Script v5',
    'Monte Carlo trading simulation',
    'Pine Script optimizer',
    'MetaTrader 5 parity backtester',
    'Tradeify prop firm strategy',
    'quantitative trading platform',
    'XAUUSD Gold 15M strategy',
    'algorithmic trading software',
  ],
  authors: [{ name: 'Elvaris Capital', url: 'https://elvariscapital.in' }],
  creator: 'Elvaris Capital',
  publisher: 'Elvaris Capital (elvariscapital.in)',
  applicationName: 'Elvaris Capital Quant Platform',
  icons: {
    icon: [
      { url: '/images/logo.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/logo.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/images/logo.png',
    apple: '/images/logo.png',
  },
  alternates: {
    canonical: 'https://elvariscapital.in',
  },
  openGraph: {
    title: 'Elvaris Capital — Quantitative Pine Script Platform',
    description:
      'Institutional Pine Script v5 Quantitative Backtester, Monte Carlo Multi-Variable Optimizer, and MetaTrader 5 Parity Suite. Engineered by Elvaris Capital (parent organization: elvariscapital.in).',
    url: 'https://elvariscapital.in',
    siteName: 'Elvaris Capital',
    images: [
      {
        url: '/images/logo.png',
        width: 800,
        height: 800,
        alt: 'Elvaris Capital Quantitative Platform Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Elvaris Capital — Quantitative Pine Script Platform',
    description:
      'Institutional Pine Script v5 Backtester & Monte Carlo Multi-Variable Sweep Optimizer. Product by Elvaris Capital (elvariscapital.in).',
    images: ['/images/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

const jsonLdOrg = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Elvaris Capital',
  url: 'https://elvariscapital.in',
  logo: 'https://elvariscapital.in/images/logo.png',
  description:
    'Elvaris Capital is a premier quantitative technology and algorithmic research organization specializing in mathematical finance, automated execution algorithms, and Pine Script backtesting infrastructure.',
  sameAs: ['https://elvariscapital.in'],
  parentOrganization: {
    '@type': 'Organization',
    name: 'Elvaris Capital',
    url: 'https://elvariscapital.in',
  },
};

const jsonLdApp = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Elvaris Capital Quantitative Pine Script Platform',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'All Modern Web Browsers (Chrome, Edge, Safari, Firefox)',
  offers: {
    '@type': 'Offer',
    price: '0.00',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Elvaris Capital',
    url: 'https://elvariscapital.in',
  },
  description:
    'Full-fidelity Pine Script v5 strategy execution engine, multi-variable parameter grid search, 2,000-path Monte Carlo bootstrap simulator, and MetaTrader 5 institutional reporting.',
};

const jsonLdFaq = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Elvaris Capital and what is the parent organization website?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Elvaris Capital is a quantitative trading and financial technology engineering organization. The parent organization website is https://elvariscapital.in, developing algorithmic models, proprietary backtesting engines, and prop firm verification suites.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Elvaris Capital ensure 100% TradingView Pine Script v5 parity?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Elvaris engine parses Pine Script v5 syntax using an Abstract Syntax Tree (pinets-ast) compiler, simulating bar-by-bar candle opens, highs, lows, and closes. Intrabar orders strictly honor stop-loss-first ambiguity resolution, realistic broker slippage, and spread parameters to ensure 100% match with TradingView Strategy Tester outputs.',
      },
    },
    {
      '@type': 'Question',
      name: 'What Monte Carlo simulation capabilities does the Elvaris optimizer provide?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Elvaris Parameter Sweep Optimizer executes simultaneous grid sweeps across Take-Profit, Stop-Loss, and RSI filter levels, combined with 1,000 to 2,000 Monte Carlo bootstrap resamples (Mulberry32 seeded PRNG) to calculate median expectancy, 95% worst-case adverse drawdown, and streak resilience.',
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/images/logo.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/images/logo.png" />
        <link rel="shortcut icon" href="/images/logo.png" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function shouldSuppress(msg) {
                  if (!msg) return false;
                  var str = String(msg);
                  return (
                    str.indexOf('InstantiationService has been disposed') !== -1 ||
                    str.indexOf("Cannot read properties of undefined (reading 'domNode')") !== -1 ||
                    str.indexOf('no scripting engine registered for language') !== -1
                  );
                }
                window.addEventListener('error', function(e) {
                  if (shouldSuppress(e.message || (e.error && e.error.message))) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var reason = e.reason && (e.reason.message || String(e.reason));
                  if (shouldSuppress(reason)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApp) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-[var(--bg-app)] text-[var(--text-1)] selection:bg-[var(--brand-soft)] selection:text-[var(--brand)]"
      >
        {children}
      </body>
    </html>
  );
}
