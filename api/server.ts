import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { createApi } from './stats';
import { createPersonsApi } from './persons';
import { createMediaApi } from './media';
import { createTreeApi } from './tree';
import { createMutationsApi } from './mutations';

const db = createDb();
const app = new Hono();
app.route('/', createApi(db));
app.route('/', createPersonsApi(db));
app.route('/', createMediaApi(db));
app.route('/', createTreeApi(db));
app.route('/', createMutationsApi(db));

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`API igång på http://localhost:${port}`);
