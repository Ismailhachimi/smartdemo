import type { ReactNode, SVGProps } from "react";

/** Stroke icons on a 24px grid, 1.75 stroke, sized by the parent (`size-4` by default in buttons). */
function make(paths: ReactNode, displayName: string) {
  const Icon = (props: SVGProps<SVGSVGElement>) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const IconActivity = make(<path d="M3 12h4l3-8 4 16 3-8h4" />, "IconActivity");
export const IconFilm = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m10 9.5 4.5 2.5-4.5 2.5z" />
  </>,
  "IconFilm",
);
export const IconSettings = make(
  <>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </>,
  "IconSettings",
);
export const IconLogout = make(<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />, "IconLogout");
export const IconCopy = make(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </>,
  "IconCopy",
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />, "IconCheck");
export const IconLink = make(
  <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  "IconLink",
);
export const IconLock = make(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
  "IconLock",
);
export const IconBell = make(<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" />, "IconBell");
export const IconBellOff = make(
  <path d="M8.5 5.6A6 6 0 0 1 18 11v4M6 11v5l-1.5 2H17M10 20.5a2.2 2.2 0 0 0 4 0M4 4l16 16" />,
  "IconBellOff",
);
export const IconMore = make(
  <>
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
  </>,
  "IconMore",
);
export const IconTrash = make(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />, "IconTrash");
export const IconDownload = make(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, "IconDownload");
export const IconPlus = make(<path d="M12 5v14M5 12h14" />, "IconPlus");
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>,
  "IconSearch",
);
export const IconArrowLeft = make(<path d="M19 12H5M11 6l-6 6 6 6" />, "IconArrowLeft");
export const IconArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />, "IconArrowRight");
export const IconPower = make(<path d="M12 3v8M6.4 6.4a8 8 0 1 0 11.2 0" />, "IconPower");
export const IconLaptop = make(
  <>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </>,
  "IconLaptop",
);
export const IconMail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
  "IconMail",
);
export const IconX = make(<path d="M6 6l12 12M18 6 6 18" />, "IconX");
export const IconSliders = make(<path d="M4 8h9M17 8h3M4 16h3M11 16h9M15 6v4M9 14v4" />, "IconSliders");
export const IconEye = make(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
  "IconEye",
);
export const IconCalendar = make(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </>,
  "IconCalendar",
);

// ---- Player (filled glyphs read better over video) ----------------------------------------
export const IconPlay = make(<path d="M7 4.8v14.4a1 1 0 0 0 1.53.85l11.5-7.2a1 1 0 0 0 0-1.7L8.53 3.95A1 1 0 0 0 7 4.8Z" fill="currentColor" stroke="none" />, "IconPlay");
export const IconPause = make(
  <>
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" stroke="none" />
  </>,
  "IconPause",
);
export const IconVolume = make(
  <>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11" />
  </>,
  "IconVolume",
);
export const IconVolumeX = make(
  <>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </>,
  "IconVolumeX",
);
export const IconMaximize = make(<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />, "IconMaximize");
export const IconMinimize = make(<path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />, "IconMinimize");
export const IconReplay = make(<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4.5h4.5" />, "IconReplay");
