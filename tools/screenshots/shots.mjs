/* Written with the help of Claude, an AI assistant made by Anthropic, as directed and reviewed by the team. See "Use of AI" in README.md. Licensed under Apache-2.0 (see LICENSE). */
// The list of screenshots: each step sets up a screen through the game's own functions, then calls shot(name).
const BASE = 'http://localhost:8767/';
const PREP = `
  localStorage.setItem('ceruvia-muted','1'); localStorage.setItem('ceruvia-music','0'); localStorage.setItem('ceruvia-tour','1');
  window.CLEAN = () => { app.classList.remove('enter'); document.querySelectorAll('.badgePop').forEach(e=>e.remove()); const t=document.getElementById('toasts'); if(t) t.innerHTML=''; const fx=document.getElementById('fxLayer'); if(fx) fx.getContext('2d').clearRect(0,0,fx.width,fx.height); };
  if (!document.getElementById('shotcss')) { const s=document.createElement('style'); s.id='shotcss'; s.textContent='.app.enter > *{animation:none!important} .modal-box,.verdict,.find,.toast{animation:none!important} .hero-planet,.brief-planet{animation:none!important} .mission.next{animation:none!important} .googly b{animation:none!important}'; document.head.appendChild(s); }
  window.SETUP = (i, gi) => { S.difficulty='rookie'; const m=MISSIONS[i]; prepareMission(m); S.plan.goal=m.objectives[gi||0].id; const r=recommendBuild(m,S.plan.goal,'rookie',0); S.build=r.build; S.plan={...r.plan,goal:S.plan.goal,ground:r.plan.ground||'network'}; };
  window.MUTE = () => { for (const k of ['blip','deny','place','stage','win','lose','badge','flip','rumbleStart']) SFX[k]=()=>{}; };
  MUTE(); FX.confetti = () => {}; await document.fonts.ready; return 'ok';`;
const GAMESHOT = (kind, secs, opts, input) => `
  stopAnim(); startGame('${kind}', Object.assign(pilotOpts({retry:true}), ${JSON.stringify(opts)}), ()=>{}); gameBegin();
  await new Promise(r=>setTimeout(r,150)); stopAnim();
  const g=S.game, G=GAMES['${kind}'], cv=document.getElementById('gcv'), w=cv.clientWidth, h=cv.clientHeight;
  g.state=G.init(g.opts,w,h); g.phase='play'; resetKeys();
  for (let i=0;i<60*${secs};i++){ ${input || ''} G.step(g.state,1/60); K.spaceHit=false; }
  resetKeys(); const ctx=cv.getContext('2d'); G.draw(ctx,g.state,w,h); document.getElementById('ghud').innerHTML=G.hud(g.state); CLEAN(); scrollTo(0,0); return [w,h];`;

