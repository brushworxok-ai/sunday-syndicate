import app from '../server/index.js';

export const config = {
  maxDuration: 30,
};

export default function handler(request, response) {
  const incoming = new URL(request.url, 'http://localhost');
  const routePath = String(incoming.searchParams.get('__path') ?? '').replace(/^\/+/, '');
  incoming.searchParams.delete('__path');
  const query = incoming.searchParams.toString();
  request.url = `/api/${routePath}${query ? `?${query}` : ''}`;
  return app(request, response);
}
