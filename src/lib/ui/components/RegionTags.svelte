<script lang="ts">
  import type { Region } from '../../model/types';
  import { REGION_TAGS } from '../regions';

  // Where a word is used (spec §5.1, §5.3, §5.5). Shows nothing for a word without regions.
  let { regions = [] }: { regions?: readonly Region[] } = $props();
</script>

{#if regions.length > 0}
  <span class="tags">
    <span class="sr-only">Regions:</span>
    {#each regions as region (region)}<span class="tag">{REGION_TAGS[region]}</span>{/each}
  </span>
{/if}

<style>
  .tags { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .tag {
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
  }
</style>
