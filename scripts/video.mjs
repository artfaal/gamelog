#!/usr/bin/env node
// video.mjs [--fix] — проверяет клипы в content/media по политике качества.
// Без --fix только отчёт. С --fix чинит то, что чинится без потери качества:
// перекладывает moov в начало файла (--movflags +faststart, поток копируется).
// Пережатие оставлено человеку: исходник у него, а повторное сжатие уже сжатого
// съедает картинку. Для нарушителей печатается готовая команда.
import { readdirSync, statSync, renameSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LIMITS } from "./video-policy.mjs";

const FIX = process.argv.includes("--fix");
const DIR = "content/media";
if (!existsSync(DIR)) { console.log("нет content/media — клипов нет"); process.exit(0); }

const probe = file => {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", file,
  ], { encoding: "utf8" }).trim().split("\n");
  const [w, h, rate, dur] = out;
  const [num, den] = rate.split("/").map(Number);
  return { w: Number(w), h: Number(h), fps: num / (den || 1), sec: Number(dur) };
};
// без faststart браузер не начинает играть, пока не дотянет конец файла.
// Читаем боксы верхнего уровня подряд: moov должен встретиться раньше mdat.
const faststart = file => {
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(8);
    let pos = 0;
    for (let i = 0; i < 32; i++) {
      if (readSync(fd, head, 0, 8, pos) < 8) return false;
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      let size = head.readUInt32BE(0);
      if (size === 1) {                       // 64-битный размер лежит следом за типом
        const big = Buffer.alloc(8);
        readSync(fd, big, 0, 8, pos + 8);
        size = Number(big.readBigUInt64BE(0));
      }
      if (size <= 0) return false;
      pos += size;
    }
    return false;
  } finally { closeSync(fd); }
};

const files = readdirSync(DIR).filter(f => /\.(mp4|webm)$/i.test(f)).sort();
if (!files.length) { console.log("клипов нет"); process.exit(0); }

let bad = 0, fixed = 0;
for (const name of files) {
  const file = `${DIR}/${name}`;
  const mb = statSync(file).size / 1024 / 1024;
  const v = probe(file);
  const perSec = mb / v.sec;
  const gripes = [];
  if (v.w > LIMITS.width || v.h > LIMITS.height) gripes.push(`${v.w}×${v.h} — больше ${LIMITS.width}×${LIMITS.height}`);
  if (v.fps > LIMITS.fps + 0.5) gripes.push(`${Math.round(v.fps)} fps — больше ${LIMITS.fps}`);
  if (v.sec > LIMITS.seconds) gripes.push(`${v.sec.toFixed(0)} с — длиннее ${LIMITS.seconds}`);
  if (perSec > LIMITS.mbPerSecond) gripes.push(`${perSec.toFixed(2)} МБ/с — тяжелее ${LIMITS.mbPerSecond}`);
  if (mb > LIMITS.mbTotal) gripes.push(`${mb.toFixed(0)} МБ — тяжелее ${LIMITS.mbTotal}`);

  let fs = faststart(file);
  if (!fs && FIX) {
    const tmp = `${file}.faststart.mp4`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-c", "copy", "-movflags", "+faststart", tmp]);
    renameSync(tmp, file);
    fs = true;
    fixed++;
  }
  if (!fs) gripes.push("moov в конце — нет faststart");

  if (!gripes.length) { console.log(`ок   ${name.padEnd(22)} ${mb.toFixed(1)} МБ · ${v.sec.toFixed(0)} с · ${perSec.toFixed(2)} МБ/с`); continue; }
  bad++;
  console.log(`✗    ${name.padEnd(22)} ${gripes.join("; ")}`);
  if (perSec > LIMITS.mbPerSecond || v.w > LIMITS.width || v.fps > LIMITS.fps + 0.5) {
    console.log(`       ffmpeg -i ИСХОДНИК -vf "scale='min(${LIMITS.width},iw)':-2,fps=${LIMITS.fps}" \\`);
    console.log(`         -c:v libx264 -crf 23 -maxrate ${LIMITS.maxrateMbit}M -bufsize ${LIMITS.maxrateMbit * 2}M \\`);
    console.log(`         -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart ${file}`);
  }
}

if (fixed) console.log(`\nfaststart проставлен без пережатия: ${fixed}`);
console.log(bad ? `\nне по политике: ${bad} из ${files.length} — детали в README, раздел «Клипы»`
  : `\nвсе ${files.length} клипов по политике`);
