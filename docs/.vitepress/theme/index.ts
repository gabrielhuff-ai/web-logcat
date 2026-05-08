// Custom theme: extends VitePress's default theme with our brand
// CSS overrides (indigo accent, JetBrains Mono, larger hero image,
// outline icons on the landing features). The actual rules live in
// `style.css` next to this file — keeping them out of `config.ts`
// so the theme stays composable.

import DefaultTheme from 'vitepress/theme';
import './style.css';

export default DefaultTheme;
