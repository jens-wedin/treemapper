import { describe, it, expect } from 'vitest';
import { textBlocks } from './richText';

describe('textBlocks', () => {
  it('leaves plain text alone', () => {
    expect(textBlocks('Bonde i Vesby.')).toEqual(['Bonde i Vesby.']);
    expect(textBlocks('Rad ett\nRad två')).toEqual(['Rad ett\nRad två']);
  });

  it('gives nothing for an empty note', () => {
    expect(textBlocks(null)).toEqual([]);
    expect(textBlocks('')).toEqual([]);
    expect(textBlocks('   ')).toEqual([]);
  });

  it('splits paragraphs and strips the tags', () => {
    // exakt formen som kommer ur MyHeritage-exporten
    const raw = '<p>Troligen son till den bonde som enligt skattelängden kallades Erich i Wesby</p>'
      + '<p><p></p></p><p>Nämnd som Hemmansbrukare i Vesby. Han skall ha avlidit 1557.</p>';
    expect(textBlocks(raw)).toEqual([
      'Troligen son till den bonde som enligt skattelängden kallades Erich i Wesby',
      'Nämnd som Hemmansbrukare i Vesby. Han skall ha avlidit 1557.',
    ]);
  });

  it('turns br into a line break but keeps the paragraph together', () => {
    expect(textBlocks('<p>Först<br>Sedan<br/>Sist</p>')).toEqual(['Först\nSedan\nSist']);
    // the export often hangs a style attribute on its br
    expect(textBlocks('Ett<br style="font-family: Times; font-size: small;" />Två'))
      .toEqual(['Ett\nTvå']);
  });

  it('decodes text that was escaped twice over', () => {
    // large parts of the citations look like this in the export
    expect(textBlocks('Kön: Man&amp;lt;br&amp;gt;Födelse: 1942')).toEqual(['Kön: Man\nFödelse: 1942']);
    expect(textBlocks('Bj&amp;ouml;rn')).toEqual(['Björn']);
  });

  it('avkodar teckenentiteter', () => {
    expect(textBlocks('M&auml;ster Erik i &Aring;re')).toEqual(['Mäster Erik i Åre']);
    expect(textBlocks('Sk&ouml;vde&nbsp;socken')).toEqual(['Skövde socken']);
    expect(textBlocks('Bj&#246;rn och Bj&#xF6;rk')).toEqual(['Björn och Björk']);
    expect(textBlocks('Nilsson &amp; Son')).toEqual(['Nilsson & Son']);
  });

  it('treats escaped markup as markup', () => {
    // exporten skriver en del av sina egna radbrytningar som &lt;br&gt;;
    // decoded last, they would have stood on screen as text
    expect(textBlocks('Elsa Viola&lt;br&gt;Födelse: 10 jan 1919&lt;br&gt;Bjuråker'))
      .toEqual(['Elsa Viola\nFödelse: 10 jan 1919\nBjuråker']);
  });

  it('leaves angle brackets that are not markup alone', () => {
    // MyHeritage hides living people behind <Privat>, often escaped
    expect(textBlocks('Förälder: &lt;Privat&gt; Vedin')).toEqual(['Förälder: <Privat> Vedin']);
    expect(textBlocks('Far: <Privat> Hammarstedt')).toEqual(['Far: <Privat> Hammarstedt']);
    expect(textBlocks('Yrke: <okänt>')).toEqual(['Yrke: <okänt>']);
  });

  it('keeps unknown entities as they stand', () => {
    expect(textBlocks('100 &fnurgel; kronor')).toEqual(['100 &fnurgel; kronor']);
  });

  it('removes inline tags but keeps the text', () => {
    expect(textBlocks('<span style="color:red"><strong>Viktigt</strong> och <em>kursivt</em></span>'))
      .toEqual(['Viktigt och kursivt']);
    expect(textBlocks('<font face="Arial">Text</font>')).toEqual(['Text']);
  });

  it('keeps the text of links', () => {
    expect(textBlocks('Se <a href="http://exempel.se">Riksarkivet</a> för mer'))
      .toEqual(['Se Riksarkivet för mer']);
    // MyHeritage's own pseudo-tags leave the address behind as readable text
    expect(textBlocks('<linkurl>http://exempel.se</linkurl>')).toEqual(['http://exempel.se']);
  });

  it('gives list items and table cells a line each', () => {
    expect(textBlocks('<ul><li>Ett</li><li>Två</li></ul>')).toEqual(['Ett', 'Två']);
    expect(textBlocks('<table><tr><td>A</td><td>B</td></tr></table>')).toEqual(['A', 'B']);
  });

  it('leaves a lone less-than sign alone', () => {
    expect(textBlocks('Född < 1557')).toEqual(['Född < 1557']);
  });

  it('copes with a tag that is never closed', () => {
    expect(textBlocks('<p>Text som saknar slut')).toEqual(['Text som saknar slut']);
  });

  it('drar ihop utfyllnadsblanksteg', () => {
    expect(textBlocks('<p>Två      mellanslag</p>')).toEqual(['Två mellanslag']);
    expect(textBlocks('<div>\n   Indraget\n</div>')).toEqual(['Indraget']);
  });
});
