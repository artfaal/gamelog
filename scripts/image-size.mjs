// Размеры картинки из её заголовка: у jpeg — рамка SOF, у png — IHDR.
// Один канон на сборку (место под кадр в разметке) и на проверку кадров (make image):
// раньше build.mjs читал заголовок сам, а image.mjs звал на то же самое ffprobe — и
// make image падал стектрейсом там, где ffmpeg не стоит.
//
// Чего не умеет: EXIF-поворот (у кадра с Orientation 5–8 браузер поменяет стороны
// местами, а рамка об этом не знает) и форматы кроме jpeg/png — там вернётся null.
// В content/media лежат кадры из игр и кропы, прогнанные через ffmpeg по политике
// кадров, — EXIF там не выживает.
import { readFileSync } from "node:fs";

export const imageSize = file => {
  let buf;
  try { buf = readFileSync(file); } catch { return null; }
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47)
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0…SOF15 несут размеры кадра; C4/C8/CC — таблицы, не рамка
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};
