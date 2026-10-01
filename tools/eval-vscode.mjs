#!/usr/bin/env node
// Live checks against the Copilot SDK runtime that VS Code's agents window runs
// for its Copilot target, configured the way copilotSessionLauncher.ts configures it.
// Same checks as tools/eval.sh. Plugin agents are reported as INFO because VS Code passes
// on-disk plugins without their agents. Needs VS Code >= 1.140, `gh`, and `git`.
// Local only: it hands your gh token to an auto-approved session. Never run it in CI.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = resolve(process.argv[2] ?? join(root, 'plugins/pstack'));
const sdkDir = process.env.VSCODE_COPILOT_SDK
  ?? '/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/copilot-sdk';
const platform = `${process.platform}-${process.arch}`;
const nodeModules = resolve(sdkDir, '../../..');
const { CopilotClient, RuntimeConnection, approveAll } = await import(join(sdkDir, 'index.js'));

const work = mkdtempSync(join(tmpdir(), 'eval-vscode-'));
const repo = join(work, 'repo');
const home = join(work, 'home');
mkdirSync(repo);
mkdirSync(home);
const token = process.env.GH_TOKEN ?? execFileSync('gh', ['auth', 'token']).toString().trim();
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: repo }).toString();

sh('git', ['init', '-q']);
writeFileSync(join(repo, 'math.js'), 'export function add(a, b) {\n  return a + b;\n}\n');
writeFileSync(join(repo, 'main.js'), 'import { add } from "./math.js";\nconsole.log(add(2, 3));\n');
sh('git', ['add', '-A']);
sh('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@local', 'commit', '-qm', 'init']);

const env = { ...process.env };
delete env.NODE_OPTIONS;
for (const key of Object.keys(env)) if (/^(VSCODE_|ELECTRON_)/.test(key)) delete env[key];
const rgDir = join(nodeModules, '@vscode/ripgrep-universal/bin', platform);
Object.assign(env, {
  ELECTRON_RUN_AS_NODE: '1',
  COPILOT_CLI_RUN_AS_NODE: '1',
  USE_BUILTIN_RIPGREP: 'false',
  COPILOT_MCP_APPS: 'true',
  AUTO_APPROVAL: 'true',
  SKILL_CHAR_BUDGET: '15000',
  ANTHROPIC_ADVISOR: 'false',
  COPILOT_HOME: home,
  MXC_BIN_DIR: join(nodeModules, '@microsoft/mxc-sdk/bin'),
  PATH: existsSync(rgDir) ? `${env.PATH}:${rgDir}` : env.PATH,
});
delete env.COPILOT_MODEL_FAMILY;

const client = new CopilotClient({
  useLoggedInUser: false,
  connection: RuntimeConnection.forStdio({ path: join(dirname(sdkDir), 'prebuilds', platform, 'copilot-runtime') }),
  env,
  clientInfo: { applicationName: 'pstack-vscode-eval', applicationVersion: '1' },
  logLevel: 'error',
});
await client.start();

const events = {};
async function run(name, prompt, timeoutMs) {
  const log = join(work, `${name}.jsonl`);
  events[name] = [];
  const session = await client.createSession({
    clientName: 'pstack-vscode-eval',
    featureFlags: { CONNECTORS: false, TGREP: false, CONTENT_EXCLUSION: true },
    streaming: true,
    enableMcpApps: true,
    githubMcpToolConfig: { disableFormDeferral: true },
    enableFileHooks: true,
    enableConfigDiscovery: true,
    enableSkills: true,
    onPermissionRequest: approveAll,
    onUserInputRequest: () => ({ answer: 'Use your best judgment and continue.', wasFreeform: true }),
    onExitPlanModeRequest: () => ({ approved: true }),
    mcpOAuthTokenStorage: 'in-memory',
    workingDirectory: repo,
    excludedTools: ['builtin:semantic_search'],
    largeOutput: { maxSizeBytes: 8 * 1024 },
    pluginDirectories: [plugin],
    gitHubToken: token,
    infiniteSessions: { enabled: true },
    onEvent: (e) => {
      events[name].push(e);
      appendFileSync(log, `${JSON.stringify(e)}\n`);
    },
  });
  const agents = await session.rpc.agent.list({ includeBuiltInAgents: true });
  writeFileSync(join(work, `${name}.agents.json`), JSON.stringify(agents, null, 2));
  try {
    await session.sendAndWait({ prompt }, timeoutMs);
  } catch (err) {
    appendFileSync(log, `${JSON.stringify({ type: 'eval.error', data: { message: String(err?.message ?? err) } })}\n`);
  }
  await session.disconnect();
  return agents.agents.map((a) => a.name);
}

