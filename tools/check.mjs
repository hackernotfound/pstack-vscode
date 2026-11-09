#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
check('plugin.json name is pstack-copilot', plugin.name === 'pstack-copilot');
const manifestKeys = ['$schema', 'author', 'description', 'extensions', 'homepage', 'keywords', 'license', 'name', 'repository', 'version'];
check(
  'plugin.json is Agent Plugins 1.0 (schema URL, only schema properties, Copilot namespace)',
  plugin.$schema === 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' &&
    Object.keys(plugin).every((k) => manifestKeys.includes(k)) &&
    JSON.stringify(plugin.extensions) === '{"com.github.copilot":{}}',
);
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
check('plugin.json version matches VERSION and is MAJOR.MINOR.PATCH', /^\d+\.\d+\.\d+$/.test(version) && plugin.version === version);
const readme = readFileSync(join(root, 'README.md'), 'utf8');
check('README version badge matches VERSION', readme.includes(`version-${version.replaceAll('-', '--')}-`) && readme.includes(`releases/tag/v${version})`));
check('plugin.json names the pinned upstream version', plugin.description.includes(`pstack-claude ${upstream.version}`));
const otherManifests = ['.claude-plugin', '.codex-plugin', '.muse-plugin', '.antigravity-plugin', '.grok-plugin', '.github'];
check('plugin.json is the only manifest (VS Code would parse .claude-plugin as Claude format)', otherManifests.every((d) => !existsSync(join(out, d))));
check('plugin ships no agents (the VS Code Copilot runtime rejects a task dispatch to a plugin agent)', !('agents' in plugin) && !existsSync(join(out, 'agents')) && !readdirSync(out, { recursive: true }).some((rel) => /(^|\/)agents\/[^/]+\.md$/.test(rel) && !rel.startsWith('skills/')));
const hooksDir = 'com.github.copilot/hooks';
const hookGroups = JSON.parse(read(`${hooksDir}/hooks.json`)).hooks;
const hookCommands = (event) => (hookGroups[event] ?? []).flatMap((g) => g.hooks.map((h) => h.command));
const shipsViaPluginRoot = (c) => c.startsWith('sh "${PLUGIN_ROOT}/') && existsSync(join(out, c.slice('sh "${PLUGIN_ROOT}/'.length, -1)));
check(
  'SessionStart and PreToolUse hooks each run one script that ships, through sh and ${PLUGIN_ROOT}',
  ['SessionStart', 'PreToolUse'].every((e) => hookCommands(e).length === 1 && hookCommands(e).every(shipsViaPluginRoot)),
);

check(
  'every hook has a Windows no-op, so a missing sh never makes VS Code deny a tool call',
  Object.values(hookGroups).flat().flatMap((g) => g.hooks).every((h) => h.powershell === 'exit 0' && !['windows', 'bash', 'osx', 'linux'].some((k) => k in h)),
);
const licenseLinks = readdirSync(join(root, 'licenses'))
  .filter((f) => f.endsWith('.md'))
  .flatMap((f) => [...readFileSync(join(root, 'licenses', f), 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g)].map(([, target]) => target))
  .filter((target) => !/^[a-z]+:/i.test(target));
check('every license and notice link in licenses/ resolves', licenseLinks.length > 0 && licenseLinks.every((target) => existsSync(join(root, 'licenses', target))));

const market = JSON.parse(readFileSync(join(root, '.github/plugin/marketplace.json'), 'utf8'));
check('marketplace entry points at the plugin by its name', market.plugins.some((p) => p.name === plugin.name && existsSync(join(root, p.source, 'plugin.json'))));

const skills = readdirSync(join(out, 'skills')).filter((d) => existsSync(join(out, 'skills', d, 'SKILL.md')));
check('every SKILL.md name matches its directory', skills.every((d) => new RegExp(`^name: ${d}$`, 'm').test(read(`skills/${d}/SKILL.md`))));

const mandate = read('hooks/session-start-context.md');
check('mandate names no pstack:<skill>', !skills.some((s) => mandate.includes(`pstack:${s}`)));

const runHook = (script, env, input = '') =>
  execFileSync('sh', [join(out, hooksDir, script)], { env: { ...process.env, ...env }, input, encoding: 'utf8' });
