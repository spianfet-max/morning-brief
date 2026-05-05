const express = require('express');
const app = express();
app.use(express.json());

/* ═══════════════════════════════
   MORNING BRIEF API
═══════════════════════════════ */
app.post('/api/brief', async (req, res) => {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY.' });

  const { language = 'EN', focus = 'GLOBAL' } = req.body || {};

  const langNote = {
    EN: 'Write entirely in English.',
    FR: 'Write entirely in French. Use financial terminology standard in French institutions.',
    JP: 'Write entirely in Japanese. Use professional financial Japanese (敬語 is not required, but use correct financial terminology).'
  }[language] || 'Write entirely in English.';

  const focusNote = {
    GLOBAL: 'Cover global markets with balanced attention across US, Europe and Asia.',
    ASIA:   'Emphasise Asia-Pacific markets: Japan (BOJ, JPY, Nikkei), China (PBOC, CNY, HSI), Australia (RBA, AUD), and regional EM. Still mention key US/EU drivers that move Asia.',
    EUROPE: 'Emphasise European markets: ECB policy, EUR/GBP/CHF, Bund/BTP spreads, Euro Stoxx, European energy. Still mention key US and Asia overnight moves.'
  }[focus] || 'Cover global markets.';

  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: `Senior macro strategist at a tier-1 wealth management firm. Today: ${today}. Write sharp morning market briefings for a structured products/FX/rates sales desk. Authoritative, direct, precise. ${langNote}`,

        messages: [{
          role: 'user',
          content: `Generate a morning market briefing based on your knowledge of recent market conditions. ${focusNote}

Return ONLY a raw JSON object, no markdown:
{
  "headline": "max 12 words, today's dominant market theme",
  "standfirst": "2-3 sentences, key macro narrative",
  "sentiment": "RISK-ON or RISK-OFF or NEUTRAL",
  "tickers": [
    {"name":"S&P 500","value":"exact level from search","change":"+0.4%","direction":"up"},
    {"name":"EUR/USD","value":"exact rate from search","change":"-0.2%","direction":"down"},
    {"name":"US 10Y","value":"exact yield from search","change":"+3bp","direction":"up"},
    {"name":"GOLD","value":"exact price from search","change":"+0.8%","direction":"up"},
    {"name":"BRENT","value":"exact price from search","change":"-1.1%","direction":"down"},
    {"name":"USD/JPY","value":"exact rate from search","change":"+0.3%","direction":"up"}
  ],
  "sections": [
    {"title":"FX","content":"3-4 sentences with real levels from search. Specific rates, moves, drivers.","fullWidth":false},
    {"title":"RATES","content":"3-4 sentences on yields, curve, central bank outlook. Real levels only.","fullWidth":false},
    {"title":"EQUITY","content":"3-4 sentences on index performance, sectors, drivers.","fullWidth":false},
    {"title":"COMMODITIES","content":"3-4 sentences on oil, gold, metals. Real prices only.","fullWidth":false},
    {"title":"MACRO","content":"3-4 sentences on data releases, policy, macro backdrop.","fullWidth":false},
    {"title":"GEOPOLITICAL RISKS","content":"3-4 sentences on active geopolitical situations and their forward impact on macro assets — specify which assets are affected and how.","fullWidth":true}
  ],
  "events": [
    {"time":"08:30 ET","name":"Real scheduled event from search","importance":"HIGH"},
    {"time":"10:00 ET","name":"Real scheduled event from search","importance":"MEDIUM"}
  ]
}`
        }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      let msg = `API error ${anthropicRes.status}`;
      try { msg = JSON.parse(err).error?.message || msg; } catch (_) {}
      return res.status(502).json({ error: msg });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Could not parse brief. Please retry.');
    const brief = JSON.parse(clean.slice(start, end + 1));

    // Generate plain text version for copy
    const plainText = [
      `MORNING BRIEF — ${today.toUpperCase()}`,
      `${brief.headline}`,
      ``,
      brief.standfirst,
      ``,
      `MARKET TONE: ${brief.sentiment}`,
      ``,
      ...(brief.tickers||[]).map(t => `${t.name}: ${t.value} (${t.change})`),
      ``,
      ...(brief.sections||[]).flatMap(s => [`— ${s.title} —`, s.content, ``]),
      `— TRADE IDEAS —`,
      ...(brief.tradeIdeas||[]).map(t => `${t.direction}: ${t.title} — ${t.rationale}`),
      ``,
      `— KEY EVENTS —`,
      ...(brief.events||[]).map(e => `${e.time} ${e.name} [${e.importance}]`),
      ``,
      `For internal use only. Not investment advice.`
    ].join('\n');

    res.json({ brief, plainText });

  } catch (e) {
    res.status(500).json({ error: e.message || 'Unknown server error.' });
  }
});