const final = (name) => events[name].filter((e) => e.type === 'assistant.message').map((e) => e.data.content ?? '').join('\n');
const calls = (name) => {
  const ok = new Map(events[name].filter((e) => e.type === 'tool.execution_complete').map((e) => [e.data.toolCallId, e.data.success]));
  return events[name].filter((e) => e.type === 'tool.execution_start').map((e) => ({ id: e.data.toolCallId, parent: e.data.parentToolCallId, t: e.data.toolName, a: e.data.arguments ?? {}, ok: ok.get(e.data.toolCallId) === true }));
};

let fail = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) fail = 1;
}
const info = (label, ok) => console.log(`INFO  ${label}: ${ok ? 'yes' : 'no'}`);
const pstackSkills = new Set(readdirSync(join(plugin, 'skills')));
const subagentRanPstack = (cs) => cs.some((t) => t.t === 'task' && t.ok && cs.some((c) => c.parent === t.id && c.t === 'skill' && pstackSkills.has(String(c.a.skill)) && c.ok));
const rejectedDispatch = (cs) => cs.some((t) => t.t === 'task' && !t.ok);

const agentNames = await run('context', 'Do not run tools. 1) Quote verbatim the sentence in your context that starts with "On GitHub Copilot, skills load". 2) Print the full enum of the agent_type parameter of your task tool, comma separated. 3) Print the number of skills available to you whose name starts with "principle-".', 5 * 60_000);
check('mandate injected by sessionStart hook', final('context').includes('skills load through the'));
info('runtime loaded pstack plugin agents (VS Code passes on-disk plugins without agents)', agentNames.includes('pstack:poteto-agent'));

await run('route', 'Explain how main.js gets its output in this repo. Use poteto-mode, and delegate the code reading to one pstack subagent.', 20 * 60_000);
const route = calls('route');
check('poteto-mode loaded via skill tool', route.some((c) => c.t === 'skill' && String(c.a.skill).includes('poteto-mode') && c.ok));
check('no namespaced skill lookups', !route.some((c) => String(c.a.skill ?? '').startsWith('pstack:')));
check('a subagent ran and loaded a pstack skill itself', subagentRanPstack(route));
check('no subagent dispatch was rejected', !rejectedDispatch(route));
check('no Claude-only tool names called', !route.some((c) => /^(Agent|Skill|Task|AskUserQuestion|TodoWrite)$/.test(c.t)));

await run('auto', 'Rename the function add to sum everywhere in this repo, keep main.js printing 5, and verify it by running it.', 20 * 60_000);
check('mandate routes a multi-file change into poteto-mode unprompted', calls('auto').some((c) => c.t === 'skill' && String(c.a.skill).includes('poteto-mode') && c.ok));
check('copilot-tools.md read during a pstack run', [...route, ...calls('auto')].some((c) => String(c.a.path ?? '').includes('copilot-tools.md')));
let output = '';
try { output = execFileSync('node', ['main.js'], { cwd: repo }).toString().trim(); } catch {}
check('rename landed and runs', output === '5' && readFileSync(join(repo, 'math.js'), 'utf8').includes('function sum'));

await client.stop();
console.log(`transcripts: ${work}`);
process.exit(fail);
