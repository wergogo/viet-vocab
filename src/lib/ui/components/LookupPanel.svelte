<script lang="ts">
  import type { LookupResult } from '../../wiktionary/types';
  import { wiktionaryUrl } from '../../wiktionary/urls';
  import ExternalLink from './ExternalLink.svelte';

  // Presentational: WordFormScreen owns the lookup state and applies results to the draft.
  let {
    word,
    status,
    error,
    result,
    chosen,
    note,
    onlookup,
    onrefresh,
    onretry,
    onchoose,
  }: {
    word: string;
    status: 'idle' | 'loading' | 'error';
    error: string;
    result: LookupResult | null;
    chosen: number;
    /** About the characters of the applied entry (count mismatch, chữ Nôm, older reading). */
    note: string | null;
    onlookup: () => void;
    onrefresh: () => void;
    /** Repeats the failed lookup, as a refresh if it was one. */
    onretry: () => void;
    onchoose: (index: number) => void;
  } = $props();

  let lookupButton: HTMLButtonElement | undefined = $state();
  const loading = $derived(status === 'loading');

  // While loading, the buttons stay focusable (aria-disabled instead of disabled), so keyboard focus isn't lost.
  function lookUp() {
    if (!loading) onlookup();
  }

  function refresh() {
    if (!loading) onrefresh();
  }

  function retry() {
    lookupButton?.focus(); // the alert holding this button goes away
    onretry();
  }
</script>

<div class="lookup stack">
  <div class="row bar">
    <button type="button" bind:this={lookupButton} onclick={lookUp} disabled={!word.trim()} aria-disabled={loading}>
      {loading ? 'Looking up…' : 'Look up Wiktionary'}
    </button>
    {#if result}
      <button type="button" onclick={refresh} aria-disabled={loading}>Refresh</button>
    {/if}
    <p class="muted status" class:sr-only={!loading && !result} role="status">
      {#if loading}
        Looking up “{word.trim()}”…
      {:else if result?.title}
        Filled from <ExternalLink href={wiktionaryUrl(result.title)}>Wiktionary: {result.title}</ExternalLink
        >{#if result.title !== result.query}&nbsp;({result.query} → {result.title}){/if}. Check it before saving.
      {:else if result}
        “{result.query}” isn't on Wiktionary.
        {#if result.ipaHanoi || result.ipaSaigon}
          The IPA is filled in; add the rest yourself.
        {:else}
          Wiktionary couldn't make IPA for it either. Check the spelling, or fill it in yourself.
        {/if}
      {/if}
    </p>
  </div>

  {#if status === 'error'}
    <p class="notice" role="alert">
      {error}
      <button type="button" onclick={retry}>Retry</button>
    </p>
  {/if}

  {#if result && result.entries.length > 1}
    <fieldset disabled={loading}>
      <legend>Fill the form from one of these etymologies:</legend>
      {#each result.entries as entry, i (i)}
        <label class="choice">
          <input type="radio" name="lookup-entry" checked={i === chosen} onchange={() => onchoose(i)} />
          <span>
            {entry.label}{#if entry.senses[0]}<span class="muted">{' — '}{entry.senses[0].meaning}</span>{/if}
          </span>
        </label>
      {/each}
    </fieldset>
  {/if}

  <!-- Mounted while empty, so screen readers announce the note when it appears. -->
  <div role="status">{#if note}<p class="notice">{note}</p>{/if}</div>
</div>

<style>
  .lookup { gap: 8px; }
  .bar { flex-wrap: wrap; }
  .bar button[aria-disabled='true'] { opacity: 0.5; cursor: progress; }
  .status { flex: 1 1 220px; margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  .choice { display: flex; gap: 8px; align-items: baseline; }
</style>
