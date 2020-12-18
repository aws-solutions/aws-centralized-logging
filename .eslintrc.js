module.exports = {
  root: true,
  env: {
    node: true,
    es2017: true,
    mocha: true,
  },
  extends: ["eslint:recommended"],
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier",
        "prettier/@typescript-eslint",
      ],
    },
  ],
};
