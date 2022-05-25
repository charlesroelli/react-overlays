import contains from 'dom-helpers/contains';
import listen from 'dom-helpers/listen';
import { useCallback, useEffect, useRef } from 'react';

import useEventCallback from '@restart/hooks/useEventCallback';
import warning from 'warning';

import ownerDocument from './ownerDocument';

const escapeKeyCode = 27;
const noop = () => {};

export type MouseEvents = {
  [K in keyof GlobalEventHandlersEventMap]: GlobalEventHandlersEventMap[K] extends MouseEvent
    ? K
    : never;
}[keyof GlobalEventHandlersEventMap];

function isLeftClickEvent(event: MouseEvent) {
  return event.button === 0;
}

function isModifiedEvent(event: MouseEvent) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

function addDocEventListeners(
  currentEvent: Event | undefined,
  doc: any,
  clickTrigger: MouseEvents,
  handleMouseCapture: (e: any) => void,
  handleMouse: (e: any) => void,
  handleKeyUp: (e: any) => void,
) {
  // Use capture for this listener so it fires before React's listener, to
  // avoid false positives in the contains() check below if the target DOM
  // element is removed in the React mouse callback.
  const removeMouseCaptureListener = listen(
    doc,
    clickTrigger,
    handleMouseCapture,
    true,
  );

  const removeMouseListener = listen(doc, clickTrigger, (e) => {
    // skip if this event is the same as the one running when we added the handlers
    if (e === currentEvent) {
      currentEvent = undefined;
      return;
    }
    handleMouse(e);
  });

  const removeKeyupListener = listen(doc, 'keyup', (e) => {
    // skip if this event is the same as the one running when we added the handlers
    if (e === currentEvent) {
      currentEvent = undefined;
      return;
    }
    handleKeyUp(e);
  });

  const thisDocumentElement = doc.ownerDocument?.documentElement || doc.documentElement;
  let mobileSafariHackListeners = [] as Array<() => void>;
  if ('ontouchstart' in thisDocumentElement) {
    mobileSafariHackListeners = [].slice
      .call(doc.children || doc.body.children)
      .map((el) => listen(el, 'mousemove', noop));
  }

  return () => {
    removeMouseCaptureListener();
    removeMouseListener();
    removeKeyupListener();
    mobileSafariHackListeners.forEach((remove) => remove());
  };
}

const getRefTarget = (
  ref: React.RefObject<Element> | Element | null | undefined,
) => ref && ('current' in ref ? ref.current : ref);

export interface RootCloseOptions {
  disabled?: boolean;
  clickTrigger?: MouseEvents;
}
/**
 * The `useRootClose` hook registers your callback on the document
 * when rendered. Powers the `<Overlay/>` component. This is used achieve modal
 * style behavior where your callback is triggered when the user tries to
 * interact with the rest of the document or hits the `esc` key.
 *
 * @param {Ref<HTMLElement>| HTMLElement} ref  The element boundary
 * @param {function} onRootClose
 * @param {object=}  options
 * @param {boolean=} options.disabled
 * @param {string=}  options.clickTrigger The DOM event name (click, mousedown, etc) to attach listeners on
 */
function useRootClose(
  ref: React.RefObject<Element> | Element | null | undefined,
  onRootClose: (e: Event) => void,
  { disabled, clickTrigger = 'click' }: RootCloseOptions = {},
) {
  const preventMouseRootCloseRef = useRef(false);
  const onClose = onRootClose || noop;

  const handleMouseCapture = useCallback(
    (e: any) => {
      const currentTarget = getRefTarget(ref);

      warning(
        !!currentTarget,
        'RootClose captured a close event but does not have a ref to compare it to. ' +
          'useRootClose(), should be passed a ref that resolves to a DOM node',
      );

      preventMouseRootCloseRef.current =
        !currentTarget ||
        isModifiedEvent(e) ||
        !isLeftClickEvent(e) ||
        !!contains(currentTarget, e.target);
    },
    [ref],
  );

  const handleMouse = useEventCallback((e: MouseEvent) => {
    if (!preventMouseRootCloseRef.current) {
      onClose(e);
    }
  });

  const handleKeyUp = useEventCallback((e: KeyboardEvent) => {
    if (e.keyCode === escapeKeyCode) {
      onClose(e);
    }
  });

  useEffect(() => {
    if (disabled || ref == null) return undefined;

    // Store the current event to avoid triggering handlers immediately
    // https://github.com/facebook/react/issues/20074
    const currentEvent = window.event;

    const refTarget = getRefTarget(ref);
    const removeDocEventListeners = addDocEventListeners(
      currentEvent,
      ownerDocument(refTarget),
      clickTrigger,
      handleMouseCapture,
      handleMouse,
      handleKeyUp,
    );
    if (refTarget && refTarget.getRootNode() instanceof ShadowRoot) {
      const removeShadowRootEventListeners = addDocEventListeners(
        currentEvent,
        refTarget.getRootNode(),
        clickTrigger,
        handleMouseCapture,
        handleMouse,
        handleKeyUp,
      );
      return () => {
        removeDocEventListeners();
        removeShadowRootEventListeners();
      };
    }
    return removeDocEventListeners;
  }, [
    ref,
    disabled,
    clickTrigger,
    handleMouseCapture,
    handleMouse,
    handleKeyUp,
  ]);
}

export default useRootClose;
