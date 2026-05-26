"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Home, BarChart2, User } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

// ── Data ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { id: "home",      label: "Home",      icon: Home     },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "account",   label: "Account",   icon: User     },
];

// ── Spring config — mimics Figma "Bouncy 1500 ms" ────────────────────────────
//    High stiffness → snappy slide; low damping → pronounced overshoot/jiggle.

const SPRING = {
  type:      "spring" as const,
  stiffness: 420,
  damping:   18,
  mass:      0.9,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BouncyNavBar() {
  const [active, setActive] = useState<string>("home");

  return (
    // ── Outer wrapper — centres the bar on the page ──────────────────────────
    <div className="flex items-center justify-center w-full py-6">

      {/* ── Pill container ────────────────────────────────────────────────── */}
      <nav
        className="
          relative flex items-center justify-between
          gap-2 px-3 py-3
          rounded-full
          bg-blue-600
          shadow-[0_8px_32px_rgba(37,99,235,0.55)]
        "
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;

          return (
            // ── Per-icon button ──────────────────────────────────────────────
            <button
              key={id}
              id={`nav-btn-${id}`}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActive(id)}
              className="
                relative flex items-center justify-center
                w-14 h-14
                rounded-full
                cursor-pointer
                outline-none focus-visible:ring-2 focus-visible:ring-white/60
                transition-colors duration-150
              "
            >
              {/* ── Glass bubble (shared via layoutId) ──────────────────────── */}
              {isActive && (
                <motion.div
                  layoutId="glass-bubble"
                  transition={SPRING}
                  className="
                    absolute inset-0
                    rounded-full
                    bg-white/15
                    backdrop-blur-md
                    border border-white/25
                    shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.15)]
                  "
                  // Subtle pop-in scale when first mounted / on icon change
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1,    opacity: 1 }}
                />
              )}

              {/* ── Icon ────────────────────────────────────────────────────── */}
              <motion.span
                // Slight icon scale on press
                whileTap={{ scale: 0.88 }}
                className="relative z-10"
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className={`
                    transition-colors duration-200
                    ${isActive ? "text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" : "text-blue-200"}
                  `}
                />
              </motion.span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
