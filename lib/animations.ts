"use client";

import { Variants } from 'framer-motion';

// Page transition variants
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    x: -10,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    x: 10,
    scale: 0.98,
  },
};

export const pageTransition = {
  type: 'tween',
  ease: 'easeInOut',
  duration: 0.3,
};

// Sidebar navigation transitions
export const sidebarVariants: Variants = {
  expanded: {
    width: 320,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 40,
    },
  },
  collapsed: {
    width: 80,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 40,
    },
  },
};

// Card animations for dashboard
export const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  hover: {
    y: -2,
    scale: 1.02,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Loading state animations
export const loadingVariants: Variants = {
  start: {
    opacity: 0.6,
  },
  end: {
    opacity: 1,
    transition: {
      duration: 0.8,
      repeat: Infinity,
      repeatType: 'reverse',
    },
  },
};

// Modal/Dialog animations
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: -50,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    y: -50,
    transition: {
      duration: 0.2,
    },
  },
};

// Backdrop animations
export const backdropVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Staggered list animations
export const listContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Breadcrumb animations
export const breadcrumbVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -10,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: 10,
    transition: {
      duration: 0.2,
    },
  },
};

// Form validation animations
export const errorVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -10,
    height: 0,
  },
  visible: {
    opacity: 1,
    y: 0,
    height: 'auto',
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    height: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Success/notification animations
export const notificationVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 100,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    x: 100,
    scale: 0.8,
    transition: {
      duration: 0.3,
    },
  },
};

// Chat message animations
export const messageVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Navigation highlight animations
export const highlightVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Skeleton loading animations
export const skeletonVariants: Variants = {
  start: {
    backgroundPosition: '-200px 0',
  },
  end: {
    backgroundPosition: 'calc(200px + 100%) 0',
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

// Page-specific animations
export const dashboardVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

export const chatVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// Utility functions for creating custom animations
export const createSlideVariants = (direction: 'left' | 'right' | 'up' | 'down' = 'left'): Variants => {
  const slideConfig = {
    left: { x: -30 },
    right: { x: 30 },
    up: { y: -30 },
    down: { y: 30 },
  };

  return {
    hidden: {
      opacity: 0,
      ...slideConfig[direction],
    },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 25,
      },
    },
  };
};

export const createScaleVariants = (scale: number = 0.8): Variants => ({
  hidden: {
    opacity: 0,
    scale,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
});

// Presets for common use cases
export const animationPresets = {
  page: {
    variants: pageVariants,
    transition: pageTransition,
  },
  card: {
    variants: cardVariants,
    initial: 'hidden',
    animate: 'visible',
    whileHover: 'hover',
  },
  modal: {
    variants: modalVariants,
    initial: 'hidden',
    animate: 'visible',
    exit: 'exit',
  },
  list: {
    container: {
      variants: listContainerVariants,
      initial: 'hidden',
      animate: 'visible',
    },
    item: {
      variants: listItemVariants,
    },
  },
  notification: {
    variants: notificationVariants,
    initial: 'hidden',
    animate: 'visible',
    exit: 'exit',
  },
};