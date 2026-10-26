const PREFIX = '/boxer';
const API = `${PREFIX}/api`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API || url.pathname.startsWith(`${API}/`)) {
      return handleApi(request, env, url);
    }

    if (/\.[^/]+$/.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const shell = new URL(`${PREFIX}/`, url.origin);
    return env.ASSETS.fetch(new Request(shell, { method: 'GET', headers: request.headers }));
  },
};

async function handleApi(request, env, url) {
  if (url.pathname === `${API}/health` || url.pathname === API) {
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
    }
    return Response.json({ ok: true, project: 'boxer' });
  }
  return Response.json({ error: 'Not found' }, { status: 404 });
}