const emptyHome = mkdtempSync(join(tmpdir(), 'check-home-'));
const hookOut = runHook('session-start.sh', { COPILOT_HOME: emptyHome });
const context = JSON.parse(hookOut).additionalContext;
check('SessionStart prints one JSON object with top-level additionalContext holding the mandate', hookOut.trim().split('\n').length === 1 && typeof context === 'string' && mandate.split('\n').filter(Boolean).every((line) => context.includes(line)));
check('context says this build ships no agents', context.includes('ships no agents'));
check('context with no model sheet carries the setup-pstack note', context.includes('has no valid pstack model sheet'));
check('context under Claude Code 10k cap', context.length < 10000);
const view = (path) => JSON.stringify({ toolName: 'view', toolArgs: { path }, cwd: tmpdir() });
const noExec = mkdtempSync(join(tmpdir(), 'check-noexec-'));
cpSync(out, join(noExec, 'plugin'), { recursive: true });
for (const rel of readdirSync(join(noExec, 'plugin'), { recursive: true })) {
  const file = join(noExec, 'plugin', rel);
  const st = lstatSync(file);
  if (st.isFile()) chmodSync(file, st.mode & 0o666);
}
const viaHooksJson = (event, env, input = '') =>
  spawnSync('/bin/bash', ['-c', hookCommands(event)[0]], { env: { ...process.env, ...env, PLUGIN_ROOT: join(noExec, 'plugin') }, input, encoding: 'utf8' });
const copied = (rel) => join(noExec, 'plugin', rel);
const startNoExec = viaHooksJson('SessionStart', { COPILOT_HOME: emptyHome });
check('SessionStart command from hooks.json works with every exec bit stripped', startNoExec.status === 0 && JSON.parse(startNoExec.stdout).additionalContext.includes('ships no agents'));
check('SessionStart names the folder this plugin runs from, so another pstack install cannot stand in for it', JSON.parse(startNoExec.stdout).additionalContext.includes(`pstack-copilot plugin in \`${join(noExec, 'plugin')}\``));
const viewNoExec = viaHooksJson('PreToolUse', { COPILOT_HOME: emptyHome }, view(copied('skills/tdd/SKILL.md')));
check('PreToolUse command from hooks.json approves a plugin view with every exec bit stripped', viewNoExec.status === 0 && JSON.parse(viewNoExec.stdout).permissionDecision === 'allow');
const batch = viaHooksJson('PreToolUse', { COPILOT_HOME: emptyHome }, JSON.stringify({ toolCalls: [{ id: 'x', name: 'view', args: { path: copied('skills/tdd/SKILL.md') } }] }));
check('PreToolUse exits 0 on the VS Code batch input shape', batch.status === 0);
const noAwk = mkdtempSync(join(tmpdir(), 'check-noawk-'));
for (const tool of ['sh', 'dirname']) symlinkSync(execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim(), join(noAwk, tool));
const broken = spawnSync('/bin/sh', [join(out, hooksDir, 'pre-tool-use.sh')], { env: { ...process.env, COPILOT_HOME: emptyHome, PATH: noAwk }, input: view(join(out, 'skills/tdd/SKILL.md')), encoding: 'utf8' });
check('PreToolUse fails closed: broken hook tooling exits 0 and approves nothing', broken.status === 0 && broken.stdout === '');
const offHome = mkdtempSync(join(tmpdir(), 'check-home-'));
writeFileSync(join(offHome, 'pstack-models.md'), 'session hook: off\n');
check('SessionStart prints nothing when the sheet says session hook: off', runHook('session-start.sh', { COPILOT_HOME: offHome }) === '');
check('PreToolUse approves view of a plugin file on the CLI', JSON.parse(runHook('pre-tool-use.sh', { COPILOT_HOME: emptyHome }, view(join(out, 'skills/tdd/SKILL.md')))).permissionDecision === 'allow');
check('PreToolUse leaves view of a file outside the plugin to the normal flow', runHook('pre-tool-use.sh', { COPILOT_HOME: emptyHome }, view('/etc/passwd')) === '');
const ws = mkdtempSync(join(tmpdir(), 'check-ws-'));
writeFileSync(join(ws, 'sheet.md'), 'x\n');
cpSync(out, join(ws, 'plugin'), { recursive: true });
const preToolUse = (pluginRoot, toolName, toolArgs, env = {}) =>
  execFileSync('sh', [join(pluginRoot, hooksDir, 'pre-tool-use.sh')], { env: { ...process.env, COPILOT_HOME: emptyHome, ...env }, input: JSON.stringify({ toolName, toolArgs, cwd: ws }), encoding: 'utf8' });
