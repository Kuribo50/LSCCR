import type { CSSProperties } from "react";

function getDayTone(days: number) {
  if (days <= 30) {
    return {
      bg: "#cffce5",
      color: "#066031",
      border: "#6ef7b0",
      darkBg: "rgba(22, 101, 52, 0.22)",
      darkColor: "#BBF7D0",
      darkBorder: "rgba(134, 239, 172, 0.35)",
    };
  }

  if (days <= 90) {
    return {
      bg: "#fff6e6",
      color: "#976502",
      border: "#fdba35",
      darkBg: "rgba(180, 83, 9, 0.24)",
      darkColor: "#FDE68A",
      darkBorder: "rgba(252, 211, 77, 0.38)",
    };
  }

  if (days <= 150) {
    return {
      bg: "#fff6e6",
      color: "#ca8702",
      border: "#fdcb68",
      darkBg: "rgba(194, 65, 12, 0.26)",
      darkColor: "#FED7AA",
      darkBorder: "rgba(253, 186, 116, 0.42)",
    };
  }

  return {
    bg: "#ffe6e6",
    color: "#970502",
    border: "#fd9c9b",
    darkBg: "rgba(185, 28, 28, 0.28)",
    darkColor: "#FECACA",
    darkBorder: "rgba(252, 165, 165, 0.46)",
  };
}

export default function BadgeDias({ days }: { days: number }) {
  const tone = getDayTone(days);

  return (
    <span
      className="ccr-days-badge inline-flex min-w-[44px] items-center justify-center rounded-md border px-2 py-0.5 text-[11px] font-bold leading-tight"
      style={
        {
          "--days-bg": tone.bg,
          "--days-color": tone.color,
          "--days-border": tone.border,
          "--days-dark-bg": tone.darkBg,
          "--days-dark-color": tone.darkColor,
          "--days-dark-border": tone.darkBorder,
        } as CSSProperties
      }
      title={`${days} días`}
    >
      {days}d
    </span>
  );
}
