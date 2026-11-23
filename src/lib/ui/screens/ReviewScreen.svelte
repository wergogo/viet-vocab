<script lang="ts">
  import { tick } from 'svelte';
  import { autoplay, chosenVoice, pronounce } from '../../audio/audio';
  import { saveReview } from '../../db/cards';
  import { RecordNotFoundError } from '../../db/errors';
  import { cardId } from '../../model/ids';
  import type { ReviewCard } from '../../model/types';
  import { formatDueIn } from '../../review/format';
  import { rate, ratingOptions, RATINGS, type Grade, type RatingOption } from '../../review/fsrs';
  import { buildQueue, LEARN_AHEAD_MS, type QueueItem } from '../../review/queue';
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

  let phase = $state<'start' | 'card' | 'done'>('start');
  /** The cards as this session knows them: the stored ones plus every rating, as soon as it is made. */
  let sessionCards = $state.raw<ReviewCard[] | null>(null);
  let current = $state.raw<QueueItem | null>(null);
  let revealed = $state(false);
  let options = $state.raw<RatingOption[]>([]);
  let revealedAt = $state.raw(new Date());
  let reviewed = $state(0);
  let saveError = $state('');
  let now = $state(new Date());
  let answerButton: HTMLButtonElement | undefined = $state();
  let answer: HTMLElement | undefined = $state();

  // While reviewing, the session's own copy, so a rating's background save doesn't build the queue again.
  const cards = $derived(sessionCards ?? $liveCards);
  const queue = $derived(
    $liveWords && $liveLists && cards && $liveSettings
      ? buildQueue({ words: $liveWords, cards, settings: $liveSettings, now, listId: scopeId || undefined })
      : null,
  );

  // Cards come due as time passes; keep the counts on the start and end screens current.
  $effect(() => {
    const timer = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(timer);
  });

  /** The next card at this moment, or null when the session is over. */
  function nextItem(): QueueItem | null {
    now = new Date();
    return queue?.items[0] ?? null;
  }

  // Called from a tap or key press, so phones allow the sound (spec §5.6 autoplay; Android needs a user gesture).
  function say(item: QueueItem) {
    void pronounce(item.word.word, item.word.audioFile, $chosenVoice);
  }

  function show(item: QueueItem | null) {
    current = item;
    revealed = false;
    options = [];
    if (!item) {
      phase = 'done';
      return;
    }
    phase = 'card';
    if ($autoplay && item.direction === 'forward') say(item);
    void tick().then(() => answerButton?.focus({ preventScroll: true }));
  }

  function start() {
    if (!$liveCards) return;
    sessionCards = [...$liveCards];
    reviewed = 0;
    saveError = '';
    show(nextItem());
  }

  function reveal() {
    if (phase !== 'card' || !current || revealed) return;
    revealed = true;
    revealedAt = new Date();
    options = ratingOptions(current.card?.fsrs, revealedAt);
    if ($autoplay && current.direction === 'reverse') say(current);
    void tick().then(() => answer?.focus({ preventScroll: true }));
  }

  function rateCurrent(grade: Grade) {
    const item = current;
    if (!item || !revealed) return;
    const at = new Date();
    const fsrs = rate(item.card?.fsrs, grade, at);
    const id = cardId(item.word.id, item.direction);
    // The session moves on at once; the save finishes in the background (spec §8: one write per rating).
    const local: ReviewCard = {
      id,
      wordId: item.word.id,
      direction: item.direction,
      fsrs,
      introducedAt: item.card?.introducedAt ?? at.toISOString(),
      updatedAt: at.toISOString(),
    };
    sessionCards = [...(sessionCards ?? []).filter((c) => c.id !== id), local];
    reviewed++;
    saveReview(item.word.id, item.direction, fsrs, at).catch((e: unknown) => {
      // A word deleted meanwhile (another tab, a sync) simply leaves the queue.
      if (e instanceof RecordNotFoundError) return;
      console.error(e);
      saveError = `Couldn't save the review of “${item.word.word}”. Your other reviews are saved.`;
    });
    show(nextItem());
  }

  // Desktop keys (spec §5.5): Space shows the answer, 1–4 rate it.
  function onKey(e: KeyboardEvent) {
    if (phase !== 'card' || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if ((e.target as HTMLElement | null)?.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (!revealed && e.key === ' ') {
      e.preventDefault();
      reveal();
    } else if (revealed && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      rateCurrent(RATINGS[Number(e.key) - 1]!.grade);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="stack">
  <h1 class:sr-only={phase === 'card'}>Review</h1>

  {#if !queue}
    <p class="muted">Loading…</p>
  {:else if phase === 'start'}
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
  {:else if phase === 'card' && current}
    <p class="muted progress" role="status">
      {reviewed} reviewed · {queue.items.length} left
    </p>

    <section class="card stack front" aria-label="Question">
      {#if current.direction === 'forward'}
        <div class="row prompt-row">
          <p class="prompt" lang="vi">{current.word.word}</p>
          <AudioButton text={current.word.word} audioFile={current.word.audioFile} />
        </div>
        <p class="muted hint">What does it mean?</p>
      {:else}
        <dl class="meanings">
          {#each current.word.senses.filter((s) => s.meaning) as s, i (i)}<dt>{s.pos || 'Meaning'}</dt><dd>{s.meaning}</dd>{/each}
        </dl>
        <p class="muted hint">Which word is it?</p>
      {/if}
    </section>

    {#if !revealed}
      <button type="button" class="primary show" bind:this={answerButton} onclick={reveal}>
        Show answer <kbd class="key" aria-hidden="true">Space</kbd>
      </button>
    {:else}
      <div class="ratings" role="group" aria-label="How well did you remember it?">
        {#each options as option, i (option.grade)}
          <button
            type="button"
            class="rating"
            class:again={i === 0}
            aria-label="{option.label}, due {formatDueIn(option.due, revealedAt)}"
            onclick={() => rateCurrent(option.grade)}
          >
            <span class="label">{option.label}</span>
            <span class="muted interval">{option.interval}</span>
            <kbd class="key" aria-hidden="true">{i + 1}</kbd>
          </button>
        {/each}
      </div>
      <section class="card stack back" tabindex="-1" bind:this={answer} aria-label="Answer">
        <WordCard word={current.word} level={2} />
      </section>
    {/if}
    {#if saveError}<p class="notice" role="alert">{saveError}</p>{/if}
  {:else}
    <div class="card stack">
      <p>
        {reviewed === 0 ? 'No cards were reviewed.' : `You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}.`}
        {#if queue.nextDue}The next card is due {formatDueIn(queue.nextDue, now)}.{/if}
      </p>
      {#if queue.newLater > 0}
        <p class="muted">
          {queue.newLater} new {queue.newLater === 1 ? 'card waits' : 'cards wait'} for tomorrow. You can change
          <a href={href({ name: 'settings' })}>New cards per day</a> in Settings.
        </p>
      {/if}
      {#if saveError}<p class="notice" role="alert">{saveError}</p>{/if}
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
