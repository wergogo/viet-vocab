<script lang="ts">
  import type { Syllable } from '../../model/types';

  let { syllables = $bindable() }: { syllables: Syllable[] } = $props();
</script>

{#if syllables.length > 0}
  <fieldset>
    <legend>Chinese character for each syllable <span class="muted">(optional)</span></legend>
    <div class="grid">
      {#each syllables as syllable, i (i)}
        <div class="syl">
          <span class="text">{syllable.text}</span>
          <input
            class="han"
            aria-label={`Character for ${syllable.text}`}
            bind:value={syllables[i].char}
            placeholder="字"
            maxlength="4"
            autocomplete="off"
          />
          <input
            aria-label={`Meaning of the character for ${syllable.text}`}
            bind:value={syllables[i].gloss}
            placeholder="gloss"
            autocomplete="off"
          />
        </div>
      {/each}
    </div>
  </fieldset>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
  .syl { display: flex; flex-direction: column; gap: 6px; }
  .text { font-weight: 600; text-align: center; }
  .han { font-size: 22px; text-align: center; }
</style>
