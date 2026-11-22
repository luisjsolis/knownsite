/** Hero visual: an example Knownsite report, the cause-and-effect timeline only Knownsite can show. */
const STEPS = [
  { when: 'Tue 9:02', what: 'You updated /pricing', tone: 'neutral' },
  { when: 'Tue 9:04', what: 'Bing, Yandex and others told (IndexNow)', tone: 'ok' },
  { when: 'Wed 3:10', what: 'OAI-SearchBot re-read it · +18h', tone: 'ok' },
  { when: 'Fri', what: 'ChatGPT started citing /pricing', tone: 'accent' },
  { when: 'This week', what: '40 visitors from ChatGPT answers', tone: 'accent' },
];

export default function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="Example Knownsite report">
      <div className="window">
        <div className="window-bar"><span /><span /><span /><em>knownsite report · example</em></div>
        <div className="report-top">
          <div className="ring" style={{ ['--p' as string]: 100 }}><b>100</b><small>/100</small></div>
          <div>
            <div className="report-site">your-site.com</div>
            <div className="report-band">Discoverable · Level 2 signed</div>
            <div className="chips"><span>Googlebot ✓</span><span>Bingbot ✓</span><span>OAI-SearchBot ✓</span><span>Claude ✓</span></div>
          </div>
        </div>
        <ol className="timeline">
          {STEPS.map((s, i) => (
            <li key={s.what} className={`t-${s.tone}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              <span className="t-dot" /><span className="t-when">{s.when}</span><span className="t-what">{s.what}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
