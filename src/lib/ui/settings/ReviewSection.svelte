<script lang="ts">
  import { saveSettings } from '../../db/settings';
  import { MAX_NEW_CARDS_PER_DAY } from '../../model/file';
  import { DEFAULT_SETTINGS, type ReviewSettings } from '../../model/types';
  import { liveSettings } from '../stores';

  const settings = $derived($liveSettings ?? DEFAULT_SETTINGS);
  let problem = $state('');

  async function save(change: Partial<ReviewSettings>) {
    try {
      await saveSettings(change);
    } catch (e) {
      console.error(e);
      problem = "Couldn't save the setting. Please try again.";
    }
  }

  function saveNewCards(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    // The same range parseFile accepts, so an export always imports again.
    if (input.value.trim() === '' || !Number.isInteger(value) || value < 0 || value > MAX_NEW_CARDS_PER_DAY) {
      problem = `Enter a whole number from 0 to ${MAX_NEW_CARDS_PER_DAY}.`;
      return;
    }
    problem = '';
    void save({ newCardsPerDay: value });
  }
</script>

<section class="card stack">
  <h2>Review</h2>
  <label class="field">
    <span>New cards per day</span>
    <input
      type="number"
      inputmode="numeric"
      min="0"
      max={MAX_NEW_CARDS_PER_DAY}
      step="1"
      value={settings.newCardsPerDay}
      onchange={saveNewCards}
      aria-invalid={problem ? 'true' : undefined}
      aria-describedby={problem ? 'review-settings-problem' : undefined}
    />
  </label>
  {#if problem}<p class="notice" role="alert" id="review-settings-problem">{problem}</p>{/if}
  <label class="check">
    <input
      type="checkbox"
      checked={settings.reverseCards}
      onchange={(e) => save({ reverseCards: e.currentTarget.checked })}
    />
    <span>Reverse cards: also show the meanings and ask for the word</span>
  </label>
  <p class="muted">
    New words come in the order you added them, up to this many a day. A word's reverse card starts the day after its
    first review.
  </p>
</section>

<style>
  p { margin: 0; }
  input[type='number'] { max-width: 10em; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .check input { width: 20px; height: 20px; }
</style>
