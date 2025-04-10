// commitlint.config.js or commitlint.config.cjs
// Configuration for commitlint: https://commitlint.js.org/
// Ensures commit messages follow the Conventional Commits specification.

module.exports = {
  // Extend the base conventional commit configuration
  extends: ['@commitlint/config-conventional'],

  // Define custom rules or override rules from the extended config
  rules: {
    // --- Type Rules ---
    // Ensure the type is always lower-case.
    'type-case': [
      2, // Level: Error
      'always',
      'lower-case',
    ],
    // Ensure the type is never empty.
    'type-empty': [
      2, // Level: Error
      'never',
    ],
    // Ensure the type is one of the allowed values.
    'type-enum': [
      2, // Level: Error
      'always',
      [
        'build', // Changes that affect the build system or external dependencies (e.g., gulp, broccoli, npm)
        'chore', // Other changes that don't modify src or test files (e.g., updating dependencies, build scripts)
        'ci', // Changes to CI configuration files and scripts (e.g., Travis, Circle, BrowserStack, SauceLabs)
        'docs', // Documentation only changes
        'feat', // A new feature
        'fix', // A bug fix
        'perf', // A code change that improves performance
        'refactor', // A code change that neither fixes a bug nor adds a feature
        'revert', // Reverts a previous commit
        'style', // Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
        'test', // Adding missing tests or correcting existing tests
      ],
    ],

    // --- Subject Rules ---
    // Ensure the subject is always lower-case (more consistent with type/scope).
    // Use 'sentence-case' if you prefer 'Subject starts with a capital letter.'
    'subject-case': [
      2, // Level: Error
      'always',
      ['lower-case'],
      // Alternative: 'sentence-case'
      // ['sentence-case']
    ],
    // Ensure the subject is never empty.
    'subject-empty': [
      2, // Level: Error
      'never',
    ],
    // Ensure the subject does not end with a period.
    'subject-full-stop': [
      2, // Level: Error
      'never',
      '.',
    ],

    // --- Header Rules ---
    // Ensure the entire header line does not exceed a certain length (e.g., 72 or 100 chars).
    // 72 is a common Git recommendation for readability in various tools.
    'header-max-length': [
      2, // Level: Error
      'always',
      72, // Or 100 if you prefer more space
    ],

    // --- Body Rules ---
    // Encourage (Warning) a blank line between the header and the body.
    'body-leading-blank': [
      1, // Level: Warning
      'always',
    ],
    // Optional: Enforce max line length for the body
    // 'body-max-line-length': [2, 'always', 100],

    // --- Footer Rules ---
    // Encourage (Warning) a blank line between the body (or header if no body) and the footer.
    'footer-leading-blank': [
      1, // Level: Warning
      'always',
    ],
    // Optional: Enforce max line length for the footer
    // 'footer-max-line-length': [2, 'always', 100],
  },
};
