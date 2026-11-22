<script lang="ts">
  import { saveSettings } from '../../db/settings';
  import { MAX_NEW_CARDS_PER_DAY, parseNewCardsPerDay } from '../../model/settings';
  import type { ReviewSettings } from '../../model/types';
  import { liveSettings } from '../stores';

  const id = $props.id();
  /** The stored count when the field last held something that isn't a valid count; null while it holds one. */
  let rejectedOver = $state<number | null>(null);
  let saveError = $state('');
  // The typed text stays until it is corrected. When the stored count changes meanwhile (another tab, an import),
  // the field shows that count instead, so the message goes too.
  const countError = $derived(
    $liveSettings !== undefined && rejectedOver === $liveSettings.newCardsPerDay
      ? `Enter a whole number from 0 to ${MAX_NEW_CARDS_PER_DAY}.`
      : '',
  );

  /** Saves a change; if that fails, `undo` puts the control back to the stored value. */
  async function save(change: Partial<ReviewSettings>, undo: () => void) {
    saveError = '';
    try {
      await saveSettings(change);
    } catch (e) {
      console.error(e);
      undo();
      saveError = "Couldn't save the setting. Please try again.";
    }
  }

  function saveCount(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const stored = $liveSettings?.newCardsPerDay ?? null;
    const count = parseNewCardsPerDay(input.value);
    if (count === null) {
      rejectedOver = stored;
      return;
    }
    rejectedOver = null;
    void save({ newCardsPerDay: count }, () => (input.value = String(stored ?? '')));
  }

  function saveReverse(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const stored = $liveSettings?.reverseCards ?? !input.checked;
    void save({ reverseCards: input.checked }, () => (input.checked = stored));
  }
</script>

<section class="card stack">
  <h2>Review</h2>
  {#if $liveSettings === undefined}
    <p class="muted">Loading…</p>
  {:else}
    <label class="field">
      <span>New cards per day</span>
      <input
        type="number"
        inputmode="numeric"
        min="0"
        max={MAX_NEW_CARDS_PER_DAY}
        step="1"
        value={$liveSettings.newCardsPerDay}
        onchange={saveCount}
        aria-invalid={countError ? 'true' : undefined}
        aria-describedby={countError ? `${id}-error ${id}-help` : `${id}-help`}
      />
    </label>
    {#if countError}<p class="notice" role="alert" id="{id}-error">{countError}</p>{/if}
    <label class="check">
      <input type="checkbox" checked={$liveSettings.reverseCards} onchange={saveReverse} aria-describedby="{id}-help" />
      <span>Reverse cards: also show the meanings and ask for the word</span>
    </label>
    {#if saveError}<p class="notice" role="alert">{saveError}</p>{/if}
    <p class="muted" id="{id}-help">
      New words come in the order you added them, up to this many new cards a day. A word's reverse card starts the
      day after its first review. New words and reverse cards take turns, and both count toward the limit.
    </p>
  {/if}
</section>

<style>
  p { margin: 0; }
  input[type='number'] { max-width: 10em; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .check input { width: 20px; height: 20px; }
</style>