/* ═══════════════════════════════
   SERVE APP
═══════════════════════════════ */
const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>MORNING BRIEF — Daily Market Intelligence</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:'Source Serif 4',Georgia,serif;background:#fff;color:#000;min-height:100vh;-webkit-font-smoothing:antialiased}
.app{max-width:900px;margin:0 auto;padding:2rem 2rem 5rem}
.display{font-family:'Playfair Display',serif}
.mono{font-family:'JetBrains Mono',monospace;letter-spacing:0.08em}

/* HEADER */
.header{border-bottom:4px solid #000;padding-bottom:1.5rem;margin-bottom:2.5rem;display:flex;justify-content:space-between;align-items:flex-end;gap:1rem}
.header-left{}
.header-title{font-family:'Playfair Display',serif;font-size:2.2rem;font-weight:900;letter-spacing:-0.04em;line-height:1}
.header-sub{font-family:'JetBrains Mono',monospace;font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;color:#525252;margin-top:0.4rem}
.header-right{text-align:right;flex-shrink:0}
.header-date{font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.1em;color:#525252}
.header-date span{display:block;line-height:2}

/* CONTROLS */
.controls{display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:2rem;align-items:center}
.lang-row{display:flex;gap:0.4rem}
.chip{font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.1em;text-transform:uppercase;padding:0.38rem 0.9rem;border:1px solid #000;background:#fff;cursor:pointer;transition:all 80ms;user-select:none}
.chip:hover,.chip.active{background:#000;color:#fff}
.btn-generate{font-family:'JetBrains Mono',monospace;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;padding:0.75rem 2rem;background:#000;color:#fff;border:2px solid #000;cursor:pointer;transition:all 80ms;margin-left:auto}
.btn-generate:hover{background:#fff;color:#000}
.btn-generate:disabled{background:#aaa;border-color:#aaa;cursor:not-allowed}
.btn-copy{font-family:'JetBrains Mono',monospace;font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;padding:0.75rem 1.25rem;background:#fff;color:#000;border:1px solid #e5e5e5;cursor:pointer;transition:all 80ms}
.btn-copy:hover{border-color:#000}

/* LOADING */
.loading-wrap{padding:5rem 0;text-align:center;border:1px solid #e5e5e5}
.loading-label{font-family:'JetBrains Mono',monospace;font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:#525252;margin-bottom:1.25rem}
.loading-bar{width:200px;height:2px;background:#e5e5e5;margin:0 auto 2rem;overflow:hidden}
.loading-bar::after{content:'';display:block;height:100%;width:40%;background:#000;animation:loadslide 1.1s ease-in-out infinite}
@keyframes loadslide{0%{margin-left:-40%}100%{margin-left:140%}}
.loading-msg{font-family:'Playfair Display',serif;font-style:italic;font-size:1.1rem;color:#525252}

/* BRIEF CONTAINER */
.brief-wrap{display:none}
.brief-wrap.visible{display:block}

/* MASTHEAD */
.masthead{border:4px solid #000;padding:2.5rem;margin-bottom:0;position:relative;overflow:hidden}
.masthead::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.01) 3px,rgba(0,0,0,0.01) 4px);pointer-events:none}
.masthead-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem}
.masthead-edition{font-family:'JetBrains Mono',monospace;font-size:0.6rem;letter-spacing:0.15em;text-transform:uppercase;color:#525252}
.masthead-sentiment{display:flex;align-items:center;gap:0.75rem}
.sentiment-label{font-family:'JetBrains Mono',monospace;font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:#525252}
.sentiment-val{font-family:'JetBrains Mono',monospace;font-size:0.65rem;letter-spacing:0.1em;padding:0.25rem 0.75rem;border:1px solid #000;text-transform:uppercase}
.sentiment-val.risk-on{background:#000;color:#fff}
.sentiment-val.risk-off{background:#fff;color:#000}
.sentiment-val.neutral{background:#f5f5f5;color:#525252}
.masthead-headline{font-family:'Playfair Display',serif;font-size:2.2rem;font-weight:900;line-height:1.1;letter-spacing:-0.03em;margin-bottom:1rem}
.masthead-standfirst{font-size:1rem;color:#525252;line-height:1.65;max-width:680px;border-top:1px solid #e5e5e5;padding-top:1rem}

/* TICKER ROW */
.ticker-row{border:1px solid #000;border-top:none;display:grid;grid-template-columns:repeat(6,1fr);margin-bottom:0}
.ticker-item{padding:0.75rem 1rem;border-right:1px solid #e5e5e5}
.ticker-item:last-child{border-right:none}
.ticker-name{font-family:'JetBrains Mono',monospace;font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;color:#aaa;margin-bottom:0.2rem}
.ticker-val{font-family:'JetBrains Mono',monospace;font-size:0.75rem;font-weight:500;letter-spacing:0.04em}
.ticker-chg{font-family:'JetBrains Mono',monospace;font-size:0.58rem;letter-spacing:0.04em;margin-top:0.1rem}
.ticker-chg.up{color:#000}
.ticker-chg.down{color:#525252}

/* SECTIONS */
.sections-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #000;border-top:none}
.section-block{padding:1.75rem;border-right:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5}
.section-block:nth-child(2n){border-right:none}
.section-block.full-width{grid-column:1/-1;border-right:none}
.section-header{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:2px solid #000}
.section-icon{width:28px;height:28px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:0.6rem;flex-shrink:0}
.section-title{font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.15em;text-transform:uppercase}
.section-content{font-size:0.88rem;line-height:1.75;color:#000}
.section-content p{margin-bottom:0.75rem}
.section-content p:last-child{margin-bottom:0}
.section-content strong{font-weight:600}

/* KEY LEVELS TABLE */
.levels-table{width:100%;border-collapse:collapse;margin-top:0.5rem}
.levels-table tr{border-bottom:1px solid #e5e5e5}
.levels-table tr:last-child{border-bottom:none}
.levels-table td{padding:0.5rem 0;font-size:0.83rem;line-height:1.4}
.levels-table td:first-child{font-family:'JetBrains Mono',monospace;font-size:0.65rem;letter-spacing:0.06em;color:#525252;width:35%}
.levels-table td:last-child{text-align:right;font-family:'JetBrains Mono',monospace;font-size:0.65rem;letter-spacing:0.04em}



/* EVENTS TABLE */
.events-list{display:flex;flex-direction:column;gap:0}
.event-row{display:grid;grid-template-columns:90px 1fr auto;align-items:baseline;gap:1rem;padding:0.6rem 0;border-bottom:1px solid #f0f0f0}
.event-row:last-child{border-bottom:none}
.event-time{font-family:'JetBrains Mono',monospace;font-size:0.62rem;letter-spacing:0.06em;color:#525252}
.event-name{font-size:0.85rem;line-height:1.4}
.event-imp{font-family:'JetBrains Mono',monospace;font-size:0.55rem;letter-spacing:0.08em;text-transform:uppercase;padding:0.15rem 0.45rem;border:1px solid #e5e5e5;color:#aaa;white-space:nowrap}
.event-imp.high{border-color:#000;color:#000;background:#000;color:#fff}
.event-imp.medium{border-color:#525252;color:#525252}

/* FOOTER */
.brief-footer{border-top:4px solid #000;padding-top:1.25rem;margin-top:2rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem}
.footer-label{font-family:'JetBrains Mono',monospace;font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:#aaa}
.footer-ts{font-family:'JetBrains Mono',monospace;font-size:0.58rem;letter-spacing:0.06em;color:#aaa}

/* EMPTY STATE */
.empty-state{border:1px solid #e5e5e5;padding:4rem 2rem;text-align:center}
.empty-title{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:700;margin-bottom:0.75rem;letter-spacing:-0.02em}
.empty-sub{font-size:0.9rem;color:#525252;line-height:1.6;max-width:400px;margin:0 auto}

/* ERROR */
.error-box{border:2px solid #000;padding:2rem;margin:1.5rem 0}
.error-title{font-family:'Playfair Display',serif;font-size:1.4rem;font-weight:700;margin-bottom:0.6rem}
.error-msg{font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#525252;line-height:1.6;margin-bottom:1.25rem}

/* PRINT */
@media print{
  .controls{display:none}
  .brief-footer .btn-copy{display:none}
  body{padding:0}
  .app{padding:1rem}
}

/* RESPONSIVE */
@media(max-width:620px){
  .sections-grid{grid-template-columns:1fr}
  .section-block{border-right:none}
  .ticker-row{grid-template-columns:repeat(3,1fr)}
  .masthead-headline{font-size:1.6rem}
  .btn-generate{margin-left:0;width:100%}
}
</style>
</head>
<body>
<div class="app">

  <header class="header">
    <div class="header-left">
      <div class="header-title display">MORNING<br>BRIEF</div>
      <div class="header-sub mono">Daily Market Intelligence</div>
    </div>
    <div class="header-right">
      <div class="header-date mono">
        <span id="todayDate">—</span>
        <span id="todayTime">—</span>
      </div>
    </div>
  </header>

  <div class="controls">
    <div class="filter-label mono" style="font-family:'JetBrains Mono',monospace;font-size:0.58rem;letter-spacing:0.15em;text-transform:uppercase;color:#aaa;margin-right:0.25rem">LANGUAGE</div>
    <div class="lang-row">
      <button class="chip active" onclick="selectLang(this,'EN')">EN</button>
      <button class="chip" onclick="selectLang(this,'FR')">FR</button>
      <button class="chip" onclick="selectLang(this,'JP')">JP</button>
    </div>
    <div class="filter-label mono" style="font-family:'JetBrains Mono',monospace;font-size:0.58rem;letter-spacing:0.15em;text-transform:uppercase;color:#aaa;margin-left:0.5rem;margin-right:0.25rem">FOCUS</div>
    <div class="lang-row">
      <button class="chip active" onclick="selectFocus(this,'GLOBAL')">GLOBAL</button>
      <button class="chip" onclick="selectFocus(this,'ASIA')">ASIA</button>
      <button class="chip" onclick="selectFocus(this,'EUROPE')">EUROPE</button>
    </div>
    <button class="btn-generate" id="genBtn" onclick="generateBrief()">GENERATE BRIEF →</button>
    <button class="btn-copy" id="copyBtn" onclick="copyBrief()" style="display:none">COPY TEXT</button>
  </div>

  <div id="loadingBlock" style="display:none">
    <div class="loading-wrap">
      <div class="loading-label mono">Scanning markets</div>
      <div class="loading-bar"></div>
      <div class="loading-msg display" id="loadMsg">Pulling overnight market moves…</div>
    </div>
  </div>

  <div id="errorBlock"></div>

  <div class="brief-wrap" id="briefWrap">
    <!-- injected by JS -->
  </div>

  <div class="empty-state" id="emptyState">
    <div class="empty-title display">Your daily edge,<br><em>on demand.</em></div>
    <div class="empty-sub">Select language and focus, then generate your morning briefing. Macro, FX, rates, equities, commodities — structured for a wealth management desk.</div>
  </div>

</div>

<script>
let selectedLang='EN', selectedFocus='GLOBAL';
let currentBriefText='';

const LOAD_MSGS=[
  'Pulling overnight market moves…',
  'Scanning central bank calendars…',
  'Analysing FX crosses…',
  'Reading yield curve dynamics…',
  'Checking equity futures…',
  'Assessing commodity flows…',
  'Compiling key events…',
  'Drafting trade ideas…',
  'Formatting your brief…'
];

(function(){
  const now=new Date();
  document.getElementById('todayDate').textContent=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  document.getElementById('todayTime').textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' LOCAL';
})();

function selectLang(el,lang){document.querySelectorAll('.lang-row .chip').forEach(c=>c.classList.remove('active'));document.querySelectorAll('[onclick*="selectLang"]').forEach(c=>c.classList.remove('active'));el.classList.add('active');selectedLang=lang;}
function selectFocus(el,focus){document.querySelectorAll('[onclick*="selectFocus"]').forEach(c=>c.classList.remove('active'));el.classList.add('active');selectedFocus=focus;}

async function generateBrief(){
  document.getElementById('emptyState').style.display='none';
  document.getElementById('briefWrap').classList.remove('visible');
  document.getElementById('errorBlock').innerHTML='';
  document.getElementById('loadingBlock').style.display='block';
  document.getElementById('genBtn').disabled=true;
  document.getElementById('copyBtn').style.display='none';

  let mi=0;
  const iv=setInterval(()=>{document.getElementById('loadMsg').textContent=LOAD_MSGS[mi%LOAD_MSGS.length];mi++;},1800);

  try{
    const res=await fetch('/api/brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:selectedLang,focus:selectedFocus})});
    clearInterval(iv);
    if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||\`Server error \${res.status}\`);}
    const data=await res.json();
    renderBrief(data.brief);
    currentBriefText=data.plainText||'';
    document.getElementById('loadingBlock').style.display='none';
    document.getElementById('briefWrap').classList.add('visible');
    document.getElementById('copyBtn').style.display='inline-block';
  }catch(e){
    clearInterval(iv);
    document.getElementById('loadingBlock').style.display='none';
    document.getElementById('emptyState').style.display='block';
    document.getElementById('errorBlock').innerHTML=\`<div class="error-box"><div class="error-title display">Failed to generate brief</div><div class="error-msg">\${safe(e.message)}</div><button class="btn-generate" onclick="generateBrief()">RETRY →</button></div>\`;
  }
  document.getElementById('genBtn').disabled=false;
}

function renderBrief(b){
  const sentimentClass=b.sentiment==='RISK-ON'?'risk-on':b.sentiment==='RISK-OFF'?'risk-off':'neutral';
  const now=new Date();

  // Ticker row
  const tickerHTML=(b.tickers||[]).map(t=>\`
    <div class="ticker-item">
      <div class="ticker-name mono">\${safe(t.name)}</div>
      <div class="ticker-val mono">\${safe(t.value)}</div>
      <div class="ticker-chg mono \${t.direction==='up'?'up':'down'}">\${safe(t.change)}</div>
    </div>\`).join('');

  // Sections
  const sectionIcons={FX:'FX',RATES:'RT',EQUITY:'EQ',COMMODITIES:'CM',MACRO:'MX','GEOPOLITICAL RISKS':'GP','KEY RISKS':'KR'};

  const sectionsHTML=(b.sections||[]).map(s=>\`
    <div class="section-block \${s.fullWidth?'full-width':''}">
      <div class="section-header">
        <div class="section-icon mono">\${sectionIcons[s.title]||s.title.substring(0,2)}</div>
        <div class="section-title mono">\${safe(s.title)}</div>
      </div>
      <div class="section-content">\${formatContent(s.content)}</div>
    </div>\`).join('');

  // Trade ideas
  const tradesHTML=(b.tradeIdeas||[]).map(t=>\`
    <div class="trade-card">
      <div class="trade-direction mono \${t.direction.toLowerCase()}">\${safe(t.direction)}</div>
      <div class="trade-title display">\${safe(t.title)}</div>
      <div class="trade-rationale">\${safe(t.rationale)}</div>
    </div>\`).join('');

  // Events
  const eventsHTML=(b.events||[]).map(e=>\`
    <div class="event-row">
      <span class="event-time mono">\${safe(e.time)}</span>
      <span class="event-name">\${safe(e.name)}</span>
      <span class="event-imp mono \${e.importance.toLowerCase()}">\${safe(e.importance)}</span>
    </div>\`).join('');

  document.getElementById('briefWrap').innerHTML=\`
    <div class="masthead">
      <div class="masthead-top">
        <div class="masthead-edition mono">Vol. — \${now.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}).toUpperCase()} · \${selectedFocus} · \${selectedLang}</div>
        <div class="masthead-sentiment">
          <span class="sentiment-label mono">MARKET TONE</span>
          <span class="sentiment-val \${sentimentClass} mono">\${safe(b.sentiment||'NEUTRAL')}</span>
        </div>
      </div>
      <div class="masthead-headline display">\${safe(b.headline)}</div>
      <div class="masthead-standfirst">\${safe(b.standfirst)}</div>
    </div>

    \${tickerHTML?\`<div class="ticker-row">\${tickerHTML}</div>\`:''}

    <div class="sections-grid">
      \${sectionsHTML}
      \${tradesHTML?\`<div class="section-block full-width">
        <div class="section-header"><div class="section-icon mono">TI</div><div class="section-title mono">TRADE IDEAS</div></div>
        <div>\${tradesHTML}</div>
      </div>\`:''}
      \${eventsHTML?\`<div class="section-block full-width">
        <div class="section-header"><div class="section-icon mono">EV</div><div class="section-title mono">KEY EVENTS TODAY</div></div>
        <div class="events-list">\${eventsHTML}</div>
      </div>\`:''}
    </div>

    <div class="brief-footer">
      <span class="footer-label mono">MARKET BRIEF · FOR INTERNAL USE ONLY · NOT INVESTMENT ADVICE</span>
      <span class="footer-ts mono">Generated \${now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>\`;
}

function formatContent(text){
  if(!text) return '';
  return text.split('\\n').filter(l=>l.trim()).map(l=>\`<p>\${safe(l)}</p>\`).join('');
}

function copyBrief(){
  if(!currentBriefText){
    const el=document.getElementById('briefWrap');
    navigator.clipboard.writeText(el.innerText||el.textContent||'');
  }else{
    navigator.clipboard.writeText(currentBriefText);
  }
  const btn=document.getElementById('copyBtn');
  const orig=btn.textContent;
  btn.textContent='✓ COPIED';
  setTimeout(()=>btn.textContent=orig,2000);
}

function safe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
</script>
</body>
</html>
`;

app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(INDEX_HTML);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Morning Brief running on port ${PORT}`));
