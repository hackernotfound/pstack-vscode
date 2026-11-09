#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamFile = join(root, 'upstream.json');
const upstream = JSON.parse(readFileSync(upstreamFile, 'utf8'));
const semver = (v) => v.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function plan() {
  const refs = execFileSync('git', ['ls-remote', '--tags', upstream.repo, 'v*'], { encoding: 'utf8' });
  const tags = new Map();
  for (const line of refs.trim().split('\n')) {
    const [sha, ref] = line.split('\t');
    const m = /^refs\/tags\/v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(\^\{\})?$/.exec(ref ?? '');
    if (m && (m[2] || !tags.has(m[1]))) tags.set(m[1], sha);
  }
  const latest = [...tags.keys()].reduce((a, b) => (newer(b, a) ? b : a), upstream.version);
  if (latest !== upstream.version) console.log(`${latest} ${tags.get(latest)}`);
}

function apply(version, sha) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error(`bad release: ${version} ${sha}`);
  writeFileSync(upstreamFile, `${JSON.stringify({ ...upstream, sha, version }, null, 2)}\n`);
  const old = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  const [major, minor] = semver(old);
  const next = `${major}.${minor + 1}.0`;
  writeFileSync(join(root, 'VERSION'), `${next}\n`);
  const readme = join(root, 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8').replaceAll(`version-${old}-`, `version-${next}-`).replaceAll(`releases/tag/v${old})`, `releases/tag/v${next})`));
  execFileSync('node', [join(root, 'tools/build.mjs')], { stdio: 'inherit' });
  console.log(next);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'plan') plan();
else if (command === 'apply') apply(...args);
else throw new Error('usage: sync-upstream.mjs plan | apply <version> <sha>');
