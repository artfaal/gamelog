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
  // png: полная сигнатура, IHDR первым чанком и его единственно возможная длина 13.
  // Без длины подделка «сигнатура + IHDR + любые числа» читалась как размеры
  // 33 байта — минимум, в котором помещаются сигнатура, длина, тип, сам IHDR и его CRC:
  // короче файл обрывается внутри чанка, и размеры читались бы из-за его границы
  if (buf.length >= 33 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a
      && buf.readUInt32BE(8) === 13 && buf.toString("latin1", 12, 16) === "IHDR") {
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    return w && h ? { w, h } : null;
  }
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null;
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    // перед маркером допускается сколько угодно байтов-заполнителей 0xFF (ITU-T T.81):
    // без пропуска пара FF FF читалась как сегмент с длиной, и валидный jpeg объявлялся
    // нечитаемым — кадр уезжал в разметку без размеров и двигал раскладку
    let j = i;
    while (j + 1 < buf.length && buf[j + 1] === 0xff) j++;
    i = j;
    if (i + 1 >= buf.length) break;
    const marker = buf[i + 1];
    // SOF0…SOF15 несут размеры кадра; C4/C8/CC — таблицы, не рамка
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      // рамка: длина (2), точность (1), две стороны (4), число компонентов (1) и по три
      // байта на каждый компонент — значит не короче 11 и объявленная длина должна
      // целиком лежать в файле. Иначе огрызок читался как убедительные размеры
      if (i + 4 > buf.length) return null;
      const len = buf.readUInt16BE(i + 2);
      const nf = i + 9 < buf.length ? buf[i + 9] : 0;
      if (len < 11 || len !== 8 + 3 * nf || i + 2 + len > buf.length) return null;
      const w = buf.readUInt16BE(i + 7), h = buf.readUInt16BE(i + 5);
      return w && h ? { w, h } : null;   // нулевая сторона (высота из DNL) — не размеры
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue; }
    // длину сегмента читаем только если она целиком в буфере: усечённый файл
    // с хвостом 0xFF доводил i до конца, и чтение падало ERR_OUT_OF_RANGE
    if (i + 4 > buf.length) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;                  // сегмент короче собственной длины — дальше мусор
    i += 2 + len;
  }
  return null;
};
