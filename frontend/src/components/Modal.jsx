import { useEffect, useRef, useCallback, useId } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog wrapper for every modal in the app.
 *
 * Provides the semantics a bare overlay div cannot: dialog role and accessible
 * name, initial focus, a focus trap, Escape to dismiss, and focus restored to
 * whatever opened it. Render the modal's body as children.
 *
 * @param {object} props
 * @param {string} props.title Visible heading, also the dialog's accessible name.
 * @param {() => void} props.onClose Called on Escape and on backdrop click.
 * @param {boolean} [props.closeOnBackdrop] Set false for destructive flows where
 *   a stray click should not dismiss the dialog.
 * @param {string} [props.maxWidthClass] Tailwind width class for the panel.
 * @param {string} [props.panelClassName] Replaces the default padding/scrolling
 *   on the panel. Use for dialogs that manage their own header/body/footer
 *   layout, where scrolling the whole panel would push the buttons out of view.
 * @param {React.ReactNode} [props.header] Rendered instead of the default
 *   heading, for those same custom-layout dialogs. Must label the dialog itself.
 * @param {React.ReactNode} props.children
 */
function Modal({
  title,
  onClose,
  closeOnBackdrop = true,
  maxWidthClass = 'max-w-md',
  panelClassName = 'p-6 max-h-[90vh] overflow-y-auto',
  header,
  children,
}) {
  // `header={null}` means "I render my own header" — distinguish it from an
  // omitted prop, because `null ?? default` would fall back to the default.
  const hasCustomHeader = header !== undefined;
  const panelRef = useRef(null);
  const titleId = useId();

  // Restore focus to the trigger so keyboard users are not dropped at the top
  // of the page when the dialog closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const firstField = panelRef.current?.querySelector(FOCUSABLE);
    (firstField ?? panelRef.current)?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  // Escape is bound at the document level, not on the panel: a click on the
  // backdrop can move focus out of the panel, and Escape must still dismiss.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleKeyDown = useCallback((event) => {
    if (event.key !== 'Tab') {
      return;
    }
    // Trap Tab inside the panel so focus cannot reach the obscured page.
    const focusable = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const handleBackdropMouseDown = (event) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasCustomHeader ? undefined : titleId}
        aria-label={hasCustomHeader ? title : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`bg-white rounded-lg w-full ${maxWidthClass} ${panelClassName} focus:outline-none`}
      >
        {hasCustomHeader ? (
          header
        ) : (
          <h3 id={titleId} className="text-lg font-semibold text-gray-900 mb-3">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
