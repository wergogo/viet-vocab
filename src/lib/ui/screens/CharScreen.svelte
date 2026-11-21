<script lang="ts">
  import { searchWords } from '../../db/search';
  import { isCjkChar } from '../../text/cjk';
  import { charVariants, loadStTable, toTraditional, type StTable } from '../../text/variants';
  import { liveWords } from '../stores';
  import WordRowItem from '../components/WordRowItem.svelte';

  let { char }: { char: string } = $props();

  let table = $state<StTable | null>(null);
  let tableFailed = $state(false);
  // If the table can't load (for example offline), fall back to exact characters. Revisiting the page retries.
  loadStTable().then(
    (t) => (table = t),
    () => (tableFailed = true),
  );

  // The word card links only Han characters, but a hand-typed URL can still name anything.
  const isHan = $derived(Array.from(char).every(isCjkChar));
  const otherForms = $derived(table ? charVariants(char, table).filter((v) => v !== char) : []);
  const matches = $derived.by(() => {
    const t = table;
    if (!isHan) return [];
    if ((!t && !tableFailed) || !$liveWords) return null;
    return searchWords($liveWords, { query: char, sort: 'az', variants: t ? (c) => charVariants(c, t) : undefined });
  });
  // Wiktionary keeps Vietnamese entries on the traditional form (spec §6.4): 发 → 發.
  const wikiTitle = $derived.by(() => {
    const t = table;
    return t ? Array.from(char).map((c) => toTraditional(c, t)).join('') : char;
  });
  const wiktionaryUrl = $derived(`https://en.wiktionary.org/wiki/${encodeURIComponent(wikiTitle)}#Vietnamese`);
</script>

<section class="stack">
  <header class="card head">
    <h1 class="han glyph">{char}</h1>
    <div class="stack meta">
      {#if otherForms.length > 0}
        <span class="muted">Simplified/traditional variants: <span class="han">{otherForms.join(' ')}</span></span>
      {/if}
      <a href={wiktionaryUrl} target="_blank" rel="noopener noreferrer"
        >Open on Wiktionary <span aria-hidden="true">↗</span><span class="sr-only">(opens in a new tab)</span></a
      >
    </div>
  </header>

  <h2>In your words</h2>
  {#if !isHan}
    <p class="muted">“{char}” isn't a Chinese character, so no words are listed.</p>
  {:else if matches === null}
    <p class="muted">Loading…</p>
  {:else}
    {#if tableFailed}
      <p class="muted note">Simplified/traditional matching isn't available right now, so only exact characters match.</p>
    {/if}
    {#if matches.length === 0}
      <p class="muted">None of your saved words use <span class="han">{char}</span> yet.</p>
    {:else}
      <ul class="plain-list">
        {#each matches as word (word.id)}
          <li><WordRowItem {word} /></li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  section { overflow-wrap: anywhere; }
  .head { display: flex; align-items: center; gap: 20px; }
  .glyph { font-size: 72px; line-height: 1; font-weight: 400; }
  .meta { gap: 6px; }
  p { margin: 0; }
  .note { font-size: 14px; }
</style>
