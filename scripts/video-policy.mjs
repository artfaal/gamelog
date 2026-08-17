// Политика качества клипов — один канон на всех: проверку гоняет scripts/video.mjs,
// сборка сверяет по ней вес. Текстом policy описана в README, раздел «Клипы».
export const LIMITS = {
  width: 1920,
  height: 1080,
  fps: 30,
  seconds: 35,
  mbPerSecond: 0.5,   // ≈4 Мбит/с — на глаз чисто, но не тащит десятки мегабайт
  mbTotal: 20,
};
