const FONT = 'Inter, "Noto Sans Devanagari", "Noto Sans Bengali", "Noto Sans Oriya", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", sans-serif';

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
  return y + lh;
}

export interface CardText {
  place: string;
  status: string;
  risk: string;
  eta: string | null;
  advice: string;
  footer: string;
  color: string;
}

/** 1080x1080 regional-language share card (PNG), shared via Web Share or downloaded. */
export async function renderShareCard(c: CardText): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#070b16';
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = c.color;
  g.fillRect(0, 0, 1080, 26);
  g.fillStyle = '#fff';
  g.font = `700 60px ${FONT}`;
  g.fillText(`⚡ VAJRA · ${c.place}`, 60, 140);
  g.font = `700 80px ${FONT}`;
  g.fillStyle = c.color;
  let y = wrap(g, c.status, 60, 290, 960, 92);
  g.fillStyle = '#e2e8f0';
  g.font = `500 46px ${FONT}`;
  y = wrap(g, c.risk, 60, y + 30, 960, 60);
  if (c.eta) y = wrap(g, c.eta, 60, y, 960, 60);
  g.fillStyle = '#cbd5e1';
  g.font = `400 42px ${FONT}`;
  wrap(g, c.advice, 60, y + 40, 960, 56);
  g.fillStyle = '#64748b';
  g.font = `400 30px ${FONT}`;
  g.fillText(c.footer, 60, 1030);
  return new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
}

export async function shareOrDownload(blob: Blob) {
  const file = new File([blob], 'vajra-warning.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: 'VAJRA warning' }).catch(() => undefined);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vajra-warning.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
