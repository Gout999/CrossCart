// Local-only by default. The opt-in is for a separately approved phone test.
/** @param {Record<string, string | undefined>} [env] */
export function demoOrigin(env = process.env) {
  const url = new URL(env.APP_URL || 'http://127.0.0.1:3107');
  const host = env.CROSSCART_HOST || '127.0.0.1';
  const privateIPv4 = value => { const n = value.split('.').map(Number); return /^\d+\.\d+\.\d+\.\d+$/.test(value) && n.every(x => x >= 0 && x <= 255) && (n[0] === 10 || n[0] === 172 && n[1] >= 16 && n[1] <= 31 || n[0] === 192 && n[1] === 168); };
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (host !== '127.0.0.1' || !loopback) {
    if (env.CROSSCART_ENABLE_LAN !== 'true' || !privateIPv4(host) || url.hostname !== host) throw new Error('LAN test requires separate approval, an explicit private interface and matching APP_URL. Public/wildcard binding is rejected.');
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a plain local HTTP demo origin.');
  if (url.port !== String(env.PORT || '3107')) throw new Error('APP_URL and server PORT must match.');
  return { host, url };
}
