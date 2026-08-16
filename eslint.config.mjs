// Линт-минимум: опечатки в именах и мёртвый код. Стилевых правил нет — форматирование руками.
const rules = {
  "no-undef": "error",
  "no-unused-vars": "error",
  "no-constant-condition": "error",
  "no-dupe-keys": "error",
  "no-unreachable": "error",
};

export default [
  { ignores: ["dist/", "cache/"] },
  {
    // генератор: node-модули
    files: ["scripts/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      globals: { console: "readonly", process: "readonly", fetch: "readonly", URL: "readonly", Buffer: "readonly" },
    },
    rules,
  },
  {
    // сайт: скрипт в браузере, без модулей
    files: ["site/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: {
        document: "readonly", location: "readonly", navigator: "readonly",
        matchMedia: "readonly", IntersectionObserver: "readonly",
        setTimeout: "readonly", scrollTo: "readonly",
      },
    },
    rules,
  },
];
