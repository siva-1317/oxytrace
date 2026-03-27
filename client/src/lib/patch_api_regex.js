import fs from 'fs';

const path = 'd:/oxytrace/client/src/lib/api.js';
let content = fs.readFileSync(path, 'utf8');

// Regex to find: if (!res.ok) { ... throw new Error(...) }
// and inject the 403 check
const regex = /if\s*\(\s*!res\.ok\s*\)\s*\{[\s\S]*?const\s+payload\s*=\s*await\s+res\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\);[\s\S]*?throw\s+new\s+Error\([\s\S]*?\);[\s\S]*?\}/g;

const matched = content.match(regex);
if (matched) {
  const replacement = `if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    if (res.status === 403 && payload?.error === 'banned') {
      setTimeout(() => { window.location.href = '/blocked'; }, 100);
      throw new Error('banned');
    }
    throw new Error(payload.error || \`Request failed (\${res.status})\`);
  }`;
  
  content = content.replace(matched[0], replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success with regex");
} else {
  console.log("Regex failed to find target");
}
