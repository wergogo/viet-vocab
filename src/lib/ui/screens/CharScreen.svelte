<script lang="ts">
  import { untrack } from 'svelte';
  import { findDuplicates, searchWords } from '../../db/search';
  import { isCjkChar } from '../../text/cjk';
  import { charVariants, loadStTable, toTraditional, type StTable } from '../../text/variants';
  import { LookupError } from '../../wiktionary/api';
  import { lookupChar } from '../../wiktionary/lookup';
  import type { CharInfo } from '../../wiktionary/types';
  import { wiktionaryUrl } from '../../wiktionary/urls';
  import { href } from '../router';
  import { liveWords } from '../stores';
  import ExternalLink from '../components/ExternalLink.svelte';
  import WordRowItem from '../components/WordRowItem.svelte';

  // `char` is constant per instance: App.svelte remounts this screen per route via {#key}.
  let { char }: { char: string } = $props();

  let table = $state.raw<StTable | null>(null);
  let tableFailed = $state(false);
  // If the table can't load (for example offline), fall back to exact characters. Retry in the Wiktionary section
  // loads it again where the browser retries failed module loads; most cache the failure until the page reloads.
  function loadTable() {
    tableFailed = false;
    loadStTable().then(
      (t) => (table = t),
      () => (tableFailed = true),
    );
  }
  loadTable();

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
  let info = $state.raw<CharInfo | null | undefined>(undefined);
  let infoError = $state('');
  let infoRun = 0;
  let wikiHeading: HTMLHeadingElement | undefined = $state();

  async function loadInfo() {
    const title = wikiTitle;
    const run = ++infoRun;
    info = undefined;
    infoError = '';
    try {
      const result = await lookupChar(title);
      if (run === infoRun) info = result;
    } catch (e) {
      if (run !== infoRun) return;
      console.error(e);
      // The API's offline message suggests filling in the word by hand, which fits only the add form.
      infoError =
        e instanceof LookupError && e.kind === 'offline'
          ? "You're offline. Readings and compounds from Wiktionary need a connection."
          : e instanceof Error
            ? e.message
            : String(e);
    }
  }

  function retry() {
    wikiHeading?.focus({ preventScroll: true }); // the alert holding Retry goes away
    if (tableFailed) {
      // Without the table a simplified character would be looked up as itself (国, not 國). The effect below looks the
      // character up once the table settles.
      info = undefined;
      infoError = '';
      loadTable();
    } else {
      void loadInfo();
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
        <span class="muted">
          Simplified/traditional variants:
          {#each otherForms as form, i (i)}
            <a class="han variant" href={href({ name: 'char', char: form })}>{form}</a>
          {/each}
        </span>
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
    <h2 tabindex="-1" bind:this={wikiHeading}>On Wiktionary</h2>
    {#if infoError}
      <p class="notice" role="alert">
        {infoError}
        <button type="button" onclick={retry}>Retry</button>
      </p>
    {:else if info === undefined}
      <p class="muted">Loading…</p>
    {:else if info === null}
      <p class="muted">Wiktionary has no Vietnamese entry for <span class="han">{wikiTitle}</span>.</p>
    {:else if info.compounds.length === 0}
      <p class="muted">Wiktionary lists no Vietnamese compounds with <span class="han">{wikiTitle}</span>.</p>
    {:else}
      <p class="muted note">✓ marks words you've saved (tap to open); tap any other to add it with a lookup.</p>
      <ul class="plain-list compounds">
        <!-- Keyed by position: han + word isn't guaranteed to be unique. -->
        {#each info.compounds as compound, i (i)}
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
  .variant { display: inline-block; min-width: 24px; min-height: 24px; text-align: center; }
</style>
