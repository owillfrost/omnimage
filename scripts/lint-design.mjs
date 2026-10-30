import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'dist-electron') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC_DIR);
let errors = 0;

const BANNED_PATTERNS = [
  {
    regex: /\bhover:scale-(?:102|105|110|125|150)\b/,
    name: 'prohibited-hover-scale',
    message: 'Prohibited hover scale animation (violates Visant hard prohibition)',
  },
  {
    regex: /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
    name: 'arbitrary-hex-token-bypass',
    message: 'Arbitrary hex color class bypasses design token system',
  },
];

for (const f of files) {
  const content = readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  const relPath = relative(process.cwd(), f).replace(/\\/g, '/');

  lines.forEach((line, idx) => {
    // Check if line has written exception
    if (line.includes('EXCEPTION') || line.includes('EXCEÇÃO')) return;

    for (const rule of BANNED_PATTERNS) {
      if (rule.regex.test(line)) {
        console.error(`${relPath}:${idx + 1}: [${rule.name}] ${rule.message}`);
        errors++;
      }
    }
  });
}

if (errors > 0) {
  process.exit(1);
} else {
  // Silent success as expected by standard unix/grep linters
  process.exit(0);
}
