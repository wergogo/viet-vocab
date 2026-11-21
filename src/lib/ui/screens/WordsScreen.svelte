<script lang="ts">
  import { searchWords, type SortMode } from '../../db/search';
  import { cjkChars, hasCjk } from '../../text/cjk';
  import { charVariants, loadStTable, type StTable } from '../../text/variants';
  import { href } from '../router';
  import { liveLists, liveWords } from '../stores';
  import WordRowItem from '../components/WordRowItem.svelte';

  let query = $state('');
  let listId = $state('');
  let sort = $state<SortMode>('newest');
  let table = $state<StTable | null>(null);

  $effect(() => {
    if (hasCjk(query) && !table) loadStTable().then((t) => (table = t));
  });

  const results = $derived.by(() => {
    const t = table;
    return searchWords($liveWords ?? [], {
      query,
      listId: listId || undefined,
      sort,
      variants: t ? (c) => charVariants(c, t) : undefined,
    });
  });
  const queryChars = $derived(cjkChars(query));
</script>

<div class="stack">
  <input
    type="search"
    bind:value={query}
    placeholder="Search Vietnamese, English or 漢字"
    aria-label="Search words"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
  />
  <div class="row">
    <select bind:value={listId} aria-label="Filter by list">
      <option value="">All words</option>
      {#each $liveLists ?? [] as list (list.id)}
        <option value={list.id}>{list.name}</option>
      {/each}
    </select>
    <select bind:value={sort} aria-label="Sort order">
      <option value="newest">Newest first</option>
      <option value="az">A–Z</option>
    </select>
  </div>

  {#if queryChars.length === 1}
    <a class="chip" href={href({ name: 'char', char: queryChars[0]! })}>
      Open character page for <span class="han">{queryChars[0]}</span>
    </a>
  {/if}

  {#if $liveWords === undefined}
    <p class="muted">Loading…</p>
  {:else if $liveWords.length === 0}
    <div class="card stack">
      <strong>No words yet.</strong>
      <p class="muted">
        Tap <a href={href({ name: 'add', word: '' })}>Add</a> to save your first word with its meaning, pronunciation,
        etymology, Chinese characters and notes.
      </p>
    </div>
  {:else if results.length === 0}
    <p class="muted">
      No matches.
      {#if query.trim() && !hasCjk(query)}
        <a href={href({ name: 'add', word: query.trim() })}>Add “{query.trim()}”</a>
      {/if}
    </p>
  {:else}
    <p class="muted count">{results.length} {results.length === 1 ? 'word' : 'words'}</p>
    <ul class="plain-list">
      {#each results as word (word.id)}
        <li><WordRowItem {word} /></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .row select { flex: 1; }
  .count { margin: 0; font-size: 14px; }
  .card p { margin: 0; }
</style>
