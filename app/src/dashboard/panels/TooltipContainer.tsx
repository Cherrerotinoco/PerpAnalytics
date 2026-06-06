import type { ReactNode } from 'react';

interface TooltipContainerProps {
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  children: ReactNode;
}

/**
 * Shared wrapper for all recharts custom tooltips.
 * Provides consistent background, border, padding and font size.
 */
const TooltipContainer = ({
  surfaceColor,
  borderColor,
  textColor,
  children,
}: TooltipContainerProps) => (
  <div
    style={{
      background: surfaceColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 5,
      fontSize: '0.72rem',
      padding: '0.4rem 0.6rem',
      color: textColor,
    }}
  >
    {children}
  </div>
);

export default TooltipContainer;
