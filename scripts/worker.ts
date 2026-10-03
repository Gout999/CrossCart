import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
const store = new Store(); const service = new Commerce(store);
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
console.log('CrossCart durable worker ready. Provider states are retrieved server-side.');
while (!stopping) {
  try { const worked = await service.processOne(); await new Promise(r => setTimeout(r, worked ? 150 : 350)); }
  catch { console.error('Worker could not process a job. Durable state retained; retrying.'); await new Promise(r => setTimeout(r, 1000)); }
}
store.close();
