// Scripting widget — a hover/focus tooltip portaled to document.body so it
// can't be clipped by the tile's (or widget body's) overflow, unlike the
// CSS `[data-tip]::after` approach. Content is rendered as markdown.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import * as Icons from '../../Icons';
import { renderMarkdown } from './markdown';

function Bubble({
  anchor,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  anchor: HTMLElement | null;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
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
    <div className="sc-tip" style={style} role="tooltip" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
  const hideTimer = useRef<number | null>(null);

  const cancelHide = () => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = () => {
    cancelHide();
    setOpen(true);
  };
  // Close on a short delay so the cursor can travel off the trigger and onto
  // the bubble (to click a link inside it) without the tooltip vanishing in
  // the gap between them. Entering the bubble cancels the pending close.
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => cancelHide, []);

  return (
    <span
      ref={ref}
      className={className}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      {children}
      {open && content && (
        <Bubble anchor={ref.current} onMouseEnter={show} onMouseLeave={scheduleHide}>
          {renderMarkdown(content)}
        </Bubble>
      )}
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
