import { textBlocks } from '../lib/richText';

/**
 * Renders an imported note as readable paragraphs. The source may be HTML from
 * MyHeritage or plain text; either way it is shown as text, never as markup.
 */
export default function RichText({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = textBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className={className}>
      {blocks.map((block, i) => (
        <p key={i} className={`whitespace-pre-line${i ? ' mt-2' : ''}`}>{block}</p>
      ))}
    </div>
  );
}
