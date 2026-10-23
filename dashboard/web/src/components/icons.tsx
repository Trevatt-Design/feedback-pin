/** Small stroke icons (Geist-style, 16px grid, 1.5 stroke). Decorative: aria-hidden. */
import type { ReactElement } from "react";

function Svg({ children, size = 16 }: { children: ReactElement | ReactElement[]; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconSearch = () => (
  <Svg>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Svg>
);
export const IconArrowLeft = () => (
  <Svg>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Svg>
);
export const IconChevronUp = () => (
  <Svg>
    <path d="M4 10l4-4 4 4" />
  </Svg>
);
export const IconChevronDown = () => (
  <Svg>
    <path d="M4 6l4 4 4-4" />
  </Svg>
);
export const IconExternal = () => (
  <Svg>
    <path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5" />
  </Svg>
);
export const IconLink = () => (
  <Svg>
    <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" />
  </Svg>
);
export const IconCheck = () => (
  <Svg>
    <path d="M3.5 8.5l3 3 6-7" />
  </Svg>
);
export const IconImage = () => (
  <Svg>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <circle cx="6" cy="6.5" r="1" />
    <path d="M13.5 10.5L10 7.5l-5.5 5" />
  </Svg>
);
export const IconInbox = () => (
  <Svg size={20}>
    <path d="M2.5 9.5L4.5 3.5h7l2 6M2.5 9.5v3h11v-3M2.5 9.5h3l1 1.5h3l1-1.5h3" />
  </Svg>
);
export const IconClose = () => (
  <Svg>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);
export const IconMaximise = () => (
  <Svg>
    <path d="M9.5 3H13v3.5M6.5 13H3V9.5M13 3L9 7M3 13l4-4" />
  </Svg>
);
