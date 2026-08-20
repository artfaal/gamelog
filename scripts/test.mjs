#!/usr/bin/env node
// Проверки тонких мест — тех, что сборка на живом контенте не исполняет: подписи связок
// между заходами и разбор размеров картинки. Встроенный node:test, ни одной зависимости.
//
//   make test
//
// Всё остальное проверяется на реальном контенте самой сборкой (кривая дата, чужой вид
// медиа, несуществующий кадр — прод-сборка падает и указывает на файл), поэтому дублей
// тут нет: сюда попадает только то, чего в content/ нет и не должно быть.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { imageSize } from "./image-size.mjs";
import { firstRun, siblingLabel } from "./siblings.mjs";

const dir = mkdtempSync(`${tmpdir()}/gamelog-test-`);

// ---------- размеры картинки ----------

test("jpeg: размеры совпадают с ffprobe", () => {
  const file = "content/media/cd-cats.jpg";
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  const [w, h] = out.trim().split("\n").map(Number);
  assert.deepEqual(imageSize(file), { w, h });
});

test("jpeg: байт-заполнитель 0xFF перед маркером не ломает разбор", () => {
  // ITU-T T.81 разрешает сколько угодно FF перед маркером; без пропуска пара FF FF
  // читалась как сегмент с длиной, и валидный кадр объявлялся нечитаемым
  const src = readFileSync("content/media/cd-cats.jpg");
  const b = Buffer.from(src);
  let i = 2, at = -1;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { at = i; break; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  assert.notEqual(at, -1, "в образце не нашлось рамки SOF");
  const filled = Buffer.concat([b.subarray(0, at), Buffer.from([0xff]), b.subarray(at)]);
  const file = `${dir}/fill.jpg`;
  writeFileSync(file, filled);
  assert.deepEqual(imageSize(file), imageSize("content/media/cd-cats.jpg"));
});

test("не картинка и обрубки: null, а не выдуманные размеры", () => {
  for (const [name, bytes] of [
    ["junk.jpg", Buffer.from("совсем не картинка")],
    ["cut.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ["empty.png", Buffer.alloc(0)],
    ["fakepng.png", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40)])],
  ]) {
    writeFileSync(`${dir}/${name}`, bytes);
    assert.equal(imageSize(`${dir}/${name}`), null, name);
  }
});

test("png: размеры из IHDR", () => {
  const file = `${dir}/probe.png`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=77x99",
    "-frames:v", "1", file]);
  assert.deepEqual(imageSize(file), { w: 77, h: 99 });
});

// ---------- подписи связок между заходами ----------

test("связки: все исходы соседа в обе стороны по времени", () => {
  const run = (finished, extra = {}) => ({ slug: "s", fm: { finished }, ...extra });
  const текущая = run("2024-06-01");
  const пары = [
    [run("2021-01-01"), true, "прошёл в 2021"],
    [run("2027-01-01"), false, "вернулся и прошёл в 2027"],
    [run("2021-01-01", { dropped: true }), true, "первый заход — дроп в 2021"],
    [run("2021-01-01", { dropped: true }), false, "дроп в 2021"],
    [run("2027-01-01", { dropped: true }), false, "потом дропнул в 2027"],
    [run("2021-01-01", { paused: true }), false, "отложил в 2021"],
    [run("2027-01-01", { paused: true }), false, "вернулся и отложил в 2027"],
    [run("tbd", { playing: true }), false, "сейчас играю"],
  ];
  for (const [сосед, первый, ждём] of пары) assert.equal(siblingLabel(сосед, текущая, первый), ждём);
});

test("связки: «первый заход» достаётся одному и тому же при равных датах", () => {
  // ничью решает слаг: иначе каждая запись считала первой себя, и одна ссылка получала
  // в разных карточках разные подписи
  const заходы = [
    { slug: "beta", fm: { finished: "2020-03-03" } },
    { slug: "alpha", fm: { finished: "2020-03-03" } },
    { slug: "gamma", fm: { finished: "2023-01-01" } },
  ];
  assert.equal(firstRun(заходы).slug, "alpha");
  заходы.reverse();
  assert.equal(firstRun(заходы).slug, "alpha", "порядок обхода не должен решать");
});