export default async function ({ send, evalJS, size, shot, sleep }) {
  const load = async (q = '') => { await send('Page.navigate', { url: BASE + q }); await sleep(1400); await evalJS(PREP); };

  // ---------- desktop ----------
  await size(1280, 800);
  await load();
  await evalJS(`render(); CLEAN();`); await sleep(900); await shot('title');

  await evalJS(`S.difficulty='rookie'; S.myName='Nova'; S.campaign.done={m1:{score:612,stars:3,diff:'rookie'},m2:{score:540,stars:2,diff:'rookie'}}; S.campaign.unlocked=3; go('map'); CLEAN();`);
  await sleep(500); await shot('mission-control');

  await size(1280, 1000);
  await evalJS(`SETUP(4,0); S.shipName='Nova One'; S.hangarTab='build'; go('hangar'); closeModal(); CLEAN(); scrollTo(0,0);`);
  await sleep(500); await shot('hangar');

  await evalJS(`S.hangarTab='plan'; render(); CLEAN(); scrollTo(0,0);`); await sleep(300); await shot('hangar-plan');

  await size(1280, 900);
  await evalJS(`SETUP(4,0); S.plan.traj='assist'; S.shipName='Last Light'; go('review'); CLEAN(); scrollTo(0,0);`);
  await sleep(400); await shot('review');
  await evalJS(`document.querySelector('.conops-card').scrollIntoView({block:'start'}); window.scrollBy(0,-80); CLEAN();`); await sleep(300); await shot('mission-plan');

  await size(1280, 820);
  await evalJS(`SETUP(0,0); startRun(); ` + GAMESHOT('launch', 13, {}, '') ); await sleep(300); await shot('game-launch');
  await evalJS(`SETUP(1,1); startRun(); ` + GAMESHOT('dodge', 6, { span: 1.4, hazard: 0.9, shield: 0 }, '') ); await sleep(300); await shot('game-cruise');
  await evalJS(`SETUP(1,2); startRun(); ` + GAMESHOT('landing', 9, { gravity: 1.62, rough: 0.5 }, '') ); await sleep(300); await shot('game-landing');
  await evalJS(`SETUP(2,0); startRun(); ` + GAMESHOT('reentry', 5, {}, '') ); await sleep(300); await shot('game-reentry');

  await size(1280, 860);
  await evalJS(`stopAnim(); S.game=null; SETUP(4,0); startRun(); S.game=null; const run=S.run; run.passesLeft=4; const m=S.mission;
    for (const s of m.sites.slice(0,1)) for (const [k,f] of Object.entries(s.finds)) if (k!=='land' && run.d.instruments.includes(k)) run.finds.push(Object.assign({},f,{site:s.id,inst:k,mult:1}));
    run.log.push({text:'Launch: a clean gravity turn.',kind:'good'},{text:'Cruise: no debris hits.',kind:'good'},{text:'Arrived at Ceruvia with 6 science passes planned.',kind:'info'});
    S.selSite=(m.sites.find(x=>siteNew(x))||m.sites[1]).id; go('explore'); CLEAN(); scrollTo(0,0);`);
  await sleep(400); await shot('science');

  await evalJS(`SETUP(3,0); startRun(); S.game=null; S.difficulty='engineer'; S.run.crisis=null; initCrisis(); S.run.crisis.turn=3; S.run.crisis.battery*=0.72; S.run.crisis.sent=1; S.run.crisis.on.inst=false; go('crisis'); CLEAN(); scrollTo(0,0);`);
  await sleep(300); await shot('power-emergency');

  await size(1280, 1000);
  await evalJS(`SETUP(0,0); S.patch=null; startRun(); S.game=null; const run=S.run; run.scores.launch=94; const m=S.mission;
    for (const s of m.sites) for (const k of ['wac','irs']) { const f=s.finds[k]; if (f && run.d.instruments.includes(k)) run.finds.push(Object.assign({},f,{site:s.id,inst:k,mult:1})); }
    finalize(); await new Promise(r=>setTimeout(r,600)); closeModal(); CLEAN(); scrollTo(0,0);`);
  await sleep(500); await evalJS(`CLEAN();`); await shot('report');

  // ---------- co-op lobby ----------
  await size(1280, 900);
  await load('?local');
  await evalJS(`S.myName='Nova'; await NET.start(true); await new Promise(r=>setTimeout(r,500));
    const me=S.players[0]; S.players=[me,{uid:'b',name:'Comet',joined:me.joined+1},{uid:'c',name:'Pixel',joined:me.joined+2},{uid:'d',name:'Orbit',joined:me.joined+3}];
    go('lobby'); CLEAN(); scrollTo(0,0);`);
  await sleep(400); await shot('coop-lobby');
  await evalJS(`NET.leave();`);

  // ---------- phone ----------
  await size(390, 844, true);
  await load();
  await evalJS(`render(); CLEAN();`); await sleep(700); await shot('phone-title');
  await evalJS(`SETUP(1,0); S.shipName='Moonbeam'; S.hangarTab='build'; go('hangar'); closeModal(); CLEAN(); scrollTo(0,0); document.getElementById('ship').scrollIntoView({block:'start'}); window.scrollBy(0,-60);`);
  await sleep(400); await shot('phone-hangar');
  await evalJS(`SETUP(1,2); startRun(); ` + GAMESHOT('landing', 4.2, { gravity: 1.62, rough: 0.5 }, '') ); await sleep(300); await shot('phone-landing');
}
