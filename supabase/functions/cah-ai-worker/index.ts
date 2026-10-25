import { createWorkerHandler } from './worker.mjs';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(createWorkerHandler({ env: (name: string) => Deno.env.get(name) }));
