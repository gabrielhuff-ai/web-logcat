<!--
  Theme-aware <img> for the docs site.

  Each feature is captured in both dark and light variants by
  scripts/capture-feature-screenshots.spec.ts. Markdown references
  both variants here; the component swaps which one renders based
  on VitePress's reactive `isDark` flag (toggled by the appearance
  switch in the navbar).

  Both src paths are absolute paths into `docs/public/`. We pipe
  them through `withBase()` so the rendered href stays correct
  under all deploy bases (production / staging / local dev).
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';

const props = defineProps<{
  /** Absolute path to the dark-mode PNG, e.g. `/img/features/foo.png`. */
  srcDark: string;
  /** Absolute path to the light-mode PNG, e.g. `/img/features/foo-light.png`. */
  srcLight: string;
  /** Alt text — read by both screen readers and search-result snippets. */
  alt: string;
}>();

const { isDark } = useData();
const src = computed(() => withBase(isDark.value ? props.srcDark : props.srcLight));
</script>

<template>
  <img class="theme-image" :src="src" :alt="alt" loading="lazy" />
</template>

<style scoped>
.theme-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.25rem 0;
  border-radius: 12px;
  /* Two-layer shadow + 1px hairline ring, matching the docs hero
     styling but a touch softer since these images sit inline in
     prose rather than as the page's primary visual anchor. */
  box-shadow:
    0 16px 36px -16px oklch(0.30 0.06 268 / 0.30),
    0 6px 14px -8px oklch(0.20 0.06 268 / 0.22),
    0 0 0 1px oklch(0.20 0.04 268 / 0.10);
}

/* Slightly bumped shadow on dark mode so the floating-plate effect
   doesn't disappear into the near-black surface. */
:global(.dark) .theme-image {
  box-shadow:
    0 16px 40px -16px oklch(0 0 0 / 0.55),
    0 6px 14px -8px oklch(0 0 0 / 0.45),
    0 0 0 1px oklch(0.30 0.04 268 / 0.18);
}
</style>
