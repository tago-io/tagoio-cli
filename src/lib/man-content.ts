/**
 * @description Plain-English text bodies for the man page.
 *
 * Edit prose here in normal English — no roff escapes, no font codes. The
 * generator (`generate-man.ts`) wraps each value with `escapeRoff()` and
 * places it under the right `.SH`/`.TP` section.
 *
 * Keep line breaks intentional: a literal `\n` in these strings becomes a
 * line break in the rendered man page, which is how multi-paragraph entries
 * stay readable in `man tagoio`.
 */
const MAN_CONTENT = {
  // NAME section
  name: "tagoio - command-line tool for TagoIO",

  // DESCRIPTION section
  description: `The TagoIO Command Line Tool is the official command-line
interface to TagoIO. It manages analyses, devices, dashboards,
and user profiles, and can export entire applications between
profiles - suitable for both interactive use and CI/CD pipelines.`,

  // GLOBAL OPTIONS labels
  globalVersionDesc: "Output the version number.",
  globalHelpDesc: "Display help for command.",

  // EXIT STATUS bodies
  exitStatusOK: "Command completed successfully.",
  exitStatusFail: `Any failure. The error is printed on stderr with an [ERROR] prefix
(or as a JSON object when --json is set).`,

  // ENVIRONMENT body (TAGOIO_DEFAULT)
  envTagoioDefault: `Selects which environment from tagoconfig.json the CLI uses
when no --env flag is given. Persisted by tagoio set-env.`,

  // FILES bodies
  fileTagoconfig: `Project-level configuration. Created and updated by
tagoio init.`,
  fileLockfile: `Per-environment profile token written by tagoio login.
One file per environment, kept in the current project directory.`,
  filePersonalEnv: `Persists the user's default environment selection
(TAGOIO_DEFAULT). Updated by tagoio set-env.`,

  // SEE ALSO entries (URLs only — labels are in the inline structure)
  seeAlsoDocsURL: "https://help.tago.io",
  seeAlsoIssuesURL: "https://github.com/tago-io/tagoio-cli/issues",

  // AUTHOR
  author: "TagoIO LLC",
} as const;

export { MAN_CONTENT };
