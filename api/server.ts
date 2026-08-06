import { serve } from '@hono/node-server';
import { createDb } from '../db/client';
import { createApi } from './stats';

const app = createApi(createDb());

serve({ fetch: app.fetch, port: 3001 });
console.log('API igång på http://localhost:3001');
