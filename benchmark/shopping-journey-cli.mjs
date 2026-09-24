import { readFile, writeFile } from 'node:fs/promises';
import { scoreShoppingJourney } from './shopping-journey.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('Usage: npm run benchmark:shopping -- evidence.json output.json'); process.exitCode = 1; }
else {
  const result = scoreShoppingJourney(JSON.parse(await readFile(input, 'utf8')));
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Scored shopping evidence. Output requires evidence review; nothing was published.');
}
