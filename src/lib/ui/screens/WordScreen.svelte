<script lang="ts">
  import { deleteWord } from '../../db/words';
  import { wiktionaryUrl } from '../../wiktionary/urls';
  import { href, navigate } from '../router';
  import { liveWord } from '../stores';
  import ExternalLink from '../components/ExternalLink.svelte';
  import WordCard from '../components/WordCard.svelte';

  let { id }: { id: string } = $props();

  // null = not found / deleted; undefined = still loading
  // `id` is constant per instance: App.svelte remounts this screen per route via {#key}.
  // svelte-ignore state_referenced_locally
  const entry = liveWord(id);
  const word = $derived($entry ?? null);
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
    <WordCard {word} />

    <div class="row actions">
      <a class="button" href={href({ name: 'edit', id: word.id })}>Edit</a>
      <ExternalLink href={wiktionaryHref}>Open on Wiktionary</ExternalLink>
      <button type="button" class="danger" onclick={remove} disabled={deleting}>Delete</button>
    </div>
    {#if deleteError}<p class="notice" role="alert">{deleteError}</p>{/if}
  </article>
{/if}

<style>
  .actions { flex-wrap: wrap; justify-content: space-between; }
</style>
