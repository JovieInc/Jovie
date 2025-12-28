'use client';

export function ClaimHandleStyles() {
  return (
    <style jsx>{`
      .jv-shake {
        animation: jv-shake 150ms ease-in-out;
      }
      @keyframes jv-shake {
        0%,
        100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-2px);
        }
        50% {
          transform: translateX(2px);
        }
        75% {
          transform: translateX(-2px);
        }
      }
      .jv-available {
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.35);
        animation: jv-available-pulse 900ms ease-out 1;
      }
      @keyframes jv-available-pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
        }
        70% {
          box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
        }
      }
      /* Reduced motion: disable shake, use opacity fade instead of box-shadow pulse */
      @media (prefers-reduced-motion: reduce) {
        .jv-shake {
          animation: none;
        }
        .jv-available {
          box-shadow: none;
          animation: jv-available-fade 900ms ease-out 1;
        }
        @keyframes jv-available-fade {
          0% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 1;
          }
        }
      }
    `}</style>
  );
}
