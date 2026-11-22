import { pageMeta } from '../meta';
import Contact from './contact';

export const metadata = pageMeta('/pricing', 'Pricing',
  'Free check and open-source tool. Pro and Business plans track what ChatGPT, Claude, Perplexity and Gemini say about you every week.');

const PLANS = [
  {
    id: 'free', name: 'Free', price: '$0', note: 'forever',
    features: ['Online check: what each search and AI crawler gets', 'Open-source tool: readable pages, sitemap, structured data, change notifications and signed records on every deploy', 'Discovery report: which crawlers came back after a change, visitors from AI answers'],
    cta: { label: 'Check your site', href: '/check' },
  },
  {
    id: 'pro', name: 'Pro', price: '$199', note: 'per month',
    features: ['1 site', '20 buyer questions tracked weekly', 'ChatGPT and Claude', 'Weekly report: where you were mentioned, which pages got cited'],
    link: process.env.NEXT_PUBLIC_STRIPE_PRO_LINK,
  },
  {
    id: 'business', name: 'Business', price: '$600', note: 'per month', featured: true,
    features: ['Up to 3 sites', '50 buyer questions per site, weekly', 'ChatGPT, Claude, Perplexity and Gemini', 'Competitor tracking: who gets named instead of you', 'Weekly report with recommended changes, and proof of what worked: change → recrawl → citation → visitors', 'Onboarding call'],
    link: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_LINK,
  },
];

export default function Pricing() {
  const api = process.env.NEXT_PUBLIC_CHECK_API ?? '';
  return (
    <>
      <h1>Know what AI says about you, and prove what works.</h1>
      <p className="lede">Monitoring tools tell you what AI says. Knownsite also fixes the technical side on every deploy
        and shows cause and effect: you changed a page, engines were told, AI crawlers re-read it, AI answers started
        citing it, people arrived.</p>
      <div className="plans">
        {PLANS.map((p) => (
          <div key={p.id} className={`card plan${p.featured ? ' featured' : ''}`}>
            <h2>{p.name}</h2>
            <div className="price">{p.price} <span>{p.note}</span></div>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            {p.cta ? <a className="button" href={p.cta.href}>{p.cta.label}</a>
              : p.link ? <a className="button" href={p.link}>Start {p.name}</a>
              : api ? <a className="button" href={`?plan=${p.id}#talk`}>Get {p.name}</a>
              : <span className="button disabled">Opening soon</span>}
            {!p.cta && p.link && api && <a className="muted small" href={`?plan=${p.id}#talk`}>or talk to us first</a>}
          </div>
        ))}
      </div>
      <div className="card founding">
        <strong>Founding customers:</strong> the first 10 Business customers pay <strong>$400/month</strong>, locked in for
        their first 12 months, in exchange for letting us share their results as a case study.{' '}
        {api ? <a href="?plan=business#talk">Ask for a founding code</a> : 'Ask us for a founding code.'}
      </div>
      <p className="muted">Early access: weekly reports arrive by email while the dashboard is being built. Cancel anytime.</p>

      <h2>Why not just ask ChatGPT yourself?</h2>
      <table><tbody>
        <tr><td><strong>Your own ChatGPT is personalized.</strong> It remembers your chats and may know your business, so it
          can mention you when it wouldn&apos;t for a stranger.</td><td>We ask every question fresh, with no history or memory:
          much closer to what a new customer sees.</td></tr>
        <tr><td>One question, one assistant, one moment.</td><td>20 to 50 questions across ChatGPT, Claude, Perplexity and Gemini,
          every week, automatically.</td></tr>
        <tr><td>An anecdote: &ldquo;it mentioned us once.&rdquo;</td><td>Numbers over time: mentioned in 12 of 50 answers, up from 4;
          which competitors are named instead, and how often.</td></tr>
        <tr><td>You see the answer, not why.</td><td>The pages each assistant cited, for you and for your competitors: what it
          actually read.</td></tr>
        <tr><td>No link to what you changed.</td><td>Cause and effect: you changed a page, engines were told, AI crawlers re-read
          it, answers started citing it, visitors arrived.</td></tr>
        <tr><td>You still have to fix things.</td><td>The technical fixes happen on every deploy, plus recommended changes each week.</td></tr>
      </tbody></table>
      <p className="muted">Answers can vary from person to person and day to day; that&apos;s why we track many questions every week
        instead of trusting one.</p>
      {api && (<>
        <h2 id="talk">Talk to us</h2>
        <Contact api={api} />
      </>)}
    </>
  );
}
