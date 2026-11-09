#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`VERSION must be MAJOR.MINOR.PATCH, got ${JSON.stringify(version)}`);
const out = join(root, 'plugins/pstack');
const name = 'pstack-copilot';
const hooks = 'hooks';

function fetchSource() {
  const dir = join(root, '.cache', `pstack-claude-${upstream.sha.slice(0, 12)}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
    git('init', '-q');
    git('fetch', '-q', '--depth=1', upstream.repo, upstream.sha);
    git('checkout', '-q', 'FETCH_HEAD');
  }
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== upstream.sha) throw new Error(`source at ${head}, expected ${upstream.sha}`);
  const dirty = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--ignored'], { encoding: 'utf8' });
  if (dirty) throw new Error(`source checkout ${dir} has local changes; delete it and rebuild`);
  return dir;
}

const read = (rel) => readFileSync(join(out, rel), 'utf8');
const write = (rel, text) => {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  writeFileSync(join(out, rel), text);
};

const skillNames = () =>
  readdirSync(join(out, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(out, 'skills', d.name, 'SKILL.md')))
    .map((d) => d.name);

const removals = [
  '.antigravity-plugin',
  '.claude-plugin',
  '.codex-plugin',
  '.github',
  '.grok-plugin',
  '.muse-plugin',
  'agents',
  'grok',
  'hooks.json',
  'omp',
  'opencode',
  'package.json',
  'pi',
  ...[
    'agy-context.awk',
    'codex-hooks.json',
    'copilot-hooks.json',
    'hooks.json',
    'kimi-instructions.md',
    'muse-context.awk',
    'session-start-agy.md',
    'session-start-minimax.md',
    'session-start-muse-sheet.md',
    'session-start-muse.md',
    'session-start-opencode.md',
    'session-start.ps1',
  ].map((f) => `hooks/${f}`),
];

const agentReferences = ['thermo-nuclear-review-subagent', 'thermo-nuclear-code-quality-review-subagent'];

const edits = [
  {
    file: 'skills/poteto-mode/SKILL.md',
    find: 'On GitHub Copilot, read [`references/copilot-tools.md`](references/copilot-tools.md) instead.',
    replace:
      'On GitHub Copilot (Copilot CLI, or the VS Code agents window with the Copilot target), read [`references/copilot-tools.md`](references/copilot-tools.md) instead.',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: 'It covers both the Copilot CLI and the Copilot app, which load the same plugin.',
    replace: 'It covers the Copilot CLI, the Copilot app, and the VS Code agents window with the Copilot target, which load the same plugin.',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: /- The plugin's agents load as `task` agent types[^\n]*\n- `subagent_type: "general-purpose"`[^\n]*\n/,
    replace: [
      "- This build ships no plugin agents. VS Code's Copilot runtime rejects a `task` dispatch to a plugin agent (`Unknown agent_type: pstack:poteto-agent`). Use Copilot's built-ins as `task`'s `agent_type` (`explore`, `general-purpose`, `code-review`, `research`, `rubber-duck`, `security-review`, `task`).",
      '- Where a skill names a pstack agent, dispatch `general-purpose` and begin the prompt as follows:',
      '  - For `pstack:poteto-agent`: "Before any work, load the `poteto-mode` skill with the `skill` tool and follow it, including its Principles section."',
      '  - For `pstack:comment-sicko`, `pstack:thermo-nuclear-review-subagent`, and `pstack:thermo-nuclear-code-quality-review-subagent`: "Before any work, read `skills/poteto-mode/references/agents/<name>.md` in the pstack plugin in full and act as that agent." Use the agent\'s name without the `pstack:` prefix for `<name>`. The plugin root is two directories above poteto-mode\'s `SKILL.md`.',
      '- `subagent_type: "general-purpose"` maps to `agent_type: "general-purpose"`. Where a skill leaves the type unset, dispatch `general-purpose` with the `pstack:poteto-agent` opening.',
      '',
    ].join('\n'),
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: '`readonly: true` (reviewers, explorers, critics) maps to a read-only agent type:',
    replace:
      '`readonly: true` (reviewers, explorers, critics) maps to a read-only agent type. When the skill names a pstack agent for the role, use `general-purpose` with a prompt that forbids edits instead, because the opening above needs the `skill` tool or file reads a read-only agent may not make. Otherwise the read-only types are',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: '`readonly: false`, or a role that needs MCP tools, maps to `general-purpose` or `pstack:poteto-agent`.',
    replace: '`readonly: false`, or a role that needs MCP tools, maps to `general-purpose`.',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: '- Keep the rest of the policy unchanged.',
    replace: [
      '- VS Code labels each subagent with its `description`: on its card in the chat, in the Subagents pill, and in its pane. A narrow column cuts a label short from the end, so start every `description` with what tells it apart: a number, then a short role, such as `1: security review` and `2: test review`. Keep it to the 3 to 5 words `task` asks for, and never give two subagents in a run the same label or the same first word.',
      '- Create each writer\'s worktree yourself before you dispatch it, inside the workspace at `.worktrees/<name>`, after you add `.worktrees/` to `.git/info/exclude` so it never shows as a change. Give the writer that absolute path as the only place it may write, and do not also name a path in the workspace root. Copilot subagents refuse to write under a temporary directory such as `/tmp` or `$TMPDIR`, and with the sandbox on, VS Code blocks writes outside the workspace. Dispatch writers with `task`, not `create_session`: a `create_session` worker never reports back to you, so you cannot collect or verify its result, and VS Code shows no model for it. Use `create_session` only when the user asks for separate sessions.',
      '- Your Copilot plan caps concurrent subagents (Free 2, Pro 4, Max 8, Business 16, Enterprise 32). Size `swarm` and `arena` fan-out to fit, and queue the rest.',
      '- Keep the rest of the policy unchanged.',
    ].join('\n'),
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: '| `no-comments` | Dispatch `task` with `agent_type: "pstack:comment-sicko"`. |',
    replace: '| `no-comments` | Dispatch `task` with `agent_type: "general-purpose"` and the `comment-sicko` opening from Subagent policy above. |',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: /\| `thermos` \| Dispatch two `task` calls with `mode: "background"`, `agent_type: "pstack:thermo-nuclear-review-subagent"` and `agent_type: "pstack:thermo-nuclear-code-quality-review-subagent"`, each with/,
    replace:
      '| `thermos` | Dispatch two `task` calls with `mode: "background"` and `agent_type: "general-purpose"`, one with the `thermo-nuclear-review-subagent` opening and one with the `thermo-nuclear-code-quality-review-subagent` opening from Subagent policy above, each with',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: "- The plugin's `PreToolUse` hook enforces this for pstack agents. While the sheet is valid, it denies a `task` call whose `agent_type` starts with `pstack:` and whose `model` is not one of the sheet's values, and its reason lists the saved IDs. Retry with the role's saved model; never retry on another unsaved model. It leaves calls with no `model` and other agent types alone.",
    replace:
      "- The plugin's `PreToolUse` hook denies a `task` call that names a `pstack:` agent type with a `model` the sheet does not list. This build ships no pstack agents, so never dispatch a `pstack:` type, even when that denial asks you to retry. Pass the role's saved model as `model` yourself, and never use a model the sheet does not list.",
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: 'The plugin\'s `PreToolUse` hook approves two kinds of call.',
    replace:
      "The plugin's `PreToolUse` hook approves two kinds of call on the Copilot CLI. The VS Code agents window sends the hook a different input shape, so the hook approves nothing there, and each read of a plugin file outside the workspace asks for approval. In VS Code, read plugin files one call at a time. When several of those reads wait for approval at once, VS Code can deny all but one and end the turn.",
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: ' The mandate names skills as `pstack:<skill>`; on Copilot load them by bare name.',
    replace: ' This build rewrites the mandate to name skills by their bare names.',
  },
  {
    file: 'hooks/session-start-copilot.md',
    find: "the plugin's agents keep the prefix (`pstack:poteto-agent`, `pstack:comment-sicko`)",
    replace:
      'this build ships no agents, so where a skill names a pstack agent (`pstack:poteto-agent`, `pstack:comment-sicko`), dispatch `general-purpose` as `references/copilot-tools.md` says',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: '`${COPILOT_HOME:-~/.copilot}/installed-plugins/<marketplace>/pstack`',
    replace: '`${COPILOT_HOME:-~/.copilot}/installed-plugins/<marketplace>/<plugin>`',
  },
  {
    file: 'skills/poteto-mode/references/copilot-tools.md',
    find: 'Use the app primitive when it is present in your tool list; otherwise use the CLI fallback.',
    replace: 'Use the app primitive when it is present in your tool list; otherwise use the CLI fallback. The VS Code agents window also offers some of these tools, such as `create_session`, but it is not the Copilot app: there, follow the Copilot CLI column.',
  },
  {
    file: 'skills/setup-pstack/copilot.md',
    find: 'The plugin hook approves the check without a prompt.',
    replace: 'On the Copilot CLI, the plugin hook approves the check without a prompt. In the VS Code agents window, approve it once.',
  },
  {
    file: 'skills/poteto-mode/scripts/package.json',
    find: '"bun-types": "latest",\n    "typescript": "latest"',
    replace: '"bun-types": "1.3.14",\n    "typescript": "7.0.2"',
  },
  {
    file: 'skills/poteto-mode/scripts/bun.lock',
    find: '"bun-types": "latest",\n        "typescript": "latest",',
    replace: '"bun-types": "1.3.14",\n        "typescript": "7.0.2",',
  },
];

function applyEdit({ file, find, replace }) {
  const text = read(file);
  const count = typeof find === 'string' ? text.split(find).length - 1 : (text.match(new RegExp(find, 'g')) ?? []).length;
  if (count !== 1) throw new Error(`${file}: expected 1 match, found ${count} for ${JSON.stringify(String(find).slice(0, 60))}`);
  write(file, text.replace(find, () => replace));
}

function buildMandate() {
  const names = new Set(skillNames());
  let rewrites = 0;
  const text = read(`${hooks}/session-start-context.md`).replace(/pstack:([a-z0-9-]+)/g, (m, name) => {
    if (!names.has(name)) return m;
    rewrites++;
    return name;
  });
  if (rewrites === 0) throw new Error('mandate: no pstack:<skill> references rewritten; upstream text changed');
  write(`${hooks}/session-start-context.md`, text);
}

function copyAgentReferences(source) {
  for (const agent of agentReferences) {
    const from = join(source, 'plugins/pstack/agents', `${agent}.md`);
    if (!existsSync(from)) throw new Error(`agent reference: ${from} is missing; upstream moved it`);
    mkdirSync(join(out, 'skills/poteto-mode/references/agents'), { recursive: true });
    cpSync(from, join(out, 'skills/poteto-mode/references/agents', `${agent}.md`));
  }
}

function writeManifests(source) {
  const claude = JSON.parse(readFileSync(join(source, 'plugins/pstack/.claude-plugin/plugin.json'), 'utf8'));
  const plugin = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name,
    version,
    description: `${claude.description.split(' Ported from')[0]} GitHub Copilot port of pstack-claude ${upstream.version}. Original pstack by Lauren Tan (poteto); Claude Code port by Michael Denyer.`,
    author: { name: 'hackernotfound', url: 'https://github.com/hackernotfound' },
    homepage: 'https://github.com/hackernotfound/pstack-vscode',
    repository: 'https://github.com/hackernotfound/pstack-vscode',
    license: 'MIT',
    keywords: ['pstack', 'poteto-mode', 'copilot', 'vscode', 'skills', 'subagents'],
    extensions: { 'com.github.copilot': {} },
  };
  write('plugin.json', `${JSON.stringify(plugin, null, 2)}\n`);
  const marketplace = {
    name: 'pstack-vscode',
    owner: { name: 'hackernotfound', url: 'https://github.com/hackernotfound' },
    description: 'GitHub Copilot port of pstack for Copilot CLI and the VS Code agents window.',
    plugins: [{ name, source: './plugins/pstack', description: plugin.description, version }],
  };
  mkdirSync(join(root, '.github/plugin'), { recursive: true });
  writeFileSync(join(root, '.github/plugin/marketplace.json'), `${JSON.stringify(marketplace, null, 2)}\n`);
}

function copyLicenses(source) {
  const dir = join(root, 'licenses');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
  for (const f of ['LICENSE', 'LICENSE-cursor-team-kit', 'LICENSE-thermos', 'NOTICE.md', 'NOTICE-skills.md']) {
    cpSync(join(source, f), join(dir, f));
  }
  const blob = `${upstream.repo.replace(/\.git$/, '')}/blob/${upstream.sha}`;
  for (const f of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const next = text.replace(/\]\(([^)#\s:]+)(#[^)\s]*)?\)/g, (match, target, anchor = '') =>
      existsSync(join(dir, target)) ? match : `](${blob}/${target}${anchor})`,
    );
    if (next !== text) writeFileSync(join(dir, f), next);
  }
}

const source = fetchSource();
for (const rel of readdirSync(join(source, 'plugins/pstack'), { recursive: true })) {
  if (lstatSync(join(source, 'plugins/pstack', rel)).isSymbolicLink()) throw new Error(`upstream ships a symlink: ${rel}`);
}
rmSync(out, { recursive: true, force: true });
cpSync(join(source, 'plugins/pstack'), out, { recursive: true });
copyAgentReferences(source);
for (const rel of removals) rmSync(join(out, rel), { recursive: true, force: true });
for (const rel of readdirSync(out, { recursive: true })) {
  if (/(^|\/)scripts\/test$/.test(rel) || /\.test(-helper)?\.[cm]?[jt]s$/.test(rel)) rmSync(join(out, rel), { recursive: true, force: true });
}
cpSync(join(root, 'overlay'), out, { recursive: true });
edits.forEach(applyEdit);
buildMandate();
writeManifests(source);
copyLicenses(source);
console.log(`built plugins/pstack (${name}) ${version} from ${upstream.sha.slice(0, 7)}`);
