import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: P, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) =>
  base({ ...p }, <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" stroke="none" />);

export const IconPause = (p: P) =>
  base(
    { ...p },
    <>
      <rect x="6.5" y="4.5" width="3.6" height="15" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="13.9" y="4.5" width="3.6" height="15" rx="1.4" fill="currentColor" stroke="none" />
    </>,
  );

export const IconPrev = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M18.5 5v14L8 12l10.5-7z" fill="currentColor" stroke="none" />
      <rect x="4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>,
  );

export const IconNext = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M5.5 5v14L16 12 5.5 5z" fill="currentColor" stroke="none" />
      <rect x="17.4" y="5" width="2.6" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </>,
  );

export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) =>
  base(
    { ...p },
    <path
      d="M12 20s-7.5-4.6-7.5-9.4C4.5 7.6 6.6 5.7 9.1 5.7c1.5 0 2.5.8 2.9 1.5.4-.7 1.4-1.5 2.9-1.5 2.5 0 4.6 1.9 4.6 4.9C19.5 15.4 12 20 12 20z"
      fill={filled ? 'currentColor' : 'none'}
    />,
  );

export const IconDownload = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M12 4v10.5" />
      <path d="M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </>,
  );

export const IconSearch = (p: P) =>
  base(
    { ...p },
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>,
  );

export const IconChevronDown = (p: P) => base({ ...p }, <path d="M6 9.5l6 6 6-6" />);

export const IconBack = (p: P) => base({ ...p }, <path d="M15 5l-7 7 7 7" />);

export const IconPlus = (p: P) => base({ ...p }, <path d="M12 5v14M5 12h14" />);

export const IconTrash = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.5.4-.8.9-.8h4.2c.5 0 .9.3.9.8V7" />
      <path d="M6.5 7l.8 12.2c0 .5.4.8.9.8h7.6c.5 0 .9-.3.9-.8L17.5 7" />
    </>,
  );

export const IconLink = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M10 13.5a4 4 0 005.7 0l2.6-2.6a4 4 0 10-5.7-5.7L11.3 6.5" />
      <path d="M14 10.5a4 4 0 00-5.7 0l-2.6 2.6a4 4 0 105.7 5.7l1.3-1.3" />
    </>,
  );

export const IconMusic = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M9 18V6.5l9-2v11" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="15.5" cy="15.5" r="2.5" />
    </>,
  );

export const IconList = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </>,
  );

export const IconMore = (p: P) =>
  base(
    { ...p },
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>,
  );

export const IconMic = (p: P) =>
  base(
    { ...p },
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0013 0" />
      <path d="M12 17.5V21" />
    </>,
  );

export const IconInfo = (p: P) =>
  base(
    { ...p },
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>,
  );

export const IconSparkle = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M12 4l1.8 4.7L18.5 10.5 13.8 12.3 12 17l-1.8-4.7L5.5 10.5l4.7-1.8L12 4z" />
      <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </>,
  );

export const IconGear = (p: P) =>
  base(
    { ...p },
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14.6a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2.9a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2.9a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </>,
  );

export const IconShuffle = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M3 6h3l12 12h3" />
      <path d="M3 18h3l4-4" />
      <path d="M14 6l4-4" />
      <path d="M18 2l3 3-3 3" />
      <path d="M18 16l3 3-3 3" />
    </>,
  );

export const IconRefresh = (p: P) =>
  base(
    { ...p },
    <>
      <path d="M20 12a8 8 0 10-2.8 6.1" />
      <path d="M20 5.5V12h-6.2" />
    </>,
  );
