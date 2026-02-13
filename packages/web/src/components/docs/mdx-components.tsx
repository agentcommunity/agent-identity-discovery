import type { ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';
import { Callout } from './callout';

/** Detect whether a URL is internal (starts with / or #). */
function isInternalHref(href: string | undefined): boolean {
  if (!href) return false;
  return href.startsWith('/') || href.startsWith('#');
}

function MdxLink({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  // Heading anchor links (from rehype-autolink-headings) should not have underline
  const isHeadingAnchor = typeof href === 'string' && href.startsWith('#');
  const linkClass = isHeadingAnchor
    ? 'no-underline text-inherit hover:text-foreground transition-colors'
    : 'font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground transition-colors';

  if (isInternalHref(href)) {
    return (
      <Link href={href ?? '#'} className={linkClass}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass} {...props}>
      {children}
    </a>
  );
}

function MdxTable({ children, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  );
}

function MdxThead({ children, ...props }: ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  );
}

function MdxTh({ children, ...props }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th className="px-4 py-2 text-left font-semibold text-foreground" {...props}>
      {children}
    </th>
  );
}

function MdxTd({ children, ...props }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td className="px-4 py-2 text-muted-foreground border-t border-border" {...props}>
      {children}
    </td>
  );
}

function MdxBlockquote({ children, ...props }: ComponentPropsWithoutRef<'blockquote'>) {
  return (
    <blockquote
      className="my-4 border-l-4 border-border pl-4 text-muted-foreground italic"
      {...props}
    >
      {children}
    </blockquote>
  );
}

function MdxHr(props: ComponentPropsWithoutRef<'hr'>) {
  return <hr className="my-8 border-border" {...props} />;
}

function MdxUl({ children, ...props }: ComponentPropsWithoutRef<'ul'>) {
  return (
    <ul className="my-4 ml-6 list-disc space-y-1.5 text-muted-foreground" {...props}>
      {children}
    </ul>
  );
}

function MdxOl({ children, ...props }: ComponentPropsWithoutRef<'ol'>) {
  return (
    <ol className="my-4 ml-6 list-decimal space-y-1.5 text-muted-foreground" {...props}>
      {children}
    </ol>
  );
}

function MdxP({ children, ...props }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p className="my-4 leading-7 text-muted-foreground" {...props}>
      {children}
    </p>
  );
}

function MdxH1({ children, ...props }: ComponentPropsWithoutRef<'h1'>) {
  return (
    <h1 className="mt-8 mb-4 text-3xl font-bold tracking-tight text-foreground" {...props}>
      {children}
    </h1>
  );
}

function MdxH2({ children, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2
      className="mt-12 mb-4 text-2xl font-semibold tracking-tight text-foreground pt-2"
      {...props}
    >
      {children}
    </h2>
  );
}

function MdxH3({ children, ...props }: ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3 className="mt-8 mb-3 text-xl font-semibold tracking-tight text-foreground" {...props}>
      {children}
    </h3>
  );
}

function MdxH4({ children, ...props }: ComponentPropsWithoutRef<'h4'>) {
  return (
    <h4 className="mt-6 mb-3 text-lg font-semibold text-foreground" {...props}>
      {children}
    </h4>
  );
}

function MdxH5({ children, ...props }: ComponentPropsWithoutRef<'h5'>) {
  return (
    <h5 className="mt-4 mb-2 text-base font-semibold text-foreground" {...props}>
      {children}
    </h5>
  );
}

function MdxH6({ children, ...props }: ComponentPropsWithoutRef<'h6'>) {
  return (
    <h6 className="mt-4 mb-2 text-sm font-semibold text-foreground" {...props}>
      {children}
    </h6>
  );
}

function MdxPre({ children, ...props }: ComponentPropsWithoutRef<'pre'>) {
  return (
    <pre
      className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm"
      {...props}
    >
      {children}
    </pre>
  );
}

type CalloutType = 'tip' | 'info' | 'warning' | 'note' | 'user' | 'agent';

function MdxDiv({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  if (typeof className === 'string' && className.includes('callout')) {
    const typeMatch = className.match(/callout-(tip|info|warning|note|user|agent)/);
    const type: CalloutType = typeMatch ? (typeMatch[1] as CalloutType) : 'note';
    const dataTitle = (props as Record<string, unknown>)['data-title'];
    const title = typeof dataTitle === 'string' ? dataTitle : undefined;
    return (
      <Callout type={type} title={title}>
        {children}
      </Callout>
    );
  }
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

function MdxStrong({ children, ...props }: ComponentPropsWithoutRef<'strong'>) {
  return (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  );
}

/**
 * Custom MDX component overrides for docs rendering.
 * Maps standard HTML elements to styled components.
 */
export const mdxComponents = {
  a: MdxLink,
  table: MdxTable,
  thead: MdxThead,
  th: MdxTh,
  td: MdxTd,
  blockquote: MdxBlockquote,
  hr: MdxHr,
  ul: MdxUl,
  ol: MdxOl,
  p: MdxP,
  h1: MdxH1,
  h2: MdxH2,
  h3: MdxH3,
  h4: MdxH4,
  h5: MdxH5,
  h6: MdxH6,
  pre: MdxPre,
  div: MdxDiv,
  strong: MdxStrong,
};
