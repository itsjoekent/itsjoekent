/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  GIF_BUCKET: R2Bucket;
};

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		const index = Math.floor(Math.random() * 1000);
		const object = await env.GIF_BUCKET.get(`${index}.gif`);

		if (!object) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });
		const data = await object.arrayBuffer();

		return new Response(data, {
			headers: {
				'cache-control': 'max-age=0, no-cache, no-store, must-revalidate',
				'content-type': 'image/gif',
			},
		});
	},
};
