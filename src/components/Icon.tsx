import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme';

export type IconName =
  | 'drop'
  | 'history'
  | 'settings'
  | 'nfc'
  | 'bell'
  | 'check'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'chevron'
  | 'user'
  | 'target'
  | 'glass'
  | 'info'
  | 'shortcut'
  | 'sparkle';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Tiny dependency-free icon set (stroke icons on a 24×24 grid). */
export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.9 }: Props) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'drop' && <Path {...p} d="M12 3.2c3.4 4.1 6 7.4 6 10.7a6 6 0 0 1-12 0c0-3.3 2.6-6.6 6-10.7Z" />}
      {name === 'history' && (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Path {...p} d="M12 7.5V12l3 2" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path {...p} d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <Circle {...p} cx={16} cy={7} r={2} />
          <Circle {...p} cx={10} cy={17} r={2} />
        </>
      )}
      {name === 'nfc' && (
        <>
          <Path {...p} d="M8.5 8.5a5 5 0 0 1 0 7" />
          <Path {...p} d="M11.5 6a8.5 8.5 0 0 1 0 12" />
          <Path {...p} d="M14.5 3.5a12 12 0 0 1 0 17" />
          <Circle cx={5.5} cy={12} r={1.4} fill={color} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path {...p} d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
          <Path {...p} d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </>
      )}
      {name === 'check' && <Path {...p} d="m5 12.5 4.2 4.2L19 7" />}
      {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === 'minus' && <Path {...p} d="M5 12h14" />}
      {name === 'trash' && <Path {...p} d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />}
      {name === 'chevron' && <Path {...p} d="m9.5 6 6 6-6 6" />}
      {name === 'user' && (
        <>
          <Circle {...p} cx={12} cy={8.5} r={3.5} />
          <Path {...p} d="M5 19.5a7 7 0 0 1 14 0" />
        </>
      )}
      {name === 'target' && (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Circle {...p} cx={12} cy={12} r={4.5} />
          <Circle cx={12} cy={12} r={1.3} fill={color} />
        </>
      )}
      {name === 'glass' && (
        <>
          <Path {...p} d="M6 4h12l-1.6 15.2a1 1 0 0 1-1 .8H8.6a1 1 0 0 1-1-.8L6 4Z" />
          <Path {...p} d="M6.6 9.5c2 1 3.8 1 5.4 0s3.4-1 5.4 0" />
        </>
      )}
      {name === 'info' && (
        <>
          <Circle {...p} cx={12} cy={12} r={8.5} />
          <Path {...p} d="M12 11v5M12 8h.01" />
        </>
      )}
      {name === 'shortcut' && (
        <>
          <Path {...p} d="M8 4h8l4 4v8l-4 4H8l-4-4V8l4-4Z" />
          <Path {...p} d="M10 9.5 14.5 12 10 14.5" />
        </>
      )}
      {name === 'sparkle' && (
        <Path {...p} d="M12 3.5 13.8 10l6.7 2-6.7 2-1.8 6.5-1.8-6.5-6.7-2 6.7-2L12 3.5Z" />
      )}
    </Svg>
  );
}
