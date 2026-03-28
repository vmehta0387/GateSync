import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

interface LogoProps {
  size?: number;
}

export function Logo({ size = 100 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#3B82F6" />
          <Stop offset="1" stopColor="#06B6D4" />
        </LinearGradient>
      </Defs>
      <Path
        d="M50 10 L85 30 L85 70 L50 90 L15 70 L15 30 Z"
        fill="url(#grad)"
        fillOpacity={0.1}
        stroke="url(#grad)"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <Path
        d="M 35 45 A 20 20 0 0 1 65 45"
        stroke="#3B82F6"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Path
        d="M 65 45 L 65 52 M 65 45 L 58 45"
        stroke="#3B82F6"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 65 55 A 20 20 0 0 1 35 55"
        stroke="#06B6D4"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Path
        d="M 35 55 L 35 48 M 35 55 L 42 55"
        stroke="#06B6D4"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
