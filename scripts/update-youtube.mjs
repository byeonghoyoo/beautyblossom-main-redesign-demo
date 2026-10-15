// Weekly fallback snapshot; credentials remain in the private feed worker.
import fs from 'node:fs';
const out='data/youtube-longform.json';
const r=await fetch('https://bb-main-feeds.beautyblossom.workers.dev/youtube',{signal:AbortSignal.timeout(20000)});
if(!r.ok)throw Error('YouTube feed HTTP '+r.status);
const feed=await r.json();
if(feed.channelId!=='UCjqwHrk39tox9ToJDiuj5Iw'||!Array.isArray(feed.videos)||!feed.videos.length||!feed.videos.every(v=>/^[\w-]{11}$/.test(v.id)&&typeof v.title==='string'&&/^https:\/\/i\.ytimg\.com\//.test(v.thumb)))throw Error('Invalid YouTube feed');
const old=fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')):null;
if(JSON.stringify(old?.videos)!==JSON.stringify(feed.videos)){fs.mkdirSync('data',{recursive:true});fs.writeFileSync(out,JSON.stringify(feed,null,1)+'\n');console.log('Updated',feed.videos.length);}else console.log('No changes');
