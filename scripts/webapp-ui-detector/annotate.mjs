import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

function svgOverlay(width, height, shapes) {
  const body = shapes.map((s) => {
    const cx = s.bbox.x + s.bbox.w / 2;
    const cy = s.bbox.y + s.bbox.h / 2;
    const r = Math.max(s.bbox.w, s.bbox.h) / 2 + 14;
    const labelX = cx + r - 4;
    const labelY = cy - r + 4;
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" stroke="red" stroke-width="4" fill="none"/>
      <circle cx="${labelX}" cy="${labelY}" r="14" fill="red"/>
      <text x="${labelX}" y="${labelY + 5}" text-anchor="middle" font-size="16" font-weight="bold" fill="white" font-family="Arial">${s.index}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

async function getSize(pngPath) {
  const m = await sharp(pngPath).metadata();
  return { width: m.width || 1440, height: m.height || 900 };
}

export async function annotateFull(pngPath, shapes, outPath) {
  if (!shapes.length) return null;
  if (!fs.existsSync(pngPath)) return null;
  const { width, height } = await getSize(pngPath);
  const svg = svgOverlay(width, height, shapes);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(pngPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toFile(outPath);
  return outPath;
}

export async function cropElement(pngPath, shape, outPath) {
  if (!fs.existsSync(pngPath)) return null;
  const { width, height } = await getSize(pngPath);
  const padding = 30;
  const left = Math.max(0, shape.bbox.x - padding);
  const top = Math.max(0, shape.bbox.y - padding);
  const w = Math.min(width - left, shape.bbox.w + padding * 2);
  const h = Math.min(height - top, shape.bbox.h + padding * 2);
  if (w < 4 || h < 4) return null;

  const localShape = {
    index: shape.index,
    bbox: { x: shape.bbox.x - left, y: shape.bbox.y - top, w: shape.bbox.w, h: shape.bbox.h },
  };
  const svg = svgOverlay(w, h, [localShape]);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(pngPath)
    .extract({ left, top, width: w, height: h })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outPath);
  return outPath;
}
