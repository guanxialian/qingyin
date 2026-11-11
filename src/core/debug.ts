/** 极简运行日志：出问题时在「设置 → 诊断」里能直接看到发生了什么 */
const MAX = 60;
const lines: string[] = [];

export function logEvent(tag: string, detail?: unknown) {
  let text = tag;
  if (detail !== undefined) {
    try {
      text += ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
    } catch {
      text += ' [unserializable]';
    }
  }
  const stamp = new Date().toTimeString().slice(0, 8);
  lines.unshift(`${stamp} ${text}`);
  if (lines.length > MAX) lines.length = MAX;
  console.log('[qingyin]', text);
}

export function getLogLines(): string[] {
  return lines;
}

export function clearLog() {
  lines.length = 0;
}
