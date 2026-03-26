import { processMessage } from './ai/agent';
import { clearHistory } from './conversation/manager';
import { logger } from './utils/logger';

logger.level = 'silent';

async function main() {
  await clearHistory('test_break_raw');

  const response = await processMessage({
    userMessage: 'quais serviços vocês tem?',
    conversationHistory: [],
    role: 'client',
    clientPhone: '5527999990000',
    channel: 'whatsapp',
  });

  console.log('=== RAW RESPONSE ===');
  console.log(JSON.stringify(response));
  console.log('\n=== CHARS ===');
  for (let i = 0; i < response.length; i++) {
    const ch = response[i];
    const code = response.charCodeAt(i);
    if (code === 10) console.log(`  [${i}] \\n (newline)`);
    else if (code === 13) console.log(`  [${i}] \\r (carriage return)`);
    else if (ch === '[') console.log(`  [${i}] [ (start bracket)`);
    else if (ch === ']') console.log(`  [${i}] ] (end bracket)`);
  }

  console.log('\n=== SPLIT BY [BREAK] ===');
  const parts = response.split('[BREAK]');
  console.log(`Parts: ${parts.length}`);
  parts.forEach((p, i) => console.log(`  Part ${i}: "${p.trim()}"`));

  console.log('\n=== SPLIT BY [BREAK] case-insensitive ===');
  const parts2 = response.split(/\[BREAK\]/gi);
  console.log(`Parts: ${parts2.length}`);
  parts2.forEach((p, i) => console.log(`  Part ${i}: "${p.trim()}"`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
