<script lang="ts">
  import { REGIONS, sortRegions, type Region } from '../../model/types';
  import { REGION_NAMES } from '../regions';

  // Northern, Central and Southern toggles (spec §5.1, §5.2); `selected` keeps that order. Without a `label`, the
  // surrounding fieldset names the group.
  let { selected = $bindable(), label }: { selected: Region[]; label?: string } = $props();

  function toggle(region: Region) {
    selected = selected.includes(region) ? selected.filter((r) => r !== region) : sortRegions([...selected, region]);
  }
</script>

<div class="chips" role={label ? 'group' : undefined} aria-label={label}>
  {#each REGIONS as region (region)}
    <button
      type="button"
      class="chip"
      class:on={selected.includes(region)}
      aria-pressed={selected.includes(region)}
      onclick={() => toggle(region)}>{REGION_NAMES[region]}</button
    >
  {/each}
</div>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
