#!/usr/bin/env node
// image.mjs — проверяет кадры в content/media по политике качества.
// Только отчёт: флага --fix нет намеренно. У клипов он чинит faststart, не трогая
// поток, — у картинки такой правки не осталось: метаданных в кадрах нет (JFIF-шапка
// и сразу таблицы), а lossless-оптимизация jpeg на боевых файлах даёт 2% — нарушитель
// остаётся нарушителем, зато оригинал переписан. Пережимает человек и из исходника:
// повторное сжатие уже сжатого съедает картинку. Для нарушителей печатается команда.
import { readdirSync, statSync, existsSync } from "node:fs";
import { LIMITS } from "./image-policy.mjs";
// размеры читаем сами: тот же разбор заголовка, что и в сборке, без похода в ffprobe
import { imageSize } from "./image-size.mjs";

const DIR = "content/media";
if (!existsSync(DIR)) { console.log("нет content/media — кадров нет"); process.exit(0); }


const files = readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
if (!files.length) { console.log("кадров нет"); process.exit(0); }

let bad = 0;
for (const name of files) {
  const file = `${DIR}/${name}`;
  const kb = statSync(file).size / 1024;
  const size = imageSize(file);
  if (!size) { console.log(`✗ ${name.padEnd(22)} не читается как картинка`); bad++; continue; }
  const { w, h } = size;
  const png = /\.png$/i.test(name);
  const density = kb / (w * h / 1e6);          // КБ на мегапиксель
  const gripes = [];
  if (w > LIMITS.width || h > LIMITS.height) gripes.push(`${w}×${h} — больше ${LIMITS.width}×${LIMITS.height}`);
  if (png) {
    if (kb > LIMITS.pngKbTotal) gripes.push(`${kb.toFixed(0)} КБ — тяжелее ${LIMITS.pngKbTotal}`);
  } else if (density > LIMITS.kbPerMegapixel) {
    gripes.push(`${density.toFixed(0)} КБ/Мпикс — плотнее ${LIMITS.kbPerMegapixel}`);
  }

  // у png плотность не порог (см. image-policy.mjs) — и в строку её не тащим, чтобы
  // не выглядела нарушением
  const facts = png ? `${kb.toFixed(0)} КБ · ${w}×${h}`
    : `${kb.toFixed(0)} КБ · ${w}×${h} · ${density.toFixed(0)} КБ/Мпикс`;
  if (!gripes.length) { console.log(`ок   ${name.padEnd(22)} ${facts}`); continue; }
  bad++;
  console.log(`✗    ${name.padEnd(22)} ${gripes.join("; ")}`);
  console.log(`       ffmpeg -i ИСХОДНИК -vf "scale='min(${LIMITS.width},iw)':-2" \\`);
  if (png) {
    // -compression_level 100 — только zlib, пиксели и прозрачность целы
    console.log(`         -compression_level 100 ${file}`);
    console.log("       не помогло — внутри фотография: её место в jpg, png только ради прозрачности");
  } else {
    // yuvj420p важен: в исходниках попадается 4:4:4, это +30% веса ни за что
    console.log(`         -q:v ${LIMITS.quality} -pix_fmt yuvj420p ${file}`);
  }
}

console.log(bad ? `\nне по политике: ${bad} из ${files.length} — пороги в scripts/image-policy.mjs`
  : `\nвсе кадры по политике: ${files.length}`);
