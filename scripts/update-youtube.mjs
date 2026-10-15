// 매주 GitHub Actions가 실행: 뷰티블라썸 한국 채널의 공개 롱폼(가로) 영상 목록을 공식 YouTube Data API로 읽어
// data/youtube-longform.json을 갱신한다. 읽기 전용 API 키(YOUTUBE_API_KEY, 저장소 비밀값)만 사용한다.
import fs from 'node:fs';

const KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = 'UCjqwHrk39tox9ToJDiuj5Iw';
const OUT = 'data/youtube-longform.json';
const LIMIT = 20;

if (!KEY) {
  console.log('YOUTUBE_API_KEY 비밀값이 없어 갱신을 건너뜁니다. 저장소 Settings > Secrets and variables > Actions에 추가하세요.');
  process.exit(0);
}

const api = async (path, params) => {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + path);
  Object.entries({ ...params, key: KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
};

const toClock = (iso) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return '';
  const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
};

// UULF + 채널 ID 뒷부분 = 롱폼(일반 동영상)만 모은 업로드 재생목록
const list = await api('playlistItems', { part: 'contentDetails', playlistId: 'UULF' + CHANNEL_ID.slice(2), maxResults: '50' });
const ids = (list.items || []).map((it) => it.contentDetails.videoId).slice(0, LIMIT);
if (!ids.length) { console.log('롱폼 영상이 없습니다. 기존 목록 유지'); process.exit(0); }
const det = await api('videos', { part: 'snippet,contentDetails,status', id: ids.join(',') });
const byId = Object.fromEntries((det.items || []).map((v) => [v.id, v]));
const videos = ids.map((id) => byId[id]).filter((v) => v && v.status.privacyStatus === 'public').map((v) => {
  const t = v.snippet.thumbnails || {};
  const best = t.maxres || t.standard || t.high || t.medium;
  return { id: v.id, title: v.snippet.title, published: v.snippet.publishedAt, duration: toClock(v.contentDetails.duration), thumb: best ? best.url : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${v.id}` };
});
if (!videos.length) { console.log('공개 롱폼 영상이 없습니다. 기존 목록 유지'); process.exit(0); }

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
if (prev && JSON.stringify(prev.videos) === JSON.stringify(videos)) { console.log('변경 없음'); process.exit(0); }
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ channelId: CHANNEL_ID, channelUrl: 'https://www.youtube.com/@K-BeautyBlossom', source: 'youtube-data-api', updated: new Date().toISOString(), videos }, null, 1) + '\n');
console.log('갱신:', videos.length, '개, 최신:', videos[0].title);
