import React, { useState } from 'react';

/**
 * FloatingToast
 * Reusable notification pill tailored for ML-O11Y active defense events:
 * - Live blocked malicious IP notification
 * - Real-time policy synchronization / WebSocket heartbeat status
 * - Subtle hover scale, float animation, and mobile responsive hiding
 */
export const FloatingToast = ({
  position = 'top-right',
  title,
  subtitle,
  badgeText = 'MITIGATED',
  badgeColor = '#C3E88D',
  icon: Icon,
  visible = true,
  prefersReducedMotion = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const positionClasses =
    position === 'top-right'
      ? '-top-5 -right-4 md:-right-6'
      : '-bottom-5 -left-4 md:-left-6';

  const animationClass =
    prefersReducedMotion || isHovered
      ? ''
      : position === 'top-right'
      ? 'animate-float-toast-top'
      : 'animate-float-toast-bottom';

  return (
    <aside
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`hidden md:flex absolute z-20 items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-[#16181D]/95 backdrop-blur-md border border-[#2A2E37] transition-all duration-300 ease-out select-none ${positionClasses} ${animationClass} ${
        visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-95 pointer-events-none'
      } ${
        isHovered
          ? 'scale-[1.03] border-[#C792EA]/40 shadow-[0_12px_32px_rgba(0,0,0,0.85)]'
          : 'shadow-[0_8px_24px_rgba(0,0,0,0.65)]'
      }`}
    >
      {/* Icon badge */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
        style={{
          backgroundColor: `${badgeColor}15`,
          borderColor: `${badgeColor}35`,
          color: badgeColor,
        }}
      >
        {Icon ? <Icon className="w-4 h-4 stroke-[2]" /> : null}
      </div>

      {/* Content */}
      <div className="text-left font-mono pr-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-[#E6E8EB] leading-tight tracking-tight">
            {title}
          </p>
          <span
            className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider border"
            style={{
              color: badgeColor,
              backgroundColor: `${badgeColor}10`,
              borderColor: `${badgeColor}30`,
            }}
          >
            {badgeText}
          </span>
        </div>
        <p className="text-[11px] text-[#9BA1AC] leading-tight mt-0.5 whitespace-nowrap">
          {subtitle}
        </p>
      </div>
    </aside>
  );
};
