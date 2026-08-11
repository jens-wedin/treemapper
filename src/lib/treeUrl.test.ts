import { describe, it, expect } from 'vitest';
import { treeUrl, switchTreeUrl, rescueUrl, PAGE_SEGMENTS } from './treeUrl';

describe('treeUrl', () => {
  it('puts the tree in front of the path', () => {
    expect(treeUrl('wedin', '/people')).toBe('/wedin/people');
    expect(treeUrl('andersson', '/person/I500001')).toBe('/andersson/person/I500001');
  });

  it('handles a root path without doubling the slash', () => {
    expect(treeUrl('wedin', '/')).toBe('/wedin');
  });

  it('accepts a path that forgot its leading slash', () => {
    expect(treeUrl('wedin', 'people')).toBe('/wedin/people');
  });
});

describe('switchTreeUrl', () => {
  it('keeps you on the same page in the other tree', () => {
    expect(switchTreeUrl('test', '/wedin/statistics', '')).toBe('/test/statistics');
  });

  it('carries a search across, because the name still means something there', () => {
    expect(switchTreeUrl('test', '/wedin/people', '?q=wedin')).toBe('/test/people?q=wedin');
  });

  it('lands a person on the people list, since ids are per-tree', () => {
    // /test/person/I500001 would be somebody else, or nobody at all.
    expect(switchTreeUrl('test', '/wedin/person/I500001', '')).toBe('/test/people');
  });

  it('lands a source on the source list for the same reason', () => {
    expect(switchTreeUrl('test', '/wedin/source/S12', '')).toBe('/test/sources');
  });

  it('lets the chart pick its own root rather than dropping you on a list', () => {
    expect(switchTreeUrl('test', '/wedin/tree/I500001', '')).toBe('/test/tree');
  });

  it('drops a search that belonged to another page', () => {
    expect(switchTreeUrl('test', '/wedin/sources', '?q=bouppteckning')).toBe('/test/sources');
  });
});

describe('rescueUrl', () => {
  it('prefixes an address that predates trees being in the path', () => {
    expect(rescueUrl('wedin', '/people')).toBe('/wedin/people');
  });

  it('swaps out a tree that no longer exists, rather than prefixing it', () => {
    // Prefixing would give /wedin/grannslakten/people, which matches no page.
    expect(rescueUrl('wedin', '/grannslakten/people')).toBe('/wedin/people');
  });

  it('sends a bare root to the tree root', () => {
    expect(rescueUrl('wedin', '/')).toBe('/wedin');
  });

  it('sends a deleted tree with no page to that tree root', () => {
    expect(rescueUrl('wedin', '/grannslakten')).toBe('/wedin');
  });

  it('treats a retired Swedish segment as a tree name, not a page', () => {
    // Clean break: /personer is no longer a page, so it reads as an unknown
    // tree and gets swapped for a real one. Landing on the home page beats
    // rendering nothing.
    expect(rescueUrl('wedin', '/personer')).toBe('/wedin');
  });
});

describe('PAGE_SEGMENTS', () => {
  it('names every first segment a tree may not be confused with', () => {
    expect([...PAGE_SEGMENTS].sort()).toEqual(
      ['issues', 'people', 'person', 'settings', 'source', 'sources', 'statistics', 'tree'],
    );
  });
});
