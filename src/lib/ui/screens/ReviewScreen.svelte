<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { autoplay, chosenVoice, pronounce } from '../../audio/audio';
  import { saveReview } from '../../db/cards';
  import type { ReviewCard } from '../../model/types';
  import { formatDueIn } from '../../review/format';
  import { RATINGS, type Grade } from '../../review/fsrs';
  import { buildQueue, LEARN_AHEAD_MS, type Queue, type QueueItem } from '../../review/queue';
  import { ReviewSession } from '../../review/session.svelte';
  import { holdSync } from '../../sync/sync';
  import { href } from '../router';
  import { liveCards, liveLists, liveSettings, liveWords } from '../stores';
  import AudioButton from '../components/AudioButton.svelte';
  import WordCard from '../components/WordCard.svelte';

  // `listId` is constant per instance: App.svelte remounts this screen per route via {#key}.
  let { listId }: { listId?: string } = $props();

  // svelte-ignore state_referenced_locally
  let scope = $state(listId ?? '');
  // A list deleted meanwhile falls back to all words, like the Words screen's filter.
  const scopeId = $derived(($liveLists ?? []).some((l) => l.id === scope) ? scope : '');

  let now = $state(new Date());
  let answerButton: HTMLButtonElement | undefined = $state();
  let answer: HTMLElement | undefined = $state();

  const session: ReviewSession = new ReviewSession({
    // The queue below is built over the session's cards, so its first item is the next card.
    next: (): QueueItem | null => {
      now = new Date();
      return queue?.items[0] ?? null;
    },
    save: saveReview,
    // Called from a tap or key press, so phones allow the sound (spec §5.6 autoplay; Android needs a user gesture).
    pronounce: (item) => void pronounce(item.word.word, item.word.audioFile, $chosenVoice),
    autoplay: () => $autoplay,
    now: () => new Date(),
    holdSync,
  });
  onDestroy(() => session.stop());

  // While reviewing, the session's own copy, so a rating's background save doesn't build the queue again.
  const cards: ReviewCard[] | undefined = $derived(session.cards ?? $liveCards);
  const queue: Queue | null = $derived(
    $liveWords && $liveLists && cards && $liveSettings
      ? buildQueue({ words: $liveWords, cards, settings: $liveSettings, now, listId: scopeId || undefined })
      : null,
  );

  // Cards stored meanwhile, by a sync or another tab, join the session's copy (M4 decision 12).
  $effect(() => {
    const stored = $liveCards;
    if (stored) untrack(() => session.mergeStored(stored));
  });

  // Cards come due as time passes; keep the counts on the start and end screens current.
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(timer);
  });

  function focusSoon(target: () => HTMLElement | undefined) {
    void tick().then(() => target()?.focus({ preventScroll: true }));
  }

  function start() {
    if (!$liveCards) return;
    session.start($liveCards);
    if (session.phase === 'card') focusSoon(() => answerButton);
  }

  function reveal() {
    if (session.revealed) return;
    session.reveal();
    if (session.revealed) focusSoon(() => answer);
  }

  function rateCurrent(grade: Grade) {
    session.rate(grade);
    if (session.phase === 'card') focusSoon(() => answerButton);
  }

  // Desktop keys (spec §5.5): Space shows the answer, 1–4 rate it.
  function onKey(e: KeyboardEvent) {
    if (session.phase !== 'card' || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if ((e.target as HTMLElement | null)?.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (!session.revealed && e.key === ' ') {
      e.preventDefault();
      reveal();
    } else if (session.revealed && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      rateCurrent(RATINGS[Number(e.key) - 1]!.grade);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="stack">
  <h1 class:sr-only={session.phase === 'card'}>Review</h1>

  {#if !queue}
    <p class="muted">Loading…</p>
  {:else if session.phase === 'start'}
    <div class="card stack">
      <label class="field">
        <span>Words to review</span>
        <select value={scopeId} onchange={(e) => (scope = e.currentTarget.value)}>
          <option value="">All words</option>
          {#each $liveLists ?? [] as list (list.id)}
            <option value={list.id}>{list.name}</option>
          {/each}
        </select>
      </label>
      {#if ($liveWords ?? []).length === 0}
        <p>No words yet. <a href={href({ name: 'add', word: '' })}>Add a word</a> to start reviewing.</p>
      {:else if queue.items.length === 0}
        <p>
          Nothing to review right now.{#if queue.nextDue}
            The next card is due {formatDueIn(queue.nextDue, now)}.{/if}
        </p>
        {#if queue.newLater > 0}
          <p class="muted">
            {queue.newLater} new {queue.newLater === 1 ? 'card waits' : 'cards wait'} for tomorrow. You can change
            <a href={href({ name: 'settings' })}>New cards per day</a> in Settings.
          </p>
        {/if}
      {:else}
        <p>
          {#if queue.due + queue.newToday > 0}
            {queue.due} due · {queue.newToday} new
          {:else}
            {queue.items.length} coming up in the next {LEARN_AHEAD_MS / 60_000} minutes
          {/if}
        </p>
        <div class="row">
          <button type="button" class="primary" onclick={start}>Start review</button>
        </div>
      {/if}
    </div>
  {:else if session.phase === 'card' && session.current}
    <p class="muted progress" role="status">
      {session.reviewed} reviewed · {queue.items.length} left
    </p>

    <section class="card stack front" aria-label="Question">
      {#if session.current.direction === 'forward'}
        <div class="row prompt-row">
          <p class="prompt" lang="vi">{session.current.word.word}</p>
          <AudioButton text={session.current.word.word} audioFile={session.current.word.audioFile} />
        </div>
        <p class="muted hint">What does it mean?</p>
      {:else}
        <dl class="meanings">
          {#each session.current.word.senses.filter((s) => s.meaning) as s, i (i)}<dt>{s.pos || 'Meaning'}</dt><dd>{s.meaning}</dd>{/each}
        </dl>
        <p class="muted hint">Which word is it?</p>
      {/if}
    </section>

    {#if !session.revealed}
      <button type="button" class="primary show" bind:this={answerButton} onclick={reveal}>
        Show answer <kbd class="key" aria-hidden="true">Space</kbd>
      </button>
    {:else}
      <div class="ratings" role="group" aria-label="How well did you remember it?">
        {#each session.options as option, i (option.grade)}
          <button
            type="button"
            class="rating"
            class:again={i === 0}
            aria-label="{option.label}, due {formatDueIn(option.due, session.revealedAt)}"
            onclick={() => rateCurrent(option.grade)}
          >
            <span class="label">{option.label}</span>
            <span class="muted interval">{option.interval}</span>
            <kbd class="key" aria-hidden="true">{i + 1}</kbd>
          </button>
        {/each}
      </div>
      <section class="card stack back" tabindex="-1" bind:this={answer} aria-label="Answer">
        <WordCard word={session.current.word} level={2} />
      </section>
    {/if}
    {#if session.saveError}<p class="notice" role="alert">{session.saveError}</p>{/if}
  {:else}
    <div class="card stack">
      <p>
        {session.reviewed === 0
          ? 'No cards were reviewed.'
          : `You reviewed ${session.reviewed} ${session.reviewed === 1 ? 'card' : 'cards'}.`}
        {#if queue.nextDue}The next card is due {formatDueIn(queue.nextDue, now)}.{/if}
      </p>
      {#if queue.newLater > 0}
        <p class="muted">
          {queue.newLater} new {queue.newLater === 1 ? 'card waits' : 'cards wait'} for tomorrow. You can change
          <a href={href({ name: 'settings' })}>New cards per day</a> in Settings.
        </p>
      {/if}
      {#if session.saveError}<p class="notice" role="alert">{session.saveError}</p>{/if}
      <div class="row">
        <a class="button" href={href({ name: 'words' })}>Back to words</a>
        {#if queue.items.length > 0}
          <button type="button" class="primary" onclick={start}>Review {queue.items.length} more</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  p { margin: 0; }
  .progress { font-size: 14px; }
  .prompt-row { flex-wrap: wrap; gap: 12px; }
  .prompt { font-size: 32px; font-weight: 600; overflow-wrap: anywhere; }
  .hint { font-size: 14px; }
  .meanings { display: grid; grid-template-columns: fit-content(40%) minmax(0, 1fr); gap: 6px 14px; margin: 0; }
  .meanings dt { font-size: 14px; color: var(--muted); }
  .meanings dd { margin: 0; overflow-wrap: anywhere; }
  .show { min-height: 48px; }
  .ratings { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .rating { flex-direction: column; gap: 2px; min-height: 56px; padding: 8px 4px; }
  .rating.again .label { color: var(--danger); }
  .interval { font-size: 13px; }
  .back:focus { outline: none; }
  .key { display: none; font: 12px var(--font); color: var(--muted); }
  @media (hover: hover) and (pointer: fine) {
    .key { display: inline; }
  }
</style>
