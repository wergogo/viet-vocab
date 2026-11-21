<script lang="ts">
  import { searchWords, type SortMode } from '../../db/search';
  import { cjkChars, hasCjk } from '../../text/cjk';
  import { charVariants, loadStTable, type StTable } from '../../text/variants';
  import { href } from '../router';
  import { liveLists, liveWords } from '../stores';
  import WordRowItem from '../components/WordRowItem.svelte';

  /** Rows rendered per page; the count still reflects every match. */
  const PAGE = 200;

  let query = $state('');
  let listId = $state('');
  let sort = $state<SortMode>('newest');
  let table = $state<StTable | null>(null);
  let tableFailed = $state(false);
  let limit = $state(PAGE);

  // Load the simplified/traditional table the first time the query has a Han character.
  // A failed load is retried on the next keystroke (loadStTable forgets failures).
  $effect(() => {
    if (hasCjk(query) && !table) {
      loadStTable().then(
        (t) => {
          table = t;
          tableFailed = false;
        },
        () => {
          tableFailed = true;
        },
      );
    }
  });

  // A filter for a list that was deleted meanwhile falls back to all words.
  const effectiveListId = $derived(($liveLists ?? []).some((l) => l.id === listId) ? listId : '');

  const results = $derived.by(() => {
    const t = table;
    return searchWords($liveWords ?? [], {
      query,
      listId: effectiveListId || undefined,
      sort,
      variants: t ? (c) => charVariants(c, t) : undefined,
    });
  });
  const shown = $derived(results.slice(0, limit));
  const queryChars = $derived(cjkChars(query));
  const waitingForTable = $derived(queryChars.length > 0 && !table && !tableFailed);
  const statusText = $derived(
    $liveWords === undefined || waitingForTable
      ? 'Loading…'
      : $liveWords.length === 0
        ? ''
        : results.length === 0
          ? 'No matches.'
          : `${results.length} ${results.length === 1 ? 'word' : 'words'}`,
  );

  function resetLimit() {
    limit = PAGE;
  }
</script>

<div class="stack">
  <h1 class="sr-only">Words</h1>
  <input
    type="search"
    bind:value={query}
    oninput={resetLimit}
    placeholder="Search Vietnamese, English or 漢字"
    aria-label="Search words"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
  />
  <div class="row">
    <select
      value={effectiveListId}
      onchange={(e) => {
        listId = e.currentTarget.value;
        resetLimit();
      }}
      aria-label="Filter by list"
    >
      <option value="">All words</option>
      {#each $liveLists ?? [] as list (list.id)}
        <option value={list.id}>{list.name}</option>
      {/each}
    </select>
    <select bind:value={sort} onchange={resetLimit} aria-label="Sort order">
      <option value="newest">Newest first</option>
      <option value="az">A–Z</option>
    </select>
  </div>

  {#if queryChars.length === 1}
    <a class="chip" href={href({ name: 'char', char: queryChars[0]! })}>
      Open character page for <span class="han">{queryChars[0]}</span>
    </a>
  {/if}
  {#if tableFailed && queryChars.length > 0}
    <p class="muted note">Simplified/traditional matching isn't available right now, so only exact characters match.</p>
  {/if}

  <p class="muted count" role="status">{statusText}</p>

  {#if $liveWords === undefined || waitingForTable}
    <!-- the status line says Loading… -->
  {:else if $liveWords.length === 0}
    <div class="card stack">
      <strong>No words yet.</strong>
      <p class="muted">
        Tap <a href={href({ name: 'add', word: '' })}>Add</a> to save your first word with its meaning, pronunciation,
        etymology, Chinese characters and notes.
      </p>
    </div>
  {:else if results.length === 0}
    {#if query.trim() && !hasCjk(query)}
      <p><a href={href({ name: 'add', word: query.trim() })}>Add “{query.trim()}”</a></p>
    {/if}
  {:else}
    <ul class="plain-list">
      {#each shown as word (word.id)}
        <li><WordRowItem {word} /></li>
      {/each}
    </ul>
    {#if results.length > limit}
      <button type="button" onclick={() => (limit += PAGE)}>Show more ({results.length - limit} more)</button>
    {/if}
  {/if}
</div>

<style>
  .row select { flex: 1; }
  .count, .note { margin: 0; font-size: 14px; }
  .card p, p { margin: 0; }
</style>
