import { describe, it, expect } from 'vitest';
import { researchLinks, type ResearchSubject } from './researchLinks';

/** A fully-specified person; individual tests thin it out to probe missing data. */
const svenErik: ResearchSubject = {
  givenName: 'Sven-Erik',
  surname: 'Wedin',
  birthYear: 1901,
  birthPlace: 'Alnö, Västernorrland',
};

/** Find one site's link by id, failing loudly if the builder dropped it. */
function link(subject: ResearchSubject, id: string) {
  const found = researchLinks(subject).find(l => l.id === id);
  if (!found) throw new Error(`no ${id} link`);
  return new URL(found.url);
}

describe('research links for a person', () => {
  it('offers the four sites in a stable order', () => {
    expect(researchLinks(svenErik).map(l => l.id)).toEqual([
      'riksarkivet', 'arkivdigital', 'familysearch', 'google',
    ]);
  });

  it('labels each link with the site it opens', () => {
    const byId = Object.fromEntries(researchLinks(svenErik).map(l => [l.id, l.label]));
    expect(byId).toEqual({
      riksarkivet: 'Riksarkivet',
      arkivdigital: 'ArkivDigital',
      familysearch: 'FamilySearch',
      google: 'Google',
    });
  });

  it('sends the given name, surname, birth year and place to FamilySearch as separate fields', () => {
    const u = link(svenErik, 'familysearch');
    expect(u.hostname).toBe('www.familysearch.org');
    expect(u.searchParams.get('q.givenName')).toBe('Sven-Erik');
    expect(u.searchParams.get('q.surname')).toBe('Wedin');
    expect(u.searchParams.get('q.birthLikeDate.from')).toBe('1901');
    expect(u.searchParams.get('q.birthLikeDate.to')).toBe('1901');
    expect(u.searchParams.get('q.birthLikePlace')).toBe('Alnö, Västernorrland');
  });

  it('free-text searches Riksarkivet on the full name', () => {
    const u = link(svenErik, 'riksarkivet');
    expect(u.hostname).toBe('sok.riksarkivet.se');
    expect(u.pathname).toBe('/fritext');
    expect(u.searchParams.get('Sokord')).toBe('Sven-Erik Wedin');
  });

  it('reaches ArkivDigital by scoping a web search to its domain', () => {
    const u = link(svenErik, 'arkivdigital');
    expect(u.hostname).toBe('www.google.com');
    expect(u.searchParams.get('q')).toBe('site:arkivdigital.se Sven-Erik Wedin');
  });

  it('web-searches Google on name, birth place and year', () => {
    const q = link(svenErik, 'google').searchParams.get('q') ?? '';
    expect(q).toContain('Sven-Erik Wedin');
    expect(q).toContain('Alnö, Västernorrland');
    expect(q).toContain('1901');
  });

  it('searches on the maiden surname, never the married name', () => {
    // The subject carries only the maiden `surname`; a married name is not an
    // input the builder can reach, so historical records stay searchable by the
    // name they were recorded under. This test pins that the field is `surname`.
    const u = link({ ...svenErik, surname: 'Åström' }, 'familysearch');
    expect(u.searchParams.get('q.surname')).toBe('Åström');
  });

  it('drops the birth fields when the person has no recorded birth', () => {
    const subject = { ...svenErik, birthYear: null, birthPlace: null };
    const fs = link(subject, 'familysearch');
    expect(fs.searchParams.has('q.birthLikeDate.from')).toBe(false);
    expect(fs.searchParams.has('q.birthLikePlace')).toBe(false);
    expect(fs.searchParams.get('q.givenName')).toBe('Sven-Erik');

    const google = link(subject, 'google').searchParams.get('q') ?? '';
    expect(google).toBe('Sven-Erik Wedin');
  });

  it('URL-encodes names and places so the links stay valid', () => {
    // Åäö and the comma must survive the round-trip; asserting on the decoded
    // value proves the link a browser would open still carries the right text.
    const u = link({ givenName: 'Örjan', surname: 'Öberg', birthYear: 1850, birthPlace: 'Härnösand, Ångermanland' }, 'familysearch');
    expect(u.searchParams.get('q.givenName')).toBe('Örjan');
    expect(u.searchParams.get('q.birthLikePlace')).toBe('Härnösand, Ångermanland');
    // And the raw string is percent-encoded, not raw non-ASCII.
    expect(u.href).toContain('%C3%96'); // Ö
    expect(u.href).not.toContain('Ö');
  });
});
