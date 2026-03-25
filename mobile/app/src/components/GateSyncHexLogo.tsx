import { SvgXml } from 'react-native-svg';

const GATESYNC_HEX_LOGO_XML = `
<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
  </defs>
  <path d="M50 10 L85 30 L85 70 L50 90 L15 70 L15 30 Z" fill="url(#grad)" fill-opacity="0.1" stroke="url(#grad)" stroke-width="8" stroke-linejoin="round"/>
  <path d="M 35 45 A 20 20 0 0 1 65 45" stroke="#3B82F6" stroke-width="6" stroke-linecap="round"/>
  <path d="M 65 45 L 65 52 M 65 45 L 58 45" stroke="#3B82F6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 65 55 A 20 20 0 0 1 35 55" stroke="#06B6D4" stroke-width="6" stroke-linecap="round"/>
  <path d="M 35 55 L 35 48 M 35 55 L 42 55" stroke="#06B6D4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

export function GateSyncHexLogo({ size = 92 }: { size?: number }) {
  return <SvgXml xml={GATESYNC_HEX_LOGO_XML} width={size} height={size} />;
}
