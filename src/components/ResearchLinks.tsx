import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '../lib/i18n';
import { researchLinks, type ResearchSubject } from '../lib/researchLinks';

/**
 * "Research elsewhere" — a row of buttons that open a search for this person on
 * external genealogy sites. Plain links: nothing about the person leaves the
 * app until the reader clicks, which matters for the living people in the tree.
 */
export default function ResearchLinks(subject: ResearchSubject) {
  const links = researchLinks(subject);
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">{t('person.researchElsewhere')}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map(l => (
          <li key={l.id}>
            <Button asChild variant="outline" size="sm">
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label}
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">({t('person.opensNewTab')})</span>
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
