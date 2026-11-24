<script lang="ts">
  import { RecordNotFoundError } from '../../db/errors';
  import { listLiveLists } from '../../db/lists';
  import { findDuplicates } from '../../db/search';
  import { createWord, draftFromWord, emptyDraft, getWord, updateWord, type WordDraft } from '../../db/words';
  import { rebuildSyllables } from '../../text/syllables';
  import { applyEntry, applyIpaOnly, lookupStillApplies } from '../../wiktionary/apply';
  import { lookupWord } from '../../wiktionary/lookup';
  import type { LookupResult } from '../../wiktionary/types';
  import { href, navigate } from '../router';
  import { liveWords } from '../stores';
  import AudioButton from '../components/AudioButton.svelte';
  import EquivalentsEditor from '../components/EquivalentsEditor.svelte';
  import ListPicker from '../components/ListPicker.svelte';
  import LookupPanel from '../components/LookupPanel.svelte';
  import RegionToggles from '../components/RegionToggles.svelte';
  import SensesEditor from '../components/SensesEditor.svelte';
  import SyllableEditor from '../components/SyllableEditor.svelte';

  let {
    initialWord = '',
    editId,
    autoLookup = false,
  }: { initialWord?: string; editId?: string; autoLookup?: boolean } = $props();

  // Props are constant per instance: App.svelte remounts this screen per route via {#key}.
  // svelte-ignore state_referenced_locally
  let draft = $state<WordDraft>(emptyDraft(initialWord));
  // svelte-ignore state_referenced_locally
  let loaded = $state(editId === undefined);
  let error = $state('');
  let loadError = $state('');
  let saving = $state(false);

  let lookupStatus = $state<'idle' | 'loading' | 'error'>('idle');
  let lookupError = $state('');
  let lookupResult = $state.raw<LookupResult | null>(null);
  let chosenEntry = $state(0);
  let pairingNote = $state<string | null>(null);
  /** The word the lookup, source and recording belong to. */
  let sourceWord = $state('');
  let lookupRun = 0;
  /** Whether the last lookup was a Refresh, so Retry repeats it as one. */
  let lastRefresh = false;
  /** The draft before the lookup filled it. Entries fall back to it, so switching etymologies never mixes them. */
  let lookupBase: WordDraft | null = null;

  $effect(() => {
    if (editId === undefined) return;
    let cancelled = false;
    getWord(editId)
      .then((w) => {
        if (cancelled) return;
        if (w) {
          draft = draftFromWord(w);
          sourceWord = w.word;
        } else {
          loadError = "This word was deleted or doesn't exist.";
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) loadError = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        if (!cancelled) loaded = true;
      });
    return () => {
      cancelled = true;
    };
  });

  const duplicates = $derived(findDuplicates($liveWords ?? [], draft.word, editId));

  // M2 decision 5: a lookup belongs to one word. While the word is retyped as another, the lookup, its page link and
  // its recording are hidden; they are dropped when a lookup starts for the new word, and left out if the form is
  // saved, so fixing a typo with backspace keeps them.
  const lookupCurrent = $derived(lookupStillApplies(draft.word, sourceWord, draft.source?.wiktionaryTitle));

  /** Drops a lookup made for another word, with the page link and recording it filled in. */
  function forgetLookup() {
    lookupBase = null;
    lookupResult = null;
    chosenEntry = 0;
    pairingNote = null;
    draft.source = undefined;
    draft.audioFile = undefined;
  }

  function onWordInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    draft.word = value;
    draft.syllables = rebuildSyllables(value, draft.syllables);
  }

  function fill(result: LookupResult, index: number) {
    const plain = $state.snapshot(draft);
    const entry = result.entries[index];
    if (entry) {
      const applied = applyEntry(plain, result, entry, lookupBase ?? plain);
      draft = applied.draft;
      pairingNote = applied.note;
    } else {
      draft = applyIpaOnly(plain, result);
      pairingNote = null;
    }
  }

  async function runLookup(refresh = false) {
    if (!lookupCurrent) forgetLookup();
    const run = ++lookupRun;
    const word = draft.word;
    sourceWord = word;
    lastRefresh = refresh;
    lookupStatus = 'loading';
    lookupError = '';
    try {
      const result = await lookupWord(word, { refresh });
      if (run !== lookupRun) return;
      lookupStatus = 'idle';
      // Retyped as another word while it loaded: the result belongs to the old word (or to the page it led to).
      if (!lookupStillApplies(draft.word, word, result.title ?? undefined)) return;
      lookupResult = result;
      // Refresh and Retry keep the chosen etymology while the page still has it.
      if (chosenEntry >= result.entries.length) chosenEntry = 0;
      // The draft from before the first lookup stays the base. Taking it again on Refresh would start from fields
      // the last fill set, and etymologies would mix again.
      lookupBase ??= $state.snapshot(draft);
      fill(result, chosenEntry);
    } catch (e) {
      if (run !== lookupRun) return;
      console.error(e);
      lookupError = e instanceof Error ? e.message : String(e);
      lookupStatus = 'error';
    }
  }

  function chooseEntry(index: number) {
    if (!lookupResult) return;
    chosenEntry = index;
    fill(lookupResult, index);
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    saving = true;
    try {
      const plain = $state.snapshot(draft);
      // M2 decision 5: the page link and recording of another word aren't saved with this one.
      if (!lookupCurrent) {
        plain.source = undefined;
        plain.audioFile = undefined;
      }
      const liveIds = new Set((await listLiveLists()).map((l) => l.id));
      plain.listIds = plain.listIds.filter((id) => liveIds.has(id));
      const saved = editId === undefined ? await createWord(plain) : await updateWord(editId, plain);
      navigate({ name: 'word', id: saved.id });
    } catch (e) {
      error =
        e instanceof RecordNotFoundError
          ? "This word was deleted, so the changes can't be saved."
          : e instanceof Error
            ? e.message
            : String(e);
    } finally {
      saving = false;
    }
  }

  // A compound tapped on a character page opens Add with the word already looked up (spec §5.4).
  // svelte-ignore state_referenced_locally
  if (autoLookup && editId === undefined && initialWord.trim()) void runLookup();
