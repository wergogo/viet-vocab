<script lang="ts">
  import { untrack } from 'svelte';
  import { findDuplicates, searchWords } from '../../db/search';
  import { isCjkChar } from '../../text/cjk';
  import { charVariants, loadStTable, toTraditional, type StTable } from '../../text/variants';
  import { lookupChar } from '../../wiktionary/lookup';
  import type { CharInfo } from '../../wiktionary/types';
  import { wiktionaryUrl } from '../../wiktionary/urls';
  import { href } from '../router';
  import { liveWords } from '../stores';
  import ExternalLink from '../components/ExternalLink.svelte';
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
  const single = $derived(isHan && Array.from(char).length === 1);
  const otherForms = $derived(table && isHan ? charVariants(char, table).filter((v) => v !== char) : []);
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

  /** undefined while loading; null when Wiktionary has no Vietnamese entry for the character. */
  let info = $state<CharInfo | null | undefined>(undefined);
  let infoError = $state('');
  let infoRun = 0;

  async function loadInfo(refresh = false) {
    const title = wikiTitle;
    const run = ++infoRun;
    info = undefined;
    infoError = '';
    try {
      const result = await lookupChar(title, { refresh });
      if (run === infoRun) info = result;
    } catch (e) {
      if (run !== infoRun) return;
      console.error(e);
      infoError = e instanceof Error ? e.message : String(e);
    }
  }

  // Look the character up once the table has settled, so a simplified character is looked up as traditional.
  $effect(() => {
    if (single && (table || tableFailed)) untrack(() => loadInfo());
  });
</script>

<section class="stack">
  <header class="card head">
    <h1 class="han glyph">{char}</h1>
    <div class="stack meta">
      {#if info}
        {#if info.hanViet.length > 0}
          <span><span class="muted">Hán Việt</span> <span lang="vi">{info.hanViet.join(', ')}</span></span>
        {/if}
        {#if info.nom.length > 0}
          <span><span class="muted">Nôm</span> <span lang="vi">{info.nom.join(', ')}</span></span>
        {/if}
        {#if info.meanings.length > 0}<span>{info.meanings.join('; ')}</span>{/if}
      {/if}
      {#if otherForms.length > 0}
        <span class="muted">Simplified/traditional variants: <span class="han">{otherForms.join(' ')}</span></span>
      {/if}
      <ExternalLink href={wiktionaryUrl(wikiTitle)}>Open on Wiktionary</ExternalLink>
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

  {#if single}
    <h2>On Wiktionary</h2>
    {#if infoError}
      <p class="notice" role="alert">
        {infoError}
        <button type="button" onclick={() => loadInfo()}>Retry</button>
      </p>
    {:else if info === undefined}
      <p class="muted">Loading…</p>
    {:else if info === null}
      <p class="muted">Wiktionary has no Vietnamese entry for <span class="han">{wikiTitle}</span>.</p>
    {:else if info.compounds.length === 0}
      <p class="muted">Wiktionary lists no Vietnamese compounds with <span class="han">{wikiTitle}</span>.</p>
    {:else}
      <p class="muted note">✓ = saved. Tap another to add it with a lookup.</p>
      <ul class="plain-list compounds">
        {#each info.compounds as compound (compound.han + compound.word)}
          {@const saved = findDuplicates($liveWords ?? [], compound.word)[0]}
          <li>
            <a
              class="chip"
              class:on={saved !== undefined}
              href={saved ? href({ name: 'word', id: saved.id }) : href({ name: 'add', word: compound.word, lookup: true })}
            >
              {#if compound.han}<span class="han">{compound.han}</span>{/if}
              <span lang="vi">{compound.word}</span>
              {#if saved}<span aria-hidden="true">✓</span><span class="sr-only">(saved)</span>{/if}
            </a>
          </li>
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
  .compounds { flex-direction: row; flex-wrap: wrap; }
</style>
