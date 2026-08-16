/**
 * Quick "research this person elsewhere" links for the person page.
 *
 * Pure URL-building, kept out of React so it can be tested directly. Each site
 * is one small builder; the exact query schemes were checked against the live
 * sites (2026-08) — FamilySearch and Riksarkivet accept the parameters below,
 * ArkivDigital has no public pre-fillable search, so we scope a web search to
 * its domain instead.
 *
 * The subject carries only the maiden `surname` on purpose: historical records
 * index a person under the name they were born with, so a married name is not
 * an input any builder here can reach.
 */

export interface ResearchSubject {
  givenName: string;
  surname: string;
  birthYear: number | null;
  birthPlace: string | null;
}

export interface ResearchLink {
  /** Stable key, also the React list key and the id the tests address. */
  id: 'riksarkivet' | 'arkivdigital' | 'familysearch' | 'google';
  /** The site's own name — a proper noun, the same in every language. */
  label: string;
  /** A search for this person, opened in a new tab. */
  url: string;
}

/** Given + surname, collapsed to the single string the free-text sites want. */
function fullName(s: ResearchSubject): string {
  return [s.givenName, s.surname].map(p => p.trim()).filter(Boolean).join(' ');
}

function google(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function riksarkivet(s: ResearchSubject): string {
  return `https://sok.riksarkivet.se/fritext?Sokord=${encodeURIComponent(fullName(s))}`;
}

function arkivdigital(s: ResearchSubject): string {
  // No public search takes a name in its URL, so aim a domain-scoped web search
  // at whatever of ArkivDigital's pages are indexed.
  return google(`site:arkivdigital.se ${fullName(s)}`);
}

function familysearch(s: ResearchSubject): string {
  const params = new URLSearchParams();
  if (s.givenName.trim()) params.set('q.givenName', s.givenName.trim());
  if (s.surname.trim()) params.set('q.surname', s.surname.trim());
  if (s.birthYear != null) {
    params.set('q.birthLikeDate.from', String(s.birthYear));
    params.set('q.birthLikeDate.to', String(s.birthYear));
  }
  if (s.birthPlace?.trim()) params.set('q.birthLikePlace', s.birthPlace.trim());
  return `https://www.familysearch.org/search/record/results?${params}`;
}

function googleSubject(s: ResearchSubject): string {
  const query = [fullName(s), s.birthPlace?.trim(), s.birthYear != null ? String(s.birthYear) : '']
    .filter(Boolean)
    .join(' ');
  return google(query);
}

export function researchLinks(subject: ResearchSubject): ResearchLink[] {
  return [
    { id: 'riksarkivet', label: 'Riksarkivet', url: riksarkivet(subject) },
    { id: 'arkivdigital', label: 'ArkivDigital', url: arkivdigital(subject) },
    { id: 'familysearch', label: 'FamilySearch', url: familysearch(subject) },
    { id: 'google', label: 'Google', url: googleSubject(subject) },
  ];
}
