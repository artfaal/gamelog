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
import { deflateSync, crc32 } from "node:zlib";
import { imageSize } from "./image-size.mjs";
import { firstRun, siblingLabel } from "./siblings.mjs";

const dir = mkdtempSync(`${tmpdir()}/gamelog-test-`);

// ---------- размеры картинки ----------

test("jpeg: размеры настоящего кадра из репозитория", () => {
  // файл лежит в git и не меняется; ждать ответа от ffprobe нельзя — тогда результат
  // теста зависел бы от версии ffmpeg на машине (одна отдаёт 77×99, другая 76×98)
  assert.deepEqual(imageSize("content/media/cd-cats.jpg"), { w: 739, h: 415 });
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

// минимальный настоящий png собираем сами — без внешних инструментов и их версий
const png = (w, h, { ihdrLen = 13 } = {}) => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(type === "IHDR" ? ihdrLen : data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(w * h + h))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

test("png: размеры из IHDR", () => {
  const file = `${dir}/probe.png`;
  writeFileSync(file, png(77, 99));
  assert.deepEqual(imageSize(file), { w: 77, h: 99 });
});

test("png: подделка с неверной длиной IHDR не считается картинкой", () => {
  const file = `${dir}/fake-ihdr.png`;
  writeFileSync(file, png(123, 456, { ihdrLen: 0 }));
  assert.equal(imageSize(file), null);
});

test("усечённый jpeg с хвостом 0xFF не роняет разбор", () => {
  const file = `${dir}/tail.jpg`;
  writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 0xff)]));
  assert.equal(imageSize(file), null);
});

test("огрызок SOF с невозможной длиной сегмента — не размеры", () => {
  const file = `${dir}/bad-sof.jpg`;
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x01, 0x08, 0x01, 0xc8, 0x00, 0x7b, 0x03]);
  writeFileSync(file, b);
  assert.equal(imageSize(file), null);
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
