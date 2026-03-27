import fs from 'fs';

const path = 'd:/oxytrace/client/src/lib/api.js';
let content = fs.readFileSync(path, 'utf8');

// The current problematic code:
const target = `    if (res.status === 403 && payload?.error === 'banned') {
      setTimeout(() => { window.location.href = '/blocked'; }, 100);
      throw new Error('banned');
    }`;

// The fixed code:
const replacement = `    if (res.status === 403 && payload?.error === 'banned') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/blocked') {
        setTimeout(() => { window.location.href = '/blocked'; }, 100);
      }
      throw new Error('banned');
    }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success");
} else {
  // Try with flexible regex if string match fails
  const regex = /if\s*\(\s*res\.status\s*===\s*403\s*&&\s*payload\?\.error\s*===\s*'banned'\s*\)\s*\{[\s\S]*?setTimeout\([\s\S]*?window\.location\.href\s*=\s*'\/blocked'[\s\S]*?\);/g;
  if (content.match(regex)) {
     content = content.replace(regex, `if (res.status === 403 && payload?.error === 'banned') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/blocked') {
        setTimeout(() => { window.location.href = '/blocked'; }, 100);
      }
      throw new Error('banned');
    `);
     fs.writeFileSync(path, content, 'utf8');
     console.log("Success with regex");
  } else {
    console.log("Target not found");
  }
}