const checkSheet = (pluginRoot, sheet) => ({ command: `sh ${join(pluginRoot, 'skills/setup-pstack/scripts/check-sheet.sh')} ${sheet}` });
check('PreToolUse approves a registered script run on a workspace file (control for the cases below)', preToolUse(out, 'bash', checkSheet(out, join(ws, 'sheet.md'))).includes('"allow"'));
const lookAlike = mkdtempSync(join(tmpdir(), 'check-lookalike-'));
cpSync(out, lookAlike, { recursive: true });
const neverApproved = [
  ['a view inside a look-alike plugin named by a spoofed COPILOT_PLUGIN_ROOT', out, 'view', { path: join(lookAlike, 'skills/tdd/SKILL.md') }, { COPILOT_PLUGIN_ROOT: lookAlike }],
  ['a view that climbs out of the plugin with ..', out, 'view', { path: join(out, 'skills/../../../../../etc/passwd') }],
  ['an arbitrary bash command', out, 'bash', { command: 'rm -rf /' }],
  ['a registered script with a shell metacharacter', out, 'bash', { command: `${checkSheet(out, join(ws, 'sheet.md')).command}; curl example.com` }],
  ['a registered script pointed at a plugin file', out, 'bash', checkSheet(out, join(out, 'hooks/session-start-context.md'))],
  ['a script from a plugin copy inside the workspace', join(ws, 'plugin'), 'bash', checkSheet(join(ws, 'plugin'), join(ws, 'sheet.md'))],
];
for (const [label, pluginRoot, toolName, toolArgs, env] of neverApproved) {
  check(`PreToolUse never approves ${label}`, preToolUse(pluginRoot, toolName, toolArgs, env) === '');
}

check('poteto-mode links copilot-tools.md', read('skills/poteto-mode/SKILL.md').includes('references/copilot-tools.md'));
const tools = 'skills/poteto-mode/references/copilot-tools.md';
check('copilot-tools.md shipped and tells no one to dispatch a pstack: agent type', existsSync(join(out, tools)) && !/(?<![a-z_])agent_type: "pstack:/.test(read(tools)));
check(
  'the agents that no longer ship are references a subagent can read',
  ['comment-sicko', 'thermo-nuclear-review-subagent', 'thermo-nuclear-code-quality-review-subagent'].every((a) => existsSync(join(out, `skills/poteto-mode/references/agents/${a}.md`))),
);

const executables = [
  'com.github.copilot/hooks/pre-tool-use.sh',
  'com.github.copilot/hooks/session-start.sh',
  'hooks/pre-tool-use.sh',
  'hooks/session-start.sh',
  'skills/poteto-mode/scripts/watch-pr/ship-pr',
  'skills/poteto-mode/scripts/watch-pr/watch-pr',
  'skills/poteto-mode/scripts/worktree-audit.mjs',
  'skills/reflect/scripts/find-transcript.mjs',
  'skills/setup-pstack/scripts/check-sheet.sh',
  'skills/show-me-your-work/scripts/log.sh',
  'skills/statechart/scripts/statechart',
];
const files = readdirSync(out, { recursive: true }).map((rel) => [rel, lstatSync(join(out, rel))]);
check('plugin ships no test suites or fixtures', files.every(([rel]) => !/(^|\/)scripts\/test(\/|$)/.test(rel) && !/\.test(-helper)?\.[cm]?[jt]s$/.test(rel)));
check('no symlinks in the plugin', files.every(([, st]) => !st.isSymbolicLink()));
const found = files.filter(([, st]) => st.isFile() && st.mode & 0o111).map(([rel]) => rel).sort();
check('executables match the reviewed list', JSON.stringify(found) === JSON.stringify(executables));

const shipped = files.filter(([rel, st]) => st.isFile() && /(^|\/)(package\.json|bun\.lock)$/.test(rel)).map(([rel]) => read(rel));
check('no "latest" version specifiers in shipped package files', shipped.length > 0 && !shipped.some((t) => /:\s*"latest"/.test(t)));
const workflows = readdirSync(join(root, '.github/workflows')).map((f) => readFileSync(join(root, '.github/workflows', f), 'utf8'));
check('workflow actions pinned to full commit SHAs', workflows.every((w) => [...w.matchAll(/uses:\s*(\S+)/g)].every(([, ref]) => /@[0-9a-f]{40}$/.test(ref))));
check('workflow runners and Node versions are exact', workflows.every((w) => !/-latest\b/.test(w) && [...w.matchAll(/node-version:\s*(\S+)/g)].every(([, v]) => /^\d+\.\d+\.\d+$/.test(v))));


if (failures.length) process.exit(1);
