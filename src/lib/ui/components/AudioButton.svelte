<script lang="ts">
  import { canPlayRecording, pickVoice, playRecording, savedVoiceUri, speak, vietnameseVoices } from '../../audio/audio';

  let { text, audioFile }: { text: string; audioFile?: string } = $props();

  let problem = $state('');
  const voice = $derived(pickVoice($vietnameseVoices, savedVoiceUri()));
  // A recording this browser can't play (Ogg on iPhone) counts as none, so the tap speaks straight away:
  // iOS ignores speech that starts after the tap has been handled.
  const recording = $derived(audioFile && canPlayRecording(audioFile) ? audioFile : undefined);
  const available = $derived(recording !== undefined || voice !== null);

  // Spec §9: the Wiktionary recording when there is one, otherwise the device's Vietnamese voice.
  async function play() {
    problem = '';
    if (recording) {
      try {
        await playRecording(recording);
        return;
      } catch (e) {
        console.error(e);
        if (!voice) {
          problem = "Couldn't play the recording.";
          return;
        }
      }
    }
    if (voice) speak(text, voice);
  }
</script>

<span class="audio">
  <button
    type="button"
    class="play"
    onclick={play}
    disabled={!available}
    aria-label={`Play “${text}”`}
    title={recording ? 'Play the recording' : "Read aloud with this device's voice"}>🔊</button
  >
  {#if !available}
    <span class="muted hint">
      {audioFile ? "This device can't play the recording and has no Vietnamese voice" : 'No Vietnamese voice on this device'}
    </span>
  {/if}
  {#if problem}<span class="muted hint" role="status">{problem}</span>{/if}
</span>

<style>
  .audio { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .play { min-width: 44px; min-height: 44px; padding: 6px 10px; font-size: 20px; }
  .hint { font-size: 13px; }
</style>
