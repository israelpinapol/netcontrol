import type { DeviceType } from "@/lib/types";

const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function DeviceIcon({ type, className = "h-5 w-5" }: { type: DeviceType; className?: string }) {
  switch (type) {
    case "phone":
      return (<svg viewBox="0 0 24 24" className={className}><rect x="7" y="2.5" width="10" height="19" rx="2.5" {...p} /><path d="M11 18h2" {...p} /></svg>);
    case "laptop":
    case "desktop":
      return (<svg viewBox="0 0 24 24" className={className}><rect x="4" y="4" width="16" height="11" rx="1.5" {...p} /><path d="M2 19h20" {...p} /></svg>);
    case "tv":
      return (<svg viewBox="0 0 24 24" className={className}><rect x="3" y="5" width="18" height="12" rx="1.5" {...p} /><path d="M8 21h8M12 17v4" {...p} /></svg>);
    case "console":
      return (<svg viewBox="0 0 24 24" className={className}><path d="M6 9h12a4 4 0 0 1 0 8c-2 0-2.5-2-4-2h-4c-1.5 0-2 2-4 2a4 4 0 0 1 0-8Z" {...p} /><path d="M8.5 12v2M7.5 13h2M15.5 12.5h.01M17 14h.01" {...p} /></svg>);
    case "tablet":
      return (<svg viewBox="0 0 24 24" className={className}><rect x="5" y="3" width="14" height="18" rx="2" {...p} /><path d="M11 18h2" {...p} /></svg>);
    default:
      return (<svg viewBox="0 0 24 24" className={className}><circle cx="12" cy="12" r="3" {...p} /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" {...p} /></svg>);
  }
}

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    down: <path d="M12 5v14M6 13l6 6 6-6" {...p} />,
    up: <path d="M12 19V5M6 11l6-6 6 6" {...p} />,
    ping: <path d="M3 12h4l2-6 4 12 2-6h6" {...p} />,
    devices: <><rect x="3" y="4" width="12" height="9" rx="1.5" {...p} /><rect x="16" y="9" width="5" height="11" rx="1.5" {...p} /></>,
    data: <><path d="M3 12a9 4 0 1 0 18 0 9 4 0 1 0-18 0" {...p} /><path d="M3 12v5c0 2.2 4 4 9 4s9-1.8 9-4v-5M3 7v5" {...p} /></>,
    shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" {...p} />,
    clock: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M12 8v4l3 2" {...p} /></>,
    bolt: <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" {...p} />,
    block: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M6 6l12 12" {...p} /></>,
    check: <path d="M4 12l5 5L20 6" {...p} />,
    pause: <path d="M9 5v14M15 5v14" {...p} />,
    wifi: <path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" {...p} />,
    alert: <><path d="M12 3 2 20h20L12 3Z" {...p} /><path d="M12 10v4M12 17h.01" {...p} /></>,
    globe: <><circle cx="12" cy="12" r="8.5" {...p} /><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17" {...p} /></>,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
  };
  return (<svg viewBox="0 0 24 24" className={className}>{paths[name] ?? paths.globe}</svg>);
}
