const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    files: ["js/**/*.js", "tests/**/*.js", "playwright.config.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
    }
  }
];
