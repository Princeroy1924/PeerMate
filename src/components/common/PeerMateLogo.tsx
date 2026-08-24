import React, { useState } from 'react';

interface PeerMateLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  showSubtitle?: boolean;
  subtitleText?: string;
  className?: string;
  badgeOnly?: boolean;
  onClick?: () => void;
}

export const PeerMateLogo: React.FC<PeerMateLogoProps> = ({
  size = 'md',
  showText = true,
  showSubtitle = true,
  subtitleText = 'English Speaking App',
  className = '',
  badgeOnly = false,
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeMap = {
    xs: {
      icon: 'w-7 h-7',
      imgSize: 28,
      text: 'text-sm',
      sub: 'text-[8.5px]',
      gap: 'gap-2',
      badgePadding: 'p-0.5',
    },
    sm: {
      icon: 'w-9 h-9',
      imgSize: 36,
      text: 'text-base',
      sub: 'text-[9.5px]',
      gap: 'gap-2.5',
      badgePadding: 'p-0.5',
    },
    md: {
      icon: 'w-11 h-11',
      imgSize: 44,
      text: 'text-lg sm:text-xl',
      sub: 'text-[10.5px]',
      gap: 'gap-3',
      badgePadding: 'p-0.5',
    },
    lg: {
      icon: 'w-14 h-14',
      imgSize: 56,
      text: 'text-2xl',
      sub: 'text-xs',
      gap: 'gap-3.5',
      badgePadding: 'p-1',
    },
    xl: {
      icon: 'w-20 h-20',
      imgSize: 80,
      text: 'text-3xl',
      sub: 'text-sm',
      gap: 'gap-4',
      badgePadding: 'p-1.5',
    },
    '2xl': {
      icon: 'w-28 h-28',
      imgSize: 112,
      text: 'text-4xl',
      sub: 'text-base',
      gap: 'gap-5',
      badgePadding: 'p-2',
    },
  };

  const { icon: iconClass, imgSize, text: textClass, sub: subClass, gap: gapClass, badgePadding } =
    sizeMap[size] || sizeMap.md;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`inline-flex items-center ${gapClass} select-none ${
        onClick ? 'cursor-pointer transition-transform hover:opacity-95 active:scale-98' : ''
      } ${className}`}
      id="peermate-brand-logo"
    >
      {/* High-Resolution Circular Emblem Badge */}
      <div
        className={`${iconClass} relative rounded-full overflow-hidden shrink-0 shadow-sm border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 ring-2 ring-[#02A298]/20 flex items-center justify-center transition-all ${badgePadding}`}
      >
        {!imgError ? (
          <img
            src="/logo.jpg"
            alt="PeerMate Logo"
            width={imgSize}
            height={imgSize}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover rounded-full aspect-square"
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#0C3859] via-[#086788] to-[#02A298] flex items-center justify-center text-white font-black text-xs shadow-inner">
            PM
          </div>
        )}
      </div>

      {/* Brand Typography */}
      {!badgeOnly && showText && (
        <div className="flex flex-col justify-center text-left">
          <div
            className={`font-black tracking-tight leading-none text-slate-900 dark:text-white flex items-center gap-0.5 ${textClass}`}
          >
            <span className="text-[#0C3859] dark:text-sky-300">PEER</span>
            <span className="text-[#02A298] dark:text-[#2dd4bf]">MATE</span>
          </div>
          {showSubtitle && (
            <span
              className={`font-extrabold tracking-wider text-slate-500 dark:text-slate-400 uppercase leading-tight mt-0.5 ${subClass}`}
            >
              {subtitleText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};


