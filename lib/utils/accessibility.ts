"use client";

import { useEffect, useCallback, useRef } from 'react';

// Keyboard navigation utilities
export const KEYBOARD_KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

// Focus management utilities
export const focusManagement = {
  // Get all focusable elements within a container
  getFocusableElements: (container: HTMLElement): HTMLElement[] => {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(', ');

    return Array.from(container.querySelectorAll(focusableSelectors));
  },

  // Focus the first focusable element
  focusFirst: (container: HTMLElement): boolean => {
    const focusableElements = focusManagement.getFocusableElements(container);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
      return true;
    }
    return false;
  },

  // Focus the last focusable element
  focusLast: (container: HTMLElement): boolean => {
    const focusableElements = focusManagement.getFocusableElements(container);
    if (focusableElements.length > 0) {
      focusableElements[focusableElements.length - 1].focus();
      return true;
    }
    return false;
  },

  // Trap focus within a container
  trapFocus: (container: HTMLElement, event: KeyboardEvent): boolean => {
    if (event.key !== KEYBOARD_KEYS.TAB) return false;

    const focusableElements = focusManagement.getFocusableElements(container);
    if (focusableElements.length === 0) return false;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab: moving backwards
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return true;
      }
    } else {
      // Tab: moving forwards
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
        return true;
      }
    }

    return false;
  },

  // Restore focus to a previously focused element
  restoreFocus: (element: HTMLElement | null): void => {
    if (element && typeof element.focus === 'function') {
      element.focus();
    }
  },
};

// ARIA utilities
export const ariaUtils = {
  // Generate unique IDs for ARIA relationships
  generateId: (prefix: string = 'aria'): string => {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },

  // Update ARIA live region
  announceToScreenReader: (message: string, priority: 'polite' | 'assertive' = 'polite'): void => {
    const existingRegion = document.getElementById('aria-live-region');

    if (existingRegion) {
      existingRegion.textContent = message;
      existingRegion.setAttribute('aria-live', priority);
    } else {
      const liveRegion = document.createElement('div');
      liveRegion.id = 'aria-live-region';
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.textContent = message;
      document.body.appendChild(liveRegion);
    }
  },

  // Set ARIA expanded state
  setExpanded: (element: HTMLElement, expanded: boolean): void => {
    element.setAttribute('aria-expanded', expanded.toString());
  },

  // Set ARIA selected state
  setSelected: (element: HTMLElement, selected: boolean): void => {
    element.setAttribute('aria-selected', selected.toString());
  },

  // Set ARIA current state
  setCurrent: (element: HTMLElement, current: 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false'): void => {
    if (current === 'false') {
      element.removeAttribute('aria-current');
    } else {
      element.setAttribute('aria-current', current);
    }
  },
};

// Keyboard navigation hooks
export const useKeyboardNavigation = (
  items: HTMLElement[] | (() => HTMLElement[]),
  options: {
    loop?: boolean;
    orientation?: 'horizontal' | 'vertical' | 'both';
    onSelect?: (index: number, element: HTMLElement) => void;
    onEscape?: () => void;
  } = {}
) => {
  const { loop = true, orientation = 'vertical', onSelect, onEscape } = options;
  const currentIndexRef = useRef(0);

  const getItems = useCallback(() => {
    return typeof items === 'function' ? items() : items;
  }, [items]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const itemList = getItems();
    if (itemList.length === 0) return;

    let handled = false;
    const currentIndex = currentIndexRef.current;

    switch (event.key) {
      case KEYBOARD_KEYS.ARROW_DOWN:
        if (orientation === 'vertical' || orientation === 'both') {
          event.preventDefault();
          const nextIndex = currentIndex + 1;
          const newIndex = loop && nextIndex >= itemList.length ? 0 : Math.min(nextIndex, itemList.length - 1);
          currentIndexRef.current = newIndex;
          itemList[newIndex].focus();
          handled = true;
        }
        break;

      case KEYBOARD_KEYS.ARROW_UP:
        if (orientation === 'vertical' || orientation === 'both') {
          event.preventDefault();
          const prevIndex = currentIndex - 1;
          const newIndex = loop && prevIndex < 0 ? itemList.length - 1 : Math.max(prevIndex, 0);
          currentIndexRef.current = newIndex;
          itemList[newIndex].focus();
          handled = true;
        }
        break;

      case KEYBOARD_KEYS.ARROW_RIGHT:
        if (orientation === 'horizontal' || orientation === 'both') {
          event.preventDefault();
          const nextIndex = currentIndex + 1;
          const newIndex = loop && nextIndex >= itemList.length ? 0 : Math.min(nextIndex, itemList.length - 1);
          currentIndexRef.current = newIndex;
          itemList[newIndex].focus();
          handled = true;
        }
        break;

      case KEYBOARD_KEYS.ARROW_LEFT:
        if (orientation === 'horizontal' || orientation === 'both') {
          event.preventDefault();
          const prevIndex = currentIndex - 1;
          const newIndex = loop && prevIndex < 0 ? itemList.length - 1 : Math.max(prevIndex, 0);
          currentIndexRef.current = newIndex;
          itemList[newIndex].focus();
          handled = true;
        }
        break;

      case KEYBOARD_KEYS.HOME:
        event.preventDefault();
        currentIndexRef.current = 0;
        itemList[0].focus();
        handled = true;
        break;

      case KEYBOARD_KEYS.END:
        event.preventDefault();
        const lastIndex = itemList.length - 1;
        currentIndexRef.current = lastIndex;
        itemList[lastIndex].focus();
        handled = true;
        break;

      case KEYBOARD_KEYS.ENTER:
      case KEYBOARD_KEYS.SPACE:
        if (onSelect) {
          event.preventDefault();
          onSelect(currentIndex, itemList[currentIndex]);
          handled = true;
        }
        break;

      case KEYBOARD_KEYS.ESCAPE:
        if (onEscape) {
          event.preventDefault();
          onEscape();
          handled = true;
        }
        break;
    }

    return handled;
  }, [getItems, loop, orientation, onSelect, onEscape]);

  return {
    handleKeyDown,
    currentIndex: currentIndexRef.current,
    setCurrentIndex: (index: number) => {
      currentIndexRef.current = index;
    },
  };
};

