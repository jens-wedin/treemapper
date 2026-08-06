/**
 * Swedish labels for GEDCOM event tags, used in server-generated issue texts.
 * The UI has its own copy in src/lib/i18n.ts (eventLabel) — keep them in sync.
 */
const LABELS: Record<string, string> = {
  BIRT: 'Födelse', CHR: 'Dop', BAPM: 'Dop', DEAT: 'Död', BURI: 'Begravning',
  CREM: 'Kremering', MARR: 'Vigsel', DIV: 'Skilsmässa', ENGA: 'Förlovning',
  ANUL: 'Annullering', MARB: 'Lysning', RESI: 'Bosatt', OCCU: 'Yrke',
  EDUC: 'Utbildning', GRAD: 'Examen', EMIG: 'Emigration', IMMI: 'Immigration',
  NATU: 'Medborgarskap', CONF: 'Konfirmation', EVEN: 'Händelse', ADOP: 'Adoption',
  RETI: 'Pension', CENS: 'Folkräkning', PROB: 'Bouppteckning', WILL: 'Testamente',
  BLES: 'Välsignelse', NMR: 'Ogift',
};

export const eventLabelSv = (type: string): string => LABELS[type] ?? type;
