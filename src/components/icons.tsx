import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
  "aria-hidden"?: boolean;
}

const base = "fill-none stroke-current";

export function IconDiff({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5"
      />
    </svg>
  );
}

export function IconRestore({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
      />
    </svg>
  );
}

export function IconTag({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.595.45a18.634 18.634 0 0 0 5.652-4.475 1.876 1.876 0 0 0-.45-2.594L10.455 3.659A2.25 2.25 0 0 0 9.568 3Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}

export function IconVersions({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

export function IconCheck({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      strokeWidth="2"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

export function IconChevronDown({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="2"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <polyline points="6,9 12,15 18,9" />
    </svg>
  );
}

export function IconChevronLeft({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

export function IconCog({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function IconX({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="2"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function IconArrowRight({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

export function IconSwatch({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.098 19.902a3.75 3.75 0 0 1 0-5.304l7.705-7.705a3.75 3.75 0 1 1 5.304 5.304l-7.705 7.705a3.75 3.75 0 0 1-5.304 0Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15.75h.008v.008H8.25v-.008Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 12.75h.008v.008h-.008v-.008Z" />
    </svg>
  );
}

export function IconDocumentText({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      className={cn(base, className)}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25V8.25a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 6 8.25v7.5A2.25 2.25 0 0 0 8.25 18h7.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 12.75h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 15.75h3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.5 18 16.5m0 0 3 3m-3-3v6" />
    </svg>
  );
}
