// Scripting widget — a hover/focus tooltip portaled to document.body so it
// can't be clipped by the tile's (or widget body's) overflow, unlike the
// CSS `[data-tip]::after` approach. Content is rendered as markdown.

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../../Icons';
import { renderMarkdown } from './markdown';

function Bubble({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    // Centre over the anchor, clamped so the (max 240px) bubble stays on-screen.
    const left = Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130);
    setStyle({ left, top: r.top - 8 });
  }, [anchor]);
  if (!style) return null;
  return createPortal(
    <div className="sc-tip" style={style} role="tooltip">
      {children}
    </div>,
    document.body,
  );
}

export interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
  /** Make the wrapper itself focusable (for triggers with no focusable child). */
  focusable?: boolean;
}

export function Tooltip({ content, children, className, focusable }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <span
      ref={ref}
      className={className}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && content && <Bubble anchor={ref.current}>{renderMarkdown(content)}</Bubble>}
    </span>
  );
}

/** The round "ⓘ"-style info dot that reveals a control's description. */
export function InfoDot({ description }: { description: string }) {
  return (
    <Tooltip content={description} className="sc-lbl-info" focusable>
      <Icons.Hash size={9} />
    </Tooltip>
  );
}
