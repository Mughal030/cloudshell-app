import { NextRequest, NextResponse } from 'next/server'

/**
 * Security headers middleware — applies to every response.
 *
 * These headers prevent clickjacking (X-Frame-Options / frame-ancestors),
 * MIME-sniffing attacks (X-Content-Type-Options), reflected XSS
 * (X-XSS-Protection), and force HTTPS (HSTS). The Content-Security-Policy
 * restricts where scripts/styles/connections can come from.
 *
 * NOTE on CSP: We allow 'unsafe-inline' for styles because Tailwind / shadcn
 * inject styles inline. We allow 'unsafe-eval' for scripts only in dev
 * (Next.js HMR needs it). In production, eval is forbidden.
 */

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // HSTS — 1 year, include subdomains, preload-ready. Only meaningful over HTTPS.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  // Cache-Control — never cache auth-related responses (must revalidate)
  // For other pages, allow private caching so back/forward nav is instant
  // but force revalidation to avoid showing stale sensitive data.
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

function buildCsp(request: NextRequest): string {
  const isDev = process.env.NODE_ENV !== 'production'
  const nonce = crypto.randomUUID().replace(/-/g, '')

  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'unsafe-inline'`
  const styleSrc = "'self' 'unsafe-inline' https://fonts.googleapis.com"
  const fontSrc = "'self' https://fonts.gstatic.com data:"
  const imgSrc = "'self' data: blob: https:"
  const connectSrc = "'self' ws: wss:"
  const frameSrc = "'none'"
  const objectSrc = "'none'"
  const baseUri = "'self'"
  const formAction = "'self'"

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `font-src ${fontSrc}`,
    `img-src ${imgSrc}`,
    `connect-src ${connectSrc}`,
    `frame-src ${frameSrc}`,
    `frame-ancestors 'none'`,
    `object-src ${objectSrc}`,
    `base-uri ${baseUri}`,
    `form-action ${formAction}`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

export function proxy(request: NextRequest) {
  // Apply security headers to every response
  const response = NextResponse.next()

  // CSP
  response.headers.set('Content-Security-Policy', buildCsp(request))

  // Other security headers
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(k, v)
  }

  // Special cache-control for auth-related endpoints
  const url = request.nextUrl.pathname
  if (url.startsWith('/api/auth/') || url === '/login' || url === '/signup') {
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    )
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  return response
}

export const config = {
  // Run on everything except static asset files
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|jasbol-hack-logo.png|robots.txt|manifest.json).*)',
  ],
}
