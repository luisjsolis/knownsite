// Next.js helper: record AI/search crawler visits and AI-answer referrals from proxy.ts
// (middleware.ts before Next.js 16). Runs in the background via event.waitUntil, so it never
// slows a page. No dependency on `next`: NextRequest is a standard Request.
//
//   // proxy.ts
//   import { knownsiteVisits } from 'knownsite/next';
//   const logVisit = knownsiteVisits();            // default: one JSON line per visit in the logs
//   export function proxy(request, event) {
//     logVisit(request, event);
//     // ...your own routing, or return nothing
//   }
//
// Make sure your matcher lets crawler files through (robots.txt, sitemap.xml, llms.txt) if you
// want those visits too; Next's default matcher examples often exclude them.
import { recordVisit, consoleSink } from './visits.js';

/**
 * @param {object} [opts]
 * @param {(event: object) => Promise<void>} [opts.sink]  where events go (default: console JSON lines)
 * @param {boolean} [opts.productionOnly=true]  skip in `next dev` and preview deploys
 * @param {boolean} [opts.verify=true]  check crawler IPs against the operators' published ranges
 */
export function knownsiteVisits({ sink = consoleSink(), productionOnly = true, verify = true } = {}) {
  return function logVisit(request, event) {
    if (productionOnly && !isProduction()) return;
    const pending = recordVisit(request, { sink, verify });
    if (pending && event?.waitUntil) event.waitUntil(pending);
  };
}

function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production';
  return process.env.NODE_ENV === 'production';
}

export { consoleSink, httpSink, fileSink } from './visits.js';
