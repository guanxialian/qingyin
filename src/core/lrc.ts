/** LRC 歌词解析与逐行同步 */

export interface LrcLine {
  time: number; // 秒
  text: string;
  translation?: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(raw?: string | null): LrcLine[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const out: LrcLine[] = [];
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const offsetMatch = trimmed.match(/^\[offset:([+-]?\d+)\]/i);
    if (offsetMatch) {
      offset = Number(offsetMatch[1]) / 1000;
      continue;
    }
    // 元信息标签
    if (/^\[(ti|ar|al|by|re|ve|au|length):/i.test(trimmed)) continue;

    const times: number[] = [];
    TIME_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIME_TAG.exec(trimmed))) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] ?? '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      times.push(min * 60 + sec + frac);
    }
    if (times.length === 0) continue;
    const text = trimmed.replace(TIME_TAG, '').trim();
    if (!text) continue;
    for (const t of times) out.push({ time: t, text });
  }

  out.sort((a, b) => a.time - b.time);
  if (offset) {
    for (const l of out) l.time = Math.max(0, l.time + offset);
  }
  return out;
}

/** 合并同名时间点的翻译（MusicFree 部分音源用 [mm:ss.xx]原文 + 同时间 [mm:ss.xx]译文） */
export function mergeTranslation(main: LrcLine[], trans: LrcLine[]): LrcLine[] {
  if (!trans.length) return main;
  const map = new Map<number, string>();
  for (const t of trans) {
    map.set(Math.round(t.time * 100), t.text);
  }
  return main.map((line) => ({
    ...line,
    translation: map.get(Math.round(line.time * 100)) ?? line.translation,
  }));
}

/** 二分查找当前行；早于第一行返回 -1 */
export function findLyricIndex(lines: LrcLine[], time: number): number {
  if (!lines.length) return -1;
  if (time < lines[0].time) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time + 0.15) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function formatTime(sec?: number): string {
  const s = Math.max(0, Math.floor(sec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
