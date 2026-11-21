<script lang="ts">
  import type { Sense } from '../../model/types';

  let { senses = $bindable() }: { senses: Sense[] } = $props();

  const WORD_CLASSES = [
    'Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Numeral', 'Classifier', 'Particle', 'Preposition',
    'Conjunction', 'Interjection', 'Determiner', 'Proper noun', 'Phrase', 'Idiom', 'Prefix', 'Suffix',
  ];

  function add() {
    senses.push({ pos: '', meaning: '' });
  }

  function remove(i: number) {
    senses.splice(i, 1);
  }

  function move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= senses.length) return;
    const moved = senses.splice(i, 1);
    senses.splice(j, 0, ...moved);
  }
</script>

<fieldset>
  <legend>Meanings</legend>
  {#each senses as _, i (i)}
    <div class="sense">
      <input list="word-classes" bind:value={senses[i].pos} placeholder="Word class" aria-label="Word class" />
      <input bind:value={senses[i].meaning} placeholder="Meaning" aria-label="Meaning" />
      <div class="row tools">
        <button type="button" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move meaning up">↑</button>
        <button type="button" onclick={() => move(i, 1)} disabled={i === senses.length - 1} aria-label="Move meaning down">↓</button>
        <button type="button" class="danger" onclick={() => remove(i)} aria-label="Remove meaning">✕</button>
      </div>
    </div>
  {/each}
  <datalist id="word-classes">
    {#each WORD_CLASSES as wc (wc)}<option value={wc}></option>{/each}
  </datalist>
  <button type="button" onclick={add}>＋ Add meaning</button>
</fieldset>

<style>
  .sense { display: grid; grid-template-columns: 150px 1fr auto; gap: 8px; align-items: center; }
  .tools button { padding: 6px 10px; }
  @media (max-width: 520px) {
    .sense { grid-template-columns: 1fr; }
  }
</style>
