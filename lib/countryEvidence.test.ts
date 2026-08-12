import { describe, it, expect } from 'vitest';
import { learn, inferCountry } from './countryEvidence';

const SWEDISH = ['Bjuråker, Sverige', 'Hudiksvall, Sverige', 'Voxna, Sverige'];

describe('learn', () => {
  it('learns nothing from a place that names no country', () => {
    const index = learn(['Bjuråker', 'Hudiksvall']);
    expect(inferCountry('Bjuråker', index)).toBeNull();
  });

  it('does not learn the country segment as a place name', () => {
    // Learning `Sverige -> SE` from `Bjuråker, Sverige` would be circular, and
    // would make every place ending in a country answer itself.
    const index = learn(SWEDISH);
    expect(inferCountry('Sverige', index)).toBeNull();
  });
});

describe('inferCountry, segment tier', () => {
  it('answers a bare parish the tree has already seen beside a country', () => {
    const index = learn(SWEDISH);
    expect(inferCountry('Bjuråker', index)).toMatchObject({
      code: 'SE', tier: 'segment', by: 'bjuråker', weight: 1,
    });
  });

  it('answers a deeper place by any one of its segments', () => {
    const index = learn(SWEDISH);
    expect(inferCountry('Strömbacka Roten, Bjuråker, Gävleborgs', index)).toMatchObject({
      code: 'SE', tier: 'segment', by: 'bjuråker',
    });
  });

  it('counts how often a name was taught', () => {
    const index = learn(['Bjuråker, Sverige', 'Bjuråker, Sverige', 'Bjuråker, Sverige']);
    expect(inferCountry('Bjuråker', index)!.weight).toBe(3);
  });
});

describe('inferCountry, token tier', () => {
  it('answers a place whose parish was written without a comma', () => {
    const index = learn(SWEDISH);
    expect(inferCountry('Bjuråker Strömbacka', index)).toMatchObject({
      code: 'SE', tier: 'token', by: 'bjuråker',
    });
  });

  it('ignores the register words that carry no country at all', () => {
    const index = learn(SWEDISH);
    expect(inferCountry('Från till och socken', index)).toBeNull();
  });

  it('does not learn a single letter as the name of a place', () => {
    // County codes stand as their own segment — `Umeå lfs, AC` — and in
    // brackets, `Alnö (Y)`. A lone letter is a code, not a name, and matching
    // it as a word answers any place that happens to contain a stray letter.
    // `lib/places.ts` already reads county codes against a closed set.
    const index = learn(['Umeå lfs, X, Sverige']);
    expect(inferCountry('Grand Rapids X', index)).toBeNull();
  });

  it('still learns a two-letter parish, because Ås is a real one', () => {
    const index = learn(['Ås, Sverige']);
    expect(inferCountry('Ås', index)).toMatchObject({ code: 'SE' });
  });

  it('keeps a parish whose name looks like a register word', () => {
    // `Holm` is a real parish taught 119 times in this data. Dropping it as
    // noise would lose every place that names it.
    const index = learn(['Holm, Sverige']);
    expect(inferCountry('Vike Holm', index)).toMatchObject({ code: 'SE', tier: 'token' });
  });

  it('prefers a whole segment over a loose word', () => {
    const index = learn(SWEDISH);
    expect(inferCountry('Bjuråker, Voxna Strömbacka', index)!.tier).toBe('segment');
  });
});

describe('inferCountry, the margin rule', () => {
  it('answers when one country is taught at least twice as often as the rival', () => {
    const index = learn(['Torsby, Sverige', 'Torsby, Sverige', 'Torsby, Norge']);
    const found = inferCountry('Torsby', index)!;
    expect(found.code).toBe('SE');
    expect(found.rival).toEqual({ code: 'NO', weight: 1 });
  });

  it('refuses when the two countries are too close to call', () => {
    const index = learn(['Torsby, Sverige', 'Torsby, Sverige', 'Torsby, Norge', 'Torsby, Norge']);
    expect(inferCountry('Torsby', index)).toBeNull();
  });

  it('refuses at three against two, which is a disagreement and not a majority', () => {
    const index = learn([
      'Torsby, Sverige', 'Torsby, Sverige', 'Torsby, Sverige',
      'Torsby, Norge', 'Torsby, Norge',
    ]);
    expect(inferCountry('Torsby', index)).toBeNull();
  });
});

describe('inferCountry, fuzzy tier', () => {
  it('reaches a misspelling and says which word it matched', () => {
    const index = learn(['Härnösand, Sverige']);
    expect(inferCountry('Härnösands nya kyrkogård', index)).toMatchObject({
      code: 'SE', tier: 'fuzzy', by: 'härnösand', matched: 'Härnösands',
    });
  });

  it('will not fuzzy-match a short word, where one letter is a different place', () => {
    // `Holm` and `Holm` differ from `Malm`, `Kolm`, `Holt` by a single letter.
    const index = learn(['Holm, Sverige']);
    expect(inferCountry('Malm', index)).toBeNull();
  });

  it('never matches a word that already names a country', () => {
    // Real: `Finland MIchäkkä län?????` was matched to `island` and answered
    // United States. A country name is the one word never worth guessing at.
    const index = learn(['Island, Sverige']);
    expect(inferCountry('Finland MIchäkkä län?????', index)).toBeNull();
  });

  it('is never reached when an exact word already answered', () => {
    const index = learn(['Bjuråker, Sverige', 'Härnösand, Sverige']);
    expect(inferCountry('Bjuråker Härnösands', index)!.tier).toBe('token');
  });
});

describe('inferCountry, saying nothing', () => {
  it('answers nothing for a place the tree has never met', () => {
    expect(inferCountry('Ouagadougou', learn(SWEDISH))).toBeNull();
  });

  it('answers nothing for an empty place', () => {
    expect(inferCountry('', learn(SWEDISH))).toBeNull();
  });
});
