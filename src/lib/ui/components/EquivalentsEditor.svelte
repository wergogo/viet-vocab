<script lang="ts">
  import type { EquivalentDraft } from '../../db/words';
  import RegionToggles from './RegionToggles.svelte';

  // "Same word in other regions" (spec §5.2): words with the same meaning, each with the regions it's used in.
  let { equivalents = $bindable() }: { equivalents: EquivalentDraft[] } = $props();

  function add() {
    equivalents.push({ word: '', regions: [] });
  }

  function remove(i: number) {
    equivalents.splice(i, 1);
  }
</script>

<fieldset>
  <legend>Same word in other regions</legend>
  {#each equivalents as _, i (i)}
    <div class="equivalent">
      <input
        lang="vi"
        bind:value={equivalents[i].word}
        placeholder="tàu hoả"
        aria-label={`Other word ${i + 1}`}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <div class="regions">
        <RegionToggles bind:selected={equivalents[i].regions} label={`Regions of other word ${i + 1}`} />
      </div>
      <button type="button" class="danger" onclick={() => remove(i)} aria-label={`Remove other word ${i + 1}`}>✕</button>
    </div>
  {/each}
  <button type="button" onclick={add}>＋ Add another region's word</button>
</fieldset>

<style>
  .equivalent { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
  @media (max-width: 520px) {
    .equivalent { grid-template-columns: minmax(0, 1fr) auto; }
    .regions { grid-row: 2; grid-column: 1 / -1; }
  }
</style>
