<script lang="ts">
  import { isLiveRow } from '../../db/derive';
  import { deleteWord } from '../../db/words';
  import { href, navigate } from '../router';
  import { liveLists, liveWordRow } from '../stores';

  let { id }: { id: string } = $props();

  // null = not found / deleted; undefined = still loading
  // `id` is constant per instance: App.svelte remounts this screen per route via {#key}.
  // svelte-ignore state_referenced_locally
  const row = liveWordRow(id);
  const word = $derived($row && isLiveRow($row) ? $row : null);
  const han = $derived(word ? word.syllables.map((s) => s.char ?? '').join('') : '');
  const listNames = $derived(
    word ? ($liveLists ?? []).filter((l) => word.listIds.includes(l.id)).map((l) => l.name) : [],
  );
  const wiktionaryUrl = $derived(
    word
      ? `https://en.wiktionary.org/wiki/${encodeURIComponent((word.source?.wiktionaryTitle ?? word.word).replaceAll(' ', '_'))}#Vietnamese`
      : '',
  );

  async function remove() {
    if (!word || !confirm(`Delete “${word.word}”?`)) return;
    await deleteWord(word.id);
    navigate({ name: 'words' });
  }
</script>

{#if $row === undefined}
  <p class="muted">Loading…</p>
{:else if !word}
  <p>This word was deleted or doesn't exist. <a href={href({ name: 'words' })}>Back to words</a></p>
{:else}
  <article class="card stack">
    <h1>{word.word}</h1>

    {#if han}
      <div class="han-line">
        <span class="han big">{han}</span>
        <span class="pairs">
          {#each word.syllables as s, i (i)}
            {#if i > 0}<span class="muted">·</span>{/if}
            <span class="pair">
              {s.text}
              {#if s.char}
                {#each Array.from(s.char) as c (c)}
                  <a class="han" href={href({ name: 'char', char: c })}>{c}</a>
                {/each}
              {/if}
              {#if s.gloss}<span class="gloss muted">{s.gloss}</span>{/if}
            </span>
          {/each}
        </span>
      </div>
    {/if}

    <dl class="facts">
      {#if word.ipaHanoi}<dt>Hà Nội</dt><dd class="ipa">{word.ipaHanoi}</dd>{/if}
      {#if word.ipaSaigon}<dt>Sài Gòn</dt><dd class="ipa">{word.ipaSaigon}</dd>{/if}
      {#each word.senses as s, i (i)}<dt>{s.pos || '—'}</dt><dd>{s.meaning}</dd>{/each}
      {#if word.etymology}<dt>Etymology</dt><dd class="pre">{word.etymology}</dd>{/if}
      {#if word.notes}<dt>Notes</dt><dd class="pre">{word.notes}</dd>{/if}
      {#if listNames.length > 0}<dt>Lists</dt><dd>{listNames.join(' · ')}</dd>{/if}
    </dl>

    <div class="row actions">
      <a class="button" href={href({ name: 'edit', id: word.id })}>Edit</a>
      <a href={wiktionaryUrl} target="_blank" rel="noopener noreferrer">Open on Wiktionary ↗</a>
      <button type="button" class="danger" onclick={remove}>Delete</button>
    </div>
  </article>
{/if}

<style>
  h1 { font-size: 28px; }
  .han-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
  .big { font-size: 32px; }
  .pairs { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .pair .han { margin-left: 2px; font-size: 20px; text-decoration: none; }
  .gloss { margin-left: 2px; font-size: 13px; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; }
  .facts dt { font-size: 14px; color: var(--muted); }
  .facts dd { margin: 0; }
  .pre { white-space: pre-wrap; }
  .actions { flex-wrap: wrap; justify-content: space-between; }
</style>
