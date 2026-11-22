import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const visibleSources = ['index.html', 'site-repair.js', 'team-experience.js', 'game-room.js', 'mobile-navigation.js', 'site-repair.css'];
const forbidden = [
  /chat[\s_-]*gpt/i,
  /open[\s_-]*ai/i,
  /app[\s_-]*deploy/i,
  /\bgpt(?:-[3456])?(?:\.\d+)?\b/i,
  /\bai[\s_-]*(?:assistant|chatbot|powered|generated|created|written)\b/i,
  /\b(?:powered|built|generated|created|written)\s+(?:by|with|using)\s+ai\b/i,
  /(?:chat|assistant)[\s_-]*(?:widget|popup|bubble)/i,
];
for (const file of visibleSources) {
  const source = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    assert.ok(!pattern.test(source), 'Unexpected branded or chatbot reference in ' + file + ': ' + pattern);
  }
}
const html = readFileSync('index.html', 'utf8');
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map(m => m[1].split('?')[0]);
assert.deepEqual(scriptTags, ['site-repair.js', 'team-experience.js', 'game-room.js', 'mobile-navigation.js'], 'Only the self-hosted website scripts should run');
assert.ok(!/<iframe\b/i.test(html), 'Unexpected embedded frame');
assert.ok(!/\b(?:intercom|crisp|tawk\.to|chatwoot|chatbase)\b/i.test(html), 'Unexpected chat service');
assert.ok(/<title>[\s\S]*Aureum Tipoff/i.test(html), 'Brand title is required');
console.log('PASS: public-facing source, navigation and metadata contain no unwanted third-party chatbot branding');
