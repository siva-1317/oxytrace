import fs from 'fs';

const path = 'd:/oxytrace/client/src/lib/api.js';
let content = fs.readFileSync(path, 'utf8');

const target = `  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || \`Request failed (\${res.status})\`);
  }`;

const replacement = `  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    if (res.status === 403 && payload?.error === 'banned') {
      setTimeout(() => { window.location.href = '/blocked'; }, 100);
      throw new Error('banned');
    }
    throw new Error(payload.error || \`Request failed (\${res.status})\`);
  }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success");
} else {
  console.log("Target not found");
}
