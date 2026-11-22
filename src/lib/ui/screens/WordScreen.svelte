<script lang="ts">
  import { deleteWord } from '../../db/words';
  import { isCjkChar } from '../../text/cjk';
  import { wiktionaryUrl } from '../../wiktionary/urls';
  import { href, navigate } from '../router';
  import { liveLists, liveWord } from '../stores';
  import AudioButton from '../components/AudioButton.svelte';
  import ExternalLink from '../components/ExternalLink.svelte';

  let { id }: { id: string } = $props();

  // null = not found / deleted; undefined = still loading
  // `id` is constant per instance: App.svelte remounts this screen per route via {#key}.
  // svelte-ignore state_referenced_locally
  const entry = liveWord(id);
  const word = $derived($entry ?? null);
  const han = $derived(word ? word.syllables.map((s) => s.char ?? '').join('') : '');
  // Glosses show even when no syllable has a character.
  const showSyllables = $derived(!!word && word.syllables.some((s) => s.char || s.gloss));
  const listNames = $derived(
    word ? ($liveLists ?? []).filter((l) => word.listIds.includes(l.id)).map((l) => l.name) : [],
  );
  // Keep in sync with the <dl> rows below, or a row that is the word's only fact won't show.
  const hasFacts = $derived(
    !!word &&
      !!(word.ipaHanoi || word.ipaSaigon || word.senses.length > 0 || word.etymology || word.notes || listNames.length > 0),
  );
  const wiktionaryHref = $derived(word ? wiktionaryUrl(word.source?.wiktionaryTitle ?? word.word) : '');

  let deleting = $state(false);
  let deleteError = $state('');

  async function remove() {
    if (!word || deleting || !confirm(`Delete “${word.word}”?`)) return;
    deleting = true;
    deleteError = '';
    try {
      await deleteWord(word.id);
      // `deleting` stays true: the live query can report the deletion before the route changes,
      // and the not-found message shouldn't flash in between.
      navigate({ name: 'words' });
    } catch (e) {
      console.error(e);
      deleteError = "Couldn't delete this word. Please try again.";
      deleting = false;
    }
  }
</script>

{#if $entry === undefined}
  <p class="muted">Loading…</p>
{:else if !word}
  {#if !deleting}
    <div class="card stack">
      <p role="alert">This word was deleted or doesn't exist.</p>
      <a href={href({ name: 'words' })}>Back to words</a>
    </div>
  {/if}
{:else}
  <article class="card stack">
    <div class="title">
      <h1>{word.word}</h1>
      <AudioButton text={word.word} audioFile={word.audioFile} />
    </div>

    {#if showSyllables}
      <div class="han-line">
        {#if han}<span class="han big">{han}</span>{/if}
        <span class="pairs">
          {#each word.syllables as s, i (i)}
            {#if i > 0}<span class="muted" aria-hidden="true">·</span>{/if}
            <span class="pair">
              {s.text}
              {#if s.char}
                {#each Array.from(s.char) as c, j (j)}
                  {#if isCjkChar(c)}
                    <a class="han char-link" href={href({ name: 'char', char: c })}>{c}</a>
                  {:else}
                    <span class="han">{c}</span>
                  {/if}
                {/each}
              {/if}
              {#if s.gloss}<span class="gloss muted">{s.gloss}</span>{/if}
            </span>
          {/each}
        </span>
      </div>
    {/if}

    {#if hasFacts}
      <dl class="facts">
        {#if word.ipaHanoi}<dt>Hà Nội</dt><dd class="ipa">{word.ipaHanoi}</dd>{/if}
        {#if word.ipaSaigon}<dt>Sài Gòn</dt><dd class="ipa">{word.ipaSaigon}</dd>{/if}
        {#each word.senses as s, i (i)}<dt>{s.pos || 'Meaning'}</dt><dd>{s.meaning}</dd>{/each}
        {#if word.etymology}<dt>Etymology</dt><dd class="pre">{word.etymology}</dd>{/if}
        {#if word.notes}<dt>Notes</dt><dd class="pre">{word.notes}</dd>{/if}
        {#if listNames.length > 0}<dt>Lists</dt><dd>{listNames.join(', ')}</dd>{/if}
      </dl>
    {/if}

    <div class="row actions">
      <a class="button" href={href({ name: 'edit', id: word.id })}>Edit</a>
      <ExternalLink href={wiktionaryHref}>Open on Wiktionary</ExternalLink>
      <button type="button" class="danger" onclick={remove} disabled={deleting}>Delete</button>
    </div>
    {#if deleteError}<p class="notice" role="alert">{deleteError}</p>{/if}
  </article>
{/if}

<style>
  .title { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  h1 { font-size: 28px; overflow-wrap: anywhere; }
  .han-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
  .big { font-size: 32px; }
  .pairs { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .pair .han { margin-left: 2px; font-size: 20px; }
  .char-link { display: inline-block; min-width: 24px; padding: 4px 2px; text-align: center; text-decoration: none; }
  .char-link:hover, .char-link:focus-visible { text-decoration: underline; }
  .gloss { margin-left: 2px; font-size: 13px; }
  .facts { display: grid; grid-template-columns: fit-content(40%) minmax(0, 1fr); gap: 6px 14px; margin: 0; }
  .facts dt { font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .pre { white-space: pre-wrap; }
  .actions { flex-wrap: wrap; justify-content: space-between; }
</style>