// Focus trap hook
export const useFocusTrap = (
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean = true
) => {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the container
    focusManagement.focusFirst(container);

    const handleKeyDown = (event: KeyboardEvent) => {
      focusManagement.trapFocus(container, event);
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the previously focused element
      if (previousFocusRef.current) {
        focusManagement.restoreFocus(previousFocusRef.current);
      }
    };
  }, [containerRef, isActive]);
};

// Roving tabindex hook for complex widgets
export const useRovingTabindex = (
  items: React.RefObject<HTMLElement>[],
  defaultIndex: number = 0
) => {
  const currentIndexRef = useRef(defaultIndex);

  const setTabindex = useCallback((index: number) => {
    items.forEach((itemRef, i) => {
      if (itemRef.current) {
        itemRef.current.setAttribute('tabindex', i === index ? '0' : '-1');
      }
    });
    currentIndexRef.current = index;
  }, [items]);

  useEffect(() => {
    // Initialize tabindex
    setTabindex(defaultIndex);
  }, [setTabindex, defaultIndex]);

  const moveToIndex = useCallback((index: number) => {
    if (index >= 0 && index < items.length && items[index].current) {
      setTabindex(index);
      items[index].current!.focus();
    }
  }, [items, setTabindex]);

  return {
    currentIndex: currentIndexRef.current,
    moveToIndex,
    setTabindex,
  };
};

// Screen reader utilities
export const screenReaderUtils = {
  // Hide content from screen readers
  hideFromScreenReader: (element: HTMLElement): void => {
    element.setAttribute('aria-hidden', 'true');
  },

  // Show content to screen readers
  showToScreenReader: (element: HTMLElement): void => {
    element.removeAttribute('aria-hidden');
  },

  // Make content accessible only to screen readers
  makeScreenReaderOnly: (element: HTMLElement): void => {
    element.className += ' sr-only';
  },

  // Describe an element for screen readers
  describe: (element: HTMLElement, description: string): string => {
    const descriptionId = ariaUtils.generateId('description');
    const descriptionElement = document.createElement('div');
    descriptionElement.id = descriptionId;
    descriptionElement.className = 'sr-only';
    descriptionElement.textContent = description;

    element.parentNode?.insertBefore(descriptionElement, element.nextSibling);
    element.setAttribute('aria-describedby', descriptionId);

    return descriptionId;
  },
};

// Reduced motion utilities
export const motionUtils = {
  // Check if user prefers reduced motion
  prefersReducedMotion: (): boolean => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  // Apply motion settings based on user preference
  respectMotionPreference: <T>(
    normalAnimation: T,
    reducedAnimation: T
  ): T => {
    return motionUtils.prefersReducedMotion() ? reducedAnimation : normalAnimation;
  },
};

// High contrast utilities
export const contrastUtils = {
  // Check if user prefers high contrast
  prefersHighContrast: (): boolean => {
    return window.matchMedia('(prefers-contrast: high)').matches;
  },

  // Apply contrast-aware styles
  respectContrastPreference: (
    normalStyles: string,
    highContrastStyles: string
  ): string => {
    return contrastUtils.prefersHighContrast() ? highContrastStyles : normalStyles;
  },
};

// Color scheme utilities
export const colorSchemeUtils = {
  // Check if user prefers dark mode
  prefersDarkMode: (): boolean => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  // Apply color scheme aware styles
  respectColorSchemePreference: (
    lightStyles: string,
    darkStyles: string
  ): string => {
    return colorSchemeUtils.prefersDarkMode() ? darkStyles : lightStyles;
  },
};

// Export comprehensive accessibility object
export const accessibility = {
  keyboard: {
    KEYS: KEYBOARD_KEYS,
    navigation: useKeyboardNavigation,
  },
  focus: {
    management: focusManagement,
    trap: useFocusTrap,
    rovingTabindex: useRovingTabindex,
  },
  aria: ariaUtils,
  screenReader: screenReaderUtils,
  motion: motionUtils,
  contrast: contrastUtils,
  colorScheme: colorSchemeUtils,
};