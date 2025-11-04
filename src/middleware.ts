import createMiddleware from 'next-intl/middleware';
 
export default createMiddleware({
  // A list of all locales that are supported
  locales: ['en', 'ar'],
 
  // Used when no locale matches
  defaultLocale: 'ar'
});
 
export const config = {
  // Match only internationalized pathnames
   matcher: [
    // Enable a redirect to a matching locale at the root
    '/',

    // Set a cookie to remember the previous locale for
    // all requests that have a locale prefix
    '/(ar|en)/:path*',

    // Enable redirects that add a locale prefix
    // (e.g. `/pathnames` -> `/ar/pathnames`)
    '/((?!_next|_ipsw|_vercel|api|.*\\..*).*)'
  ]
};