</script>

{#if !loaded}
  <p class="muted">Loading…</p>
{:else if loadError}
  <div class="card stack">
    <p role="alert">{loadError}</p>
    <a href={href({ name: 'words' })}>Back to words</a>
  </div>
{:else}
  <form class="stack" onsubmit={save}>
    <h1>{editId === undefined ? 'Add word' : 'Edit word'}</h1>

    <label class="field">
      <span>Vietnamese word</span>
      <input
        lang="vi"
        value={draft.word}
        oninput={onWordInput}
        required
        placeholder="nhập khẩu"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </label>

    {#if duplicates.length > 0}
      <p class="notice" role="status">
        Already saved:
        {#each duplicates as d, i (d.id)}{i > 0 ? ', ' : ''}<a href={href({ name: 'word', id: d.id })}>{d.word}</a>{/each}.
        You can still save another entry.
      </p>
    {/if}

    <LookupPanel
      word={draft.word}
      status={lookupCurrent ? lookupStatus : 'idle'}
      error={lookupError}
      result={lookupCurrent ? lookupResult : null}
      chosen={chosenEntry}
      note={lookupCurrent ? pairingNote : null}
      onlookup={() => runLookup()}
      onrefresh={() => runLookup(true)}
      onretry={() => runLookup(lastRefresh)}
      onchoose={chooseEntry}
    />

    <SyllableEditor bind:syllables={draft.syllables} />

    <div class="row ipa-row">
      <label class="field">
        <span>IPA · Hà Nội</span>
        <input class="ipa" bind:value={draft.ipaHanoi} placeholder="[ɲəp̚˧˨ʔ xəw˧˩]" autocomplete="off" />
      </label>
      <label class="field">
        <span>IPA · Sài Gòn</span>
        <input class="ipa" bind:value={draft.ipaSaigon} placeholder="[ɲəp̚˨˩˨ kʰəw˨˩˦]" autocomplete="off" />
      </label>
    </div>

    {#if draft.audioFile && lookupCurrent}
      <div class="row recording">
        <span class="muted">Recording</span>
        <span class="file">{draft.audioFile}</span>
        <AudioButton text={draft.word} audioFile={draft.audioFile} recordingOnly />
        <button type="button" aria-label="Remove the recording" onclick={() => (draft.audioFile = undefined)}
          >Remove</button
        >
      </div>
    {/if}

    <SensesEditor bind:senses={draft.senses} />

    <label class="field">
      <span>Etymology</span>
      <textarea bind:value={draft.etymology}></textarea>
    </label>

    <label class="field">
      <span>Notes</span>
      <textarea bind:value={draft.notes}></textarea>
    </label>

    <fieldset>
      <legend>Regions</legend>
      <RegionToggles bind:selected={draft.regions} />
      <p class="muted hint">Where the word is used. Leave all off for a word used everywhere.</p>
    </fieldset>

    <EquivalentsEditor bind:equivalents={draft.equivalents} />

    <ListPicker bind:selected={draft.listIds} />

    {#if error}<p class="notice" role="alert">{error}</p>{/if}

    <div class="row actions">
      <button class="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      <a href={editId === undefined ? href({ name: 'words' }) : href({ name: 'word', id: editId })}>Cancel</a>
    </div>
  </form>
{/if}

<style>
  .ipa-row { flex-wrap: wrap; align-items: stretch; }
  .ipa-row .field { flex: 1 1 220px; }
  .recording { flex-wrap: wrap; }
  .file { flex: 1 1 160px; font-size: 14px; overflow-wrap: anywhere; }
  .actions { justify-content: space-between; }
  .hint { margin: 0; font-size: 14px; }
</style>
