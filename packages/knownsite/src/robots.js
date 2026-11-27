// robots.txt parsing and matching (RFC 9309): which paths a crawler may fetch. Used by `build` and
// `verify` users alike; the site check that scores sites lives in Knownsite's hosted service.
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) current.rules.push({ allow: key === 'allow', pattern: value });
      lastWasAgent = false;
    } else if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

/** Is `path` allowed for crawler `token`? Longest match wins; Allow wins ties. */
export function robotsAllows(robots, token, path = '/') {
  const t = token.toLowerCase();
  let groups = robots.groups.filter((g) => g.agents.includes(t));
  if (!groups.length) groups = robots.groups.filter((g) => g.agents.includes('*'));
  const rules = groups.flatMap((g) => g.rules).filter((r) => r.pattern !== '');
  let best = null;
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return { allowed: best ? best.allow : true, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.pattern}` : null };
}
