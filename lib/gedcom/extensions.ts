/** A stable URI for an extension (underscore) tag, for a 7.0 SCHMA declaration. */
export function extensionUri(tag: string): string {
  return `https://github.com/jens-wedin/treemapper/gedcom/${tag.replace(/^_/, '')}`;
}
