<script lang="ts">
  import { autoplay, chosenVoice, chosenVoiceUri, speak, vietnameseVoices } from '../../audio/audio';

  /** The saved voice isn't available, so another stands in for it. */
  const standIn = $derived(
    $chosenVoice !== null && $chosenVoiceUri !== null && $chosenVoice.voiceURI !== $chosenVoiceUri,
  );

  function testVoice() {
    if ($chosenVoice) speak('Xin chào', $chosenVoice);
  }
</script>

<section class="card stack">
  <h2>Audio (this device)</h2>
  {#if $chosenVoice}
    <label class="field">
      <span>Vietnamese voice for words without a recording this browser can play</span>
      <select
        value={$chosenVoice.voiceURI}
        onchange={(e) => chosenVoiceUri.set(e.currentTarget.value)}
        aria-describedby={standIn ? 'voice-stand-in' : undefined}
      >
        {#each $vietnameseVoices as v (v.voiceURI)}
          <option value={v.voiceURI}>{v.name} ({v.lang})</option>
        {/each}
      </select>
    </label>
    {#if standIn}
      <p class="muted" id="voice-stand-in">
        The voice you chose isn't available in this browser right now, so this one is used.
      </p>
    {/if}
    <div class="row">
      <button type="button" onclick={testVoice}>Test voice</button>
    </div>
  {:else}
    <p class="muted">
      This browser offers no Vietnamese text-to-speech voice, so a word is silent here unless it has a recording this
      browser can play.
    </p>
  {/if}
  <label class="check">
    <input type="checkbox" checked={$autoplay} onchange={(e) => autoplay.set(e.currentTarget.checked)} />
    <span>Play each word during review</span>
  </label>
</section>

<style>
  p { margin: 0; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .check input { width: 20px; height: 20px; }
</style>
