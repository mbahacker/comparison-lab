import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { WorkerError } from './protocol.mjs';

export function isPublicIp(input) {
  try {
    let ip = ipaddr.parse(input);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}
export function validatePublicUrl(input) {
  const u = new URL(input);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new WorkerError('unsafe_target', 'Only public HTTP(S) on standard ports is supported');
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h.endsWith('.') || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || (!h.includes('.') && !net.isIP(h))) throw new WorkerError('unsafe_target', 'Private hostnames are blocked');
  if (net.isIP(h) && !isPublicIp(h)) throw new WorkerError('unsafe_target', 'Private or reserved addresses are blocked');
  return u;
}
export async function resolvePublic(hostname, lookup = dns.lookup) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(r => !isPublicIp(r.address))) throw new WorkerError('unsafe_target', 'DNS included a private or reserved address');
  return records[0];
}
// A validating CONNECT proxy pins each socket to the IP it checked. The browser never
// resolves the destination a second time, closing the usual DNS-rebinding window.
export async function startPublicProxy({ host = '127.0.0.1', port = 0 } = {}) {
  const sockets = new Set();
  const track = socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); };
  const server = http.createServer(async (request, response) => {
    try {
      const url = validatePublicUrl(request.url);
      if (url.protocol !== 'http:') throw new Error('Use CONNECT for TLS');
      const address = await resolvePublic(url.hostname);
      const headers = { ...request.headers, host: url.host };
      delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const remote = http.request({ host: address.address, family: address.family, port: Number(url.port) || 80,
        method: request.method, path: url.pathname + url.search, headers, timeout: 30_000 }, res => {
        response.writeHead(res.statusCode, res.headers); res.pipe(response);
      });
      remote.on('socket', track); remote.on('timeout', () => remote.destroy());
      remote.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      request.pipe(remote);
    } catch { response.writeHead(403); response.end('Destination blocked'); }
  });
  server.on('connect', async (request, client, head) => {
    try {
      const url = validatePublicUrl(`https://${request.url}`);
      if ((Number(url.port) || 443) !== 443) throw new Error('CONNECT only accepts 443');
      const address = await resolvePublic(url.hostname);
      const remote = net.connect({ host: address.address, family: address.family, port: 443 }); track(remote);
      remote.setTimeout(120_000, () => remote.destroy());
      remote.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) remote.write(head); client.pipe(remote); remote.pipe(client); });
      remote.on('error', () => client.destroy()); client.on('error', () => remote.destroy()); client.on('close', () => remote.destroy());
    } catch { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  server.on('connection', track); server.on('clientError', (_, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { url: `http://${host}:${server.address().port}`, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
