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
    onchoose: (index: number) => void;
  } = $props();
</script>

<div class="lookup stack">
  <div class="row bar">
    <button type="button" onclick={onlookup} disabled={!word.trim() || status === 'loading'}>
      {status === 'loading' ? 'Looking up…' : 'Look up Wiktionary'}
    </button>
    {#if result && status !== 'loading'}
      <button type="button" onclick={onrefresh}>Refresh</button>
    {/if}
    <p class="muted status" role="status">
      {#if status === 'loading'}
        Looking up “{word.trim()}”…
      {:else if result?.title}
        Filled from <ExternalLink href={wiktionaryUrl(result.title)}>Wiktionary: {result.title}</ExternalLink
        >{#if result.title !== result.query}&nbsp;({result.query} → {result.title}){/if}. Check it before saving.
      {:else if result}
        “{result.query}” isn't on Wiktionary. The IPA is filled in; add the rest yourself.
      {/if}
    </p>
  </div>

  {#if status === 'error'}
    <p class="notice" role="alert">
      {error}
      <button type="button" onclick={onlookup}>Retry</button>
    </p>
  {/if}

  {#if result && result.entries.length > 1}
    <fieldset>
      <legend>This page has {result.entries.length} etymologies. Fill the form from:</legend>
      {#each result.entries as entry, i (i)}
        <label class="choice">
          <input type="radio" name="lookup-entry" checked={i === chosen} onchange={() => onchoose(i)} />
          <span>
            {entry.label}{#if entry.senses[0]}<span class="muted"> — {entry.senses[0].meaning}</span>{/if}
          </span>
        </label>
      {/each}
    </fieldset>
  {/if}

  {#if note}<p class="notice">{note}</p>{/if}
</div>

<style>
  .lookup { gap: 8px; }
  .bar { flex-wrap: wrap; }
  .status { flex: 1 1 220px; margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  .choice { display: flex; gap: 8px; align-items: baseline; }
</style>
