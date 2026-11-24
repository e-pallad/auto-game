// Builds an itch.io-ready ZIP (index.html at the archive root, relative paths).
// Usage: npm run package:itch  -> release/floeline-web.zip
// Uses Python's standard-library zipfile module (python3 is present on Ubuntu/WSL) to avoid deps.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
mkdirSync('release', { recursive: true });
const out = join('release', 'floeline-web.zip');
if (existsSync(out)) rmSync(out);
const entries = readdirSync('dist').map((f) => join('dist', f));
execFileSync('python3', ['-m', 'zipfile', '-c', out, ...entries], { stdio: 'inherit' });
const listing = execFileSync('python3', ['-m', 'zipfile', '-l', out]).toString();
if (!/^index\.html\s/m.test(listing)) throw new Error('index.html is not at the ZIP root');
const files = listing.trim().split('\n').length - 1;
console.log(listing);
console.log(`Wrote ${out}: ${statSync(out).size} bytes, ${files} files (itch.io limit: 1000 files, 500 MB).`);
