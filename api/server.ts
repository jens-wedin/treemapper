import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { createApi } from './stats';
import { createPersonsApi } from './persons';
import { createMediaApi } from './media';
import { createTreeApi } from './tree';

const db = createDb();
const app = new Hono();
app.route('/', createApi(db));
app.route('/', createPersonsApi(db));
app.route('/', createMediaApi(db));
app.route('/', createTreeApi(db));

serve({ fetch: app.fetch, port: 3001 });
console.log('API igång på http://localhost:3001');
