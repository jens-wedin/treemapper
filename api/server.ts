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

const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: app.fetch, port });
console.log(`API igång på http://localhost:${port}`);
