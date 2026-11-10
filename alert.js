// Runs on a schedule in GitHub Actions. Checks each pair's latest closed 15-minute candle
// with the same rule as the app, and sends a phone notification when a setup appears.
const {PAIRS,pipOf,dpOf,STOP_ATR,parseCandles,analyse,evalAt,backtest,edgeVerdict,betText,plainWait,plainVerdict,parseCalendar,newsFor,eventLine,CCY}=require("./engine.js");
const fs=require("fs"),path=require("path");
const FEED="https://nfs.faireconomy.media/ff_calendar_thisweek.json",NEWS_FILE=path.join(process.cwd(),"news.json");
const TZ=process.env.TZ_NAME||"Africa/Nairobi";
const when=t=>new Date(t).toLocaleString("en-GB",{timeZone:TZ,weekday:"short",hour:"2-digit",minute:"2-digit"});
/* Fetches the calendar about once an hour and saves it for the app. Keeps the last good copy if the fetch fails. */
async function loadNews(){
  let old=null;try{old=JSON.parse(fs.readFileSync(NEWS_FILE,"utf8"))}catch(e){}
  const now=Date.now(),due=TEST||!old||new Date(now).getUTCMinutes()<15||now-old.fetchedAt>3*36e5;
  if(!due)return old;
  try{
    const r=await fetch(FEED,{headers:{"User-Agent":"fx-desk-alerts"}});
    if(!r.ok)throw new Error("status "+r.status);
    const events=parseCalendar(JSON.parse(await r.text())),fresh={fetchedAt:now,source:"ForexFactory calendar",events};
    if(!old||JSON.stringify(old.events)!==JSON.stringify(events)||now-old.fetchedAt>12*36e5)fs.writeFileSync(NEWS_FILE,JSON.stringify(fresh,null,1));
    console.log("News calendar:",events.length,"events");return fresh;
  }catch(e){console.error("News calendar not updated:",e.message);return old}
}
const APP=process.env.APP_URL||"https://mandelamutesa-hue.github.io/fx-desk/";
const KEY=process.env.TWELVE_DATA_KEY,TOPIC=process.env.NTFY_TOPIC,TEST=process.env.SEND_TEST==="true";
const RR=+(process.env.REWARD_MULTIPLE||2),SPREAD=+(process.env.SPREAD_PIPS||1),ONLY_EDGE=process.env.ONLY_PROVEN==="true";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function notify(title,body,priority="high"){
  const r=await fetch("https://ntfy.sh/"+encodeURIComponent(TOPIC),{method:"POST",headers:Object.assign({Title:title,Priority:priority},APP?{Click:APP}:{}),body});
  if(!r.ok)throw new Error("Notification failed: "+r.status);
}
async function checkPair(pair){
  const u="https://api.twelvedata.com/time_series?"+new URLSearchParams({symbol:pair,interval:"15min",outputsize:5000,timezone:"UTC",apikey:KEY});
  const j=await(await fetch(u)).json();
  if(j.status==="error"||!j.values)throw new Error(pair+": "+(j.message||"no data"));
  const now=Date.now(),closed=parseCandles(j).filter(c=>c.t+9e5<=now);
  const A=analyse(closed),i=closed.length-1,s=evalAt(A,i),x=closed[i],pip=pipOf(pair),dp=dpOf(pair);
  const b=backtest(A,pip,RR,SPREAD),v=edgeVerdict(b),age=now-(x.t+9e5);
  const res={pair,label:s.label,plain:s.dir?(s.dir>0?"Possible buy":"Possible sell"):"Wait. "+plainWait(s.label),verdict:v,fresh:age<20*60000};
  if(s.dir){
    const dist=STOP_ATR*A.a[i],stop=x.c-s.dir*dist,tgt=x.c+s.dir*dist*RR;
    res.dir=s.dir;
    res.text=[
      `Bet: ${betText(pair,s.dir)} over the next few hours.`,
      `${s.dir>0?"Buy":"Sell"} near ${x.c.toFixed(dp)}`,
      `Stop-loss: ${stop.toFixed(dp)} (closes the trade if you're wrong)`,
      `Take-profit: ${tgt.toFixed(dp)} (closes the trade with a gain)`,
      `If neither is hit within 8 hours, close it yourself.`,
      plainVerdict(v,b),
      `Tap to open FX Desk for your trade size. Check the news first.`].join("\n");
  }
  return res;
}
(async()=>{
  if(!KEY||!TOPIC)throw new Error("Add the TWELVE_DATA_KEY and NTFY_TOPIC secrets first.");
  const news=await loadNews();
  const results=[],errors=[];
  for(let n=0;n<PAIRS.length;n++){
    if(n)await sleep(9000);
    try{const r=await checkPair(PAIRS[n]);results.push(r);console.log(r.pair,"|",r.label,"|",r.verdict.t)}
    catch(e){errors.push(e.message);console.error(e.message)}
  }
  for(const r of results){
    if(!r.dir||!r.fresh)continue;
    if(ONLY_EDGE&&r.verdict.c!=="good")continue;
    const n=newsFor(r.pair,news,Date.now());
    if(n.ok&&n.block){console.log(r.pair,"held back: big news",n.block.title);continue}
    const extra=[];
    if(!n.ok)extra.push("News check unavailable right now. Check the news calendar yourself before trading.");
    else{
      if(n.later.length)extra.push("Heads-up: "+n.later.map(x=>eventLine(x,when)).join("; ")+". The trade may still be open then, and prices can jump.");
      else extra.push("News check: no big news for these currencies in the next 8 hours.");
      if(n.holiday)extra.push(`Bank holiday for the ${CCY[n.holiday.currency]}: fewer traders, so prices can move oddly.`);
    }
    r.text=r.text.replace(" Check the news first.","")+"\n"+extra.join("\n");
    await notify(`${r.pair}: possible ${r.dir>0?"BUY":"SELL"}${r.verdict.c==="good"?"":" (practice only)"}`,r.text);
  }
  if(TEST)await notify("FX Desk alerts are working",results.length?results.map(r=>`${r.pair}: ${r.plain}${r.dir&&newsFor(r.pair,news,Date.now()).block?" (on hold: big news soon)":""}`).join("\n")+"\n"+(news&&Date.now()-news.fetchedAt<36*36e5?((k=>`News check: working, ${k} big event${k===1?"":"s"} still to come this week.`)(news.events.filter(x=>x.impact==="High"&&x.time>Date.now()).length)):"News check: not working yet. Check the job log."):"No prices came through. Check the job log.","default");
  if(errors.length)throw new Error(errors.length+" pair(s) failed: "+errors[0]);
})().catch(e=>{console.error(e.message);process.exit(1)});
