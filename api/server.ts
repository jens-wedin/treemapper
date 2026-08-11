import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createTreesApi, treeResolver } from './trees';
import { createApi } from './stats';
import { createPersonsApi } from './persons';
import { createMediaApi } from './media';
import { createTreeApi } from './tree';
import { createMutationsApi } from './mutations';
import { createIssuesApi } from './issues';
import { createMergeApi } from './merge';
import { createSourcesApi } from './sources';
import { createExportApi } from './export';
import { createStatisticsApi } from './statistics';

// Every request names the tree it is about (`?tree=`); the resolver opens that
// database and caches the handle. Nothing here holds "the current tree".
const tree = treeResolver();
const app = new Hono();
app.route('/', createTreesApi());
app.route('/', createApi(tree));
app.route('/', createPersonsApi(tree));
app.route('/', createMediaApi(tree));
app.route('/', createTreeApi(tree));
app.route('/', createMutationsApi(tree));
app.route('/', createIssuesApi(tree));
app.route('/', createMergeApi(tree));
app.route('/', createSourcesApi(tree));
app.route('/', createExportApi(tree));
app.route('/', createStatisticsApi(tree));

/**
 * Which database this server is actually serving. Exists so the e2e suite can
 * assert it is talking to its own copy: a browser test that quietly reaches the
 * development API edits the real family data, and the only sign is a row you
 * did not put there.
 */
app.get('/api/health', c => c.json({ db: path.resolve(process.env.WEDIN_DB ?? 'wedin.db') }));

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`API igång på http://localhost:${port}`);
