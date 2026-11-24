<script lang="ts">
  import type { Word } from '../../model/types';
  import { REGION_TAGS } from '../regions';
  import { href } from '../router';
  import RegionTags from './RegionTags.svelte';

  let { word }: { word: Word } = $props();

  const chars = $derived(word.syllables.map((s) => s.char ?? '').join(''));
  const firstMeaning = $derived(word.senses[0]?.meaning ?? '');
  const tags = $derived((word.regions ?? []).map((r) => REGION_TAGS[r]));
</script>

<a
  class="word-row"
  href={href({ name: 'word', id: word.id })}
  aria-label={[word.word, chars, ...tags, firstMeaning].filter(Boolean).join(', ')}
>
  <span class="w">{word.word}</span>
  {#if chars}<span class="han">{chars}</span>{/if}
  {#if tags.length > 0}<span class="r"><RegionTags regions={word.regions} /></span>{/if}
  {#if firstMeaning}<span class="m muted">{firstMeaning}</span>{/if}
</a>

<style>
  .word-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    column-gap: 10px;
    align-items: baseline;
    padding: 12px 14px;
    color: inherit;
    text-decoration: none;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .w { font-size: 18px; font-weight: 600; }
  .han { font-size: 18px; color: var(--muted); }
  .r { grid-column: 3; justify-self: end; }
  .m { grid-column: 1 / -1; overflow: hidden; font-size: 14px; white-space: nowrap; text-overflow: ellipsis; }
</style>
