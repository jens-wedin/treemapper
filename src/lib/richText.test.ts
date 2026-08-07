import { describe, it, expect } from 'vitest';
import { textBlocks } from './richText';

describe('textBlocks', () => {
  it('lämnar vanlig text i fred', () => {
    expect(textBlocks('Bonde i Vesby.')).toEqual(['Bonde i Vesby.']);
    expect(textBlocks('Rad ett\nRad två')).toEqual(['Rad ett\nRad två']);
  });

  it('ger tomt för tomma anteckningar', () => {
    expect(textBlocks(null)).toEqual([]);
    expect(textBlocks('')).toEqual([]);
    expect(textBlocks('   ')).toEqual([]);
  });

  it('delar upp stycken och plockar bort taggarna', () => {
    // exakt formen som kommer ur MyHeritage-exporten
    const raw = '<p>Troligen son till den bonde som enligt skattelängden kallades Erich i Wesby</p>'
      + '<p><p></p></p><p>Nämnd som Hemmansbrukare i Vesby. Han skall ha avlidit 1557.</p>';
    expect(textBlocks(raw)).toEqual([
      'Troligen son till den bonde som enligt skattelängden kallades Erich i Wesby',
      'Nämnd som Hemmansbrukare i Vesby. Han skall ha avlidit 1557.',
    ]);
  });

  it('gör radbrytning av br men håller ihop stycket', () => {
    expect(textBlocks('<p>Först<br>Sedan<br/>Sist</p>')).toEqual(['Först\nSedan\nSist']);
    // exporten hänger ofta med en style-attribut på sina br
    expect(textBlocks('Ett<br style="font-family: Times; font-size: small;" />Två'))
      .toEqual(['Ett\nTvå']);
  });

  it('avkodar text som maskerats två gånger om', () => {
    // stora delar av källhänvisningarna ser ut så här i exporten
    expect(textBlocks('Kön: Man&amp;lt;br&amp;gt;Födelse: 1942')).toEqual(['Kön: Man\nFödelse: 1942']);
    expect(textBlocks('Bj&amp;ouml;rn')).toEqual(['Björn']);
  });

  it('avkodar teckenentiteter', () => {
    expect(textBlocks('M&auml;ster Erik i &Aring;re')).toEqual(['Mäster Erik i Åre']);
    expect(textBlocks('Sk&ouml;vde&nbsp;socken')).toEqual(['Skövde socken']);
    expect(textBlocks('Bj&#246;rn och Bj&#xF6;rk')).toEqual(['Björn och Björk']);
    expect(textBlocks('Nilsson &amp; Son')).toEqual(['Nilsson & Son']);
  });

  it('behandlar maskerad markup som markup', () => {
    // exporten skriver en del av sina egna radbrytningar som &lt;br&gt;;
    // avkodade sist hade de blivit stående som text på skärmen
    expect(textBlocks('Elsa Viola&lt;br&gt;Födelse: 10 jan 1919&lt;br&gt;Bjuråker'))
      .toEqual(['Elsa Viola\nFödelse: 10 jan 1919\nBjuråker']);
  });

  it('rör inte vinkelparenteser som inte är markup', () => {
    // MyHeritage döljer levande personer bakom <Privat>, ofta maskerat
    expect(textBlocks('Förälder: &lt;Privat&gt; Vedin')).toEqual(['Förälder: <Privat> Vedin']);
    expect(textBlocks('Far: <Privat> Hammarstedt')).toEqual(['Far: <Privat> Hammarstedt']);
    expect(textBlocks('Yrke: <okänt>')).toEqual(['Yrke: <okänt>']);
  });

  it('behåller okända entiteter som de står', () => {
    expect(textBlocks('100 &fnurgel; kronor')).toEqual(['100 &fnurgel; kronor']);
  });

  it('tar bort inline-taggar men behåller texten', () => {
    expect(textBlocks('<span style="color:red"><strong>Viktigt</strong> och <em>kursivt</em></span>'))
      .toEqual(['Viktigt och kursivt']);
    expect(textBlocks('<font face="Arial">Text</font>')).toEqual(['Text']);
  });

  it('behåller länkars text', () => {
    expect(textBlocks('Se <a href="http://exempel.se">Riksarkivet</a> för mer'))
      .toEqual(['Se Riksarkivet för mer']);
    // MyHeritages egna pseudotaggar lämnar kvar adressen som läsbar text
    expect(textBlocks('<linkurl>http://exempel.se</linkurl>')).toEqual(['http://exempel.se']);
  });

  it('ger listpunkter och tabellceller var sin rad', () => {
    expect(textBlocks('<ul><li>Ett</li><li>Två</li></ul>')).toEqual(['Ett', 'Två']);
    expect(textBlocks('<table><tr><td>A</td><td>B</td></tr></table>')).toEqual(['A', 'B']);
  });

  it('rör inte ett ensamt mindre-än-tecken', () => {
    expect(textBlocks('Född < 1557')).toEqual(['Född < 1557']);
  });

  it('klarar en tagg som aldrig stängs', () => {
    expect(textBlocks('<p>Text som saknar slut')).toEqual(['Text som saknar slut']);
  });

  it('drar ihop utfyllnadsblanksteg', () => {
    expect(textBlocks('<p>Två      mellanslag</p>')).toEqual(['Två mellanslag']);
    expect(textBlocks('<div>\n   Indraget\n</div>')).toEqual(['Indraget']);
  });
});
