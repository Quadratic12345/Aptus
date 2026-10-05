
"use client";

import  PaintIcon  from "@/components/ui/paint-icon";

import { useEffect, useState } from "react";

const themes = {
  default: {
    name: "Default",
    bg: "#000000",
    topbar: "#000000",
    panel: "#111111",
    panel2: "#161616",
    text: "#ffffff",
    muted: "#a8a8a8",
    border: "rgba(255,255,255,0.12)",
    accent: "#3ddc84",
  },

  rose: {
    name: "Rose",
    bg: "#f8dfe7",
    topbar: "#f8dfe7",
    panel: "#f3d2dd",
    panel2: "#edc5d2",
    text: "#711f3d",
    muted: "#9b526d",
    border: "rgba(113,31,61,0.16)",
    accent: "#c43d6b",
  },

  purple: {
    name: "Purple",
    bg: "#e9e0f4",
    topbar: "#e9e0f4",
    panel: "#ded2ed",
    panel2: "#d3c5e5",
    text: "#4b2b68",
    muted: "#76568e",
    border: "rgba(75,43,104,0.16)",
    accent: "#8754b5",
  },

  blue: {
    name: "Blue",
    bg: "#dcecf4",
    topbar: "#dcecf4",
    panel: "#cfe3ed",
    panel2: "#c1d9e5",
    text: "#17465c",
    muted: "#4f7180",
    border: "rgba(23,70,92,0.16)",
    accent: "#3180a3",
  },

  green: {
    name: "Green",
    bg: "#dcecdf",
    topbar: "#dcecdf",
    panel: "#cee2d1",
    panel2: "#c0d8c4",
    text: "#245333",
    muted: "#54755d",
    border: "rgba(36,83,51,0.16)",
    accent: "#3c8650",
  },

  peach: {
    name: "Peach",
    bg: "#f8e1d3",
    topbar: "#f8e1d3",
    panel: "#f1d3c0",
    panel2: "#e9c5b0",
    text: "#713b28",
    muted: "#99654e",
    border: "rgba(113,59,40,0.16)",
    accent: "#c56842",
  },
};

export default function ColorPalette() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] =
    useState<keyof typeof themes>("default");

  useEffect(() => {
    const saved = localStorage.getItem("aptus-theme");

    if (
      saved &&
      saved in themes
    ) {
      const theme = saved as keyof typeof themes;

      setSelected(theme);
      applyTheme(themes[theme]);
    }
  }, []);

  const applyTheme = (theme: (typeof themes)[keyof typeof themes]) => {
    const root = document.documentElement;

    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--topbar", theme.topbar);
    root.style.setProperty("--panel", theme.panel);
    root.style.setProperty("--panel-2", theme.panel2);
    root.style.setProperty("--text", theme.text);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--accent", theme.accent);
  };

  const changeTheme = (themeName: keyof typeof themes) => {
    setSelected(themeName);
    applyTheme(themes[themeName]);

    localStorage.setItem(
      "aptus-theme",
      themeName
    );

    setOpen(false);
  };

  const currentTheme = themes[selected];

    return (
      <div className="color-palette">
        <button
          type="button"
          className="color-palette-trigger"
          aria-label="Change color theme"
          onClick={() => setOpen((value) => !value)}
        >
          <PaintIcon />
        </button>

        {open && (
          <div className="color-palette-menu">
            {(
              Object.entries(themes) as [
                keyof typeof themes,
                (typeof themes)[keyof typeof themes]
              ][]
            ).map(([key, theme]) => (
              <button
                key={key}
                type="button"
                className={`color-option ${
                  selected === key ? "active" : ""
                }`}
                aria-label={theme.name}
                title={theme.name}
                onClick={() => changeTheme(key)}
              >
                <span
                  className="color-option-dot"
                  style={{
                    backgroundColor: theme.bg,
                    borderColor: theme.accent,
                  }}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
