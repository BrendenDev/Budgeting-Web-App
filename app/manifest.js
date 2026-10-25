// Web app manifest (served statically at /manifest.webmanifest by Next.js).
// Lets Android/Chrome install the app to the home screen and open it full-screen.
export default function manifest() {
  return {
    name: 'Budget App',
    short_name: 'Budget',
    description: 'Personal budgeting: accounts, transactions, recurring items and projections.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#16171a',
    theme_color: '#16171a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
