#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'plugins/pstack');
const read = (rel) => readFileSync(join(out, rel), 'utf8');
const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures.push(name);
};

execFileSync('node', [join(root, 'tools/build.mjs')], { stdio: 'ignore' });
const git = (...args) => execFileSync('git', ['-C', root, ...args, '--', 'plugins', '.github', 'licenses'], { encoding: 'utf8' });
const dirty = git('diff', '--name-only') + git('ls-files', '--others', '--exclude-standard');
check('build is idempotent (rebuild leaves no diff)', dirty === '');

const plugin = JSON.parse(read('plugin.json'));
const upstream = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'));
check('plugin.json name is pstack', plugin.name === 'pstack');
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
check('plugin.json version matches VERSION and is MAJOR.MINOR.PATCH', /^\d+\.\d+\.\d+$/.test(version) && plugin.version === version);
check('plugin.json names the pinned upstream version', plugin.description.includes(`pstack-claude ${upstream.version}`));
check('no .claude-plugin manifest (VS Code would parse it as Claude format)', !existsSync(join(out, '.claude-plugin')));
check('plugin ships no agents (the VS Code agents window lists each plugin agent twice)', !('agents' in plugin) && !existsSync(join(out, 'agents')) && !readdirSync(out, { recursive: true }).some((rel) => /(^|\/)agents\/[^/]+\.md$/.test(rel) && !rel.startsWith('skills/')));
check('hooks file exists', existsSync(join(out, plugin.hooks)));

const market = JSON.parse(readFileSync(join(root, '.github/plugin/marketplace.json'), 'utf8'));
check('marketplace source points at the plugin', market.plugins.some((p) => existsSync(join(root, p.source, 'plugin.json'))));

const skills = readdirSync(join(out, 'skills')).filter((d) => existsSync(join(out, 'skills', d, 'SKILL.md')));
check('every SKILL.md name matches its directory', skills.every((d) => new RegExp(`^name: ${d}$`, 'm').test(read(`skills/${d}/SKILL.md`))));

const mandate = read('hooks/session-start-context.md');
const ctx = JSON.parse(read('hooks/session-start-context.json'));
check('hook JSON carries the mandate as top-level additionalContext', ctx.additionalContext === mandate);
check('mandate names no pstack:<skill>', !skills.some((s) => mandate.includes(`pstack:${s}`)));
check('mandate under Claude Code 10k cap', mandate.length < 10000);

const hookOut = execFileSync(join(out, 'hooks/session-start.sh'), { env: { ...process.env, COPILOT_HOME: '/nonexistent' }, encoding: 'utf8' });
check('hook script prints the JSON', JSON.parse(hookOut).additionalContext === mandate);

check('poteto-mode links copilot-tools.md', read('skills/poteto-mode/SKILL.md').includes('references/copilot-tools.md'));
check('copilot-tools.md shipped', existsSync(join(out, 'skills/poteto-mode/references/copilot-tools.md')));

const executables = [
  'hooks/session-start.sh',
  'skills/poteto-mode/scripts/orch/orch.ts',
  'skills/poteto-mode/scripts/watch-pr/ship-pr',
  'skills/poteto-mode/scripts/watch-pr/watch-pr',
  'skills/poteto-mode/scripts/worktree-audit.mjs',
  'skills/reflect/scripts/find-transcript.mjs',
  'skills/show-me-your-work/scripts/log.sh',
];
const files = readdirSync(out, { recursive: true }).map((rel) => [rel, lstatSync(join(out, rel))]);
check('no symlinks in the plugin', files.every(([, st]) => !st.isSymbolicLink()));
const found = files.filter(([, st]) => st.isFile() && st.mode & 0o111).map(([rel]) => rel).sort();
check('executables match the reviewed list', JSON.stringify(found) === JSON.stringify(executables));

const shipped = files.filter(([rel, st]) => st.isFile() && /(^|\/)(package\.json|bun\.lock)$/.test(rel)).map(([rel]) => read(rel));
check('no "latest" version specifiers in shipped package files', shipped.length > 0 && !shipped.some((t) => /:\s*"latest"/.test(t)));
const workflows = readdirSync(join(root, '.github/workflows')).map((f) => readFileSync(join(root, '.github/workflows', f), 'utf8'));
check('workflow actions pinned to full commit SHAs', workflows.every((w) => [...w.matchAll(/uses:\s*(\S+)/g)].every(([, ref]) => /@[0-9a-f]{40}$/.test(ref))));
check('workflow runners and Node versions are exact', workflows.every((w) => !/-latest\b/.test(w) && [...w.matchAll(/node-version:\s*(\S+)/g)].every(([, v]) => /^\d+\.\d+\.\d+$/.test(v))));

if (failures.length) process.exit(1);
