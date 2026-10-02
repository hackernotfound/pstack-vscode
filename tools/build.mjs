#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`VERSION must be MAJOR.MINOR.PATCH, got ${JSON.stringify(version)}`);
const out = join(root, 'plugins/pstack');
const name = 'pstack-copilot';
// Agent Plugins 1.0 keeps Copilot-only parts, such as hooks, under this namespace folder.
const hooks = 'com.github.copilot/hooks';

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

const removals = ['.codex-plugin', '.claude-plugin', 'hooks/codex-hooks.json', 'hooks/hooks.json', 'hooks/session-start.sh', 'agents', 'effort-agents'];

const edits = [
  {
    file: 'skills/poteto-mode/SKILL.md',
    find: 'On Codex, read [`references/codex-tools.md`](references/codex-tools.md) for the Codex equivalent of a Claude tool, model, or skill named by these workflows.',
    replace:
      'On GitHub Copilot (Copilot CLI, or the VS Code agents window with the Copilot target), read [`references/copilot-tools.md`](references/copilot-tools.md) for the Copilot equivalent of a Claude tool, model, or skill named by these workflows. On Codex, read [`references/codex-tools.md`](references/codex-tools.md) for the Codex equivalent.',
  },
  {
    file: 'skills/setup-pstack/SKILL.md',
    find: '| hook contract tested; discovery verified |\n',
    replace:
      '| hook contract tested; discovery verified |\n| GitHub Copilot | `<copilot-home>/pstack-models.md`, where `<copilot-home>` is `$COPILOT_HOME` or `~/.copilot` | model rows: paste into `<copilot-home>/copilot-instructions.md`; hook setting: read by the plugin | slugs the runtime accepts for `task`\'s `model`, see [copilot-tools.md](../poteto-mode/references/copilot-tools.md#model-names) | hook contract and dispatch verified on Copilot CLI |\n',
  },
  {
    file: 'skills/setup-pstack/SKILL.md',
    find: 'The `session hook` line applies to the Claude Code and Codex plugins.',
    replace: 'The `session hook` line applies to the Claude Code, Codex, and GitHub Copilot plugins.',
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
  {
    file: 'skills/setup-pstack/SKILL.md',
    find: 'On Claude Code and Codex, the plugin\'s `SessionStart` hook',
    replace: 'On Claude Code, Codex, and GitHub Copilot, the plugin\'s `SessionStart` hook',
  },
];

function applyEdit({ file, find, replace }) {
  const text = read(file);
  const count = text.split(find).length - 1;
  if (count !== 1) throw new Error(`${file}: expected 1 match, found ${count} for ${JSON.stringify(find.slice(0, 60))}`);
  write(file, text.replace(find, () => replace));
}

function unlinkCrossSkillReferences() {
  const skillsRoot = join(out, 'skills');
  const link = /\[([^\]]+)\]\(((?:\.\.\/)+)([a-z0-9-]+)\/([^)#\s]*)(#[^)\s]*)?\)/g;
  let rewrites = 0;
  for (const rel of readdirSync(skillsRoot, { recursive: true })) {
    if (!rel.endsWith('.md')) continue;
    const file = join(skillsRoot, rel);
    const text = readFileSync(file, 'utf8');
    const next = text.replace(link, (match, label, ups, skill, rest) => {
      const target = resolve(dirname(file), ups, skill, rest);
      if (!target.startsWith(`${skillsRoot}/`) || target.startsWith(`${join(skillsRoot, rel.split('/')[0])}/`)) return match;
      rewrites++;
      return `${label} (see \`${relative(out, target)}\` in this plugin)`;
    });
    if (next !== text) writeFileSync(file, next);
  }
  if (rewrites === 0) throw new Error('cross-skill links: none rewritten; upstream link style changed');
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
  const pointer =
    '\nOn GitHub Copilot, skills load through the `skill` tool by bare name, such as `poteto-mode`. This plugin ships no agents; where a skill names a pstack agent, dispatch `general-purpose` as copilot-tools.md says. When a pstack skill names a Claude tool or model, read the pstack plugin\'s `skills/poteto-mode/references/copilot-tools.md`.\n';
  const mandate = text.replace('</EXTREMELY_IMPORTANT>', `${pointer}</EXTREMELY_IMPORTANT>`);
  if (mandate === text) throw new Error('mandate: closing tag not found');
  write(`${hooks}/session-start-context.md`, mandate);
  write(`${hooks}/session-start-context.json`, `${JSON.stringify({ additionalContext: mandate })}\n`);
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
  for (const f of ['LICENSE', 'LICENSE-cursor-team-kit', 'NOTICE.md', 'NOTICE-skills.md']) {
    cpSync(join(source, f), join(dir, f));
  }
}

const source = fetchSource();
rmSync(out, { recursive: true, force: true });
cpSync(join(source, 'plugins/pstack'), out, { recursive: true });
for (const rel of removals) rmSync(join(out, rel), { recursive: true, force: true });
mkdirSync(dirname(join(out, hooks)), { recursive: true });
renameSync(join(out, 'hooks'), join(out, hooks));
cpSync(join(root, 'overlay'), out, { recursive: true });
edits.forEach(applyEdit);
unlinkCrossSkillReferences();
buildMandate();
writeManifests(source);
copyLicenses(source);
console.log(`built plugins/pstack (${name}) ${version} from ${upstream.sha.slice(0, 7)}`);
