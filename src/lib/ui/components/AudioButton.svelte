<script lang="ts">
  import { canPlayRecording, pickVoice, pronounce, savedVoiceUri, vietnameseVoices } from '../../audio/audio';

  // `recordingOnly` (the form's Recording row) never puts the device voice in place of the file.
  let { text, audioFile, recordingOnly = false }: { text: string; audioFile?: string; recordingOnly?: boolean } =
    $props();

  const uid = $props.id();
  let problem = $state('');
  const voice = $derived(recordingOnly ? null : pickVoice($vietnameseVoices, savedVoiceUri()));
  // Ogg can't play on iPhone; then pronounce() speaks within the tap instead.
  const playable = $derived(audioFile ? canPlayRecording(audioFile) : false);
  const available = $derived(playable || voice !== null);
  // Voices and playable formats differ between browsers on the same device, so the hints name the browser.
  const unavailable = $derived(
    recordingOnly
      ? "This browser can't play this file type"
      : audioFile
        ? "This browser can't play the recording and has no Vietnamese voice"
        : 'No Vietnamese voice in this browser',
  );

  async function play() {
    problem = '';
    const heard = await pronounce(text, audioFile, voice);
    if (heard === 'voice-instead') problem = "Couldn't play the recording, so this is the device voice.";
    else if (heard === 'silent') problem = "Couldn't play the recording.";
  }
</script>

<span class="audio">
  <button
    type="button"
    class="play"
    onclick={play}
    disabled={!available}
    aria-label={`Play “${text}”`}
    aria-describedby={available ? undefined : `${uid}-hint`}
    title={available ? (playable ? 'Play the recording' : "Read aloud with this device's voice") : unavailable}
    >🔊</button
  >
  {#if !available}<span class="muted hint" id={`${uid}-hint`}>{unavailable}</span>{/if}
  <!-- Mounted while empty, so screen readers announce the message when it appears; out of the layout until then. -->
  <span class="problem" class:notice={problem !== ''} class:sr-only={problem === ''} role="status">{problem}</span>
</span>

<style>
  .audio { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .play { min-width: 44px; min-height: 44px; padding: 6px 10px; font-size: 20px; }
  .hint { font-size: 13px; }
  .problem { font-size: 14px; }
</style>
