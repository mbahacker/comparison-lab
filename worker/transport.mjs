import { WorkerError } from './protocol.mjs';

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET']);

// Used only around trusted service fetches. A page/capture error must never enter
// this classifier. Caller cancellation is deliberate and must not become retryable.
export async function trustedTransport(operation, { code, signal } = {}) {
  try { return await operation(); } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    if (error instanceof WorkerError) throw error;
    const transportCode = error?.cause?.code || error?.code;
    if (error?.name === 'TimeoutError' || TRANSIENT_CODES.has(transportCode)) {
      throw new WorkerError(code || 'transport_failed', 'Trusted service connection timed out or was interrupted', true);
    }
    throw error;
  }
}
