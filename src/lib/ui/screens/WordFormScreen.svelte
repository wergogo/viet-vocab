<script lang="ts">
  import { listLiveLists } from '../../db/lists';
  import { findDuplicates } from '../../db/search';
  import { createWord, draftFromWord, emptyDraft, getWord, updateWord, type WordDraft } from '../../db/words';
  import { rebuildSyllables } from '../../text/syllables';
  import { href, navigate } from '../router';
  import { liveWords } from '../stores';
  import ListPicker from '../components/ListPicker.svelte';
  import SensesEditor from '../components/SensesEditor.svelte';
  import SyllableEditor from '../components/SyllableEditor.svelte';

  let { initialWord = '', editId }: { initialWord?: string; editId?: string } = $props();

  // Props are constant per instance: App.svelte remounts this screen per route via {#key}.
  // svelte-ignore state_referenced_locally
  let draft = $state<WordDraft>(emptyDraft(initialWord));
  // svelte-ignore state_referenced_locally
  let loaded = $state(editId === undefined);
  let error = $state('');
  let loadError = $state('');
  let saving = $state(false);

  $effect(() => {
    if (editId === undefined) return;
    let cancelled = false;
    getWord(editId)
      .then((w) => {
        if (cancelled) return;
        if (w) draft = draftFromWord(w);
        else loadError = "This word was deleted or doesn't exist.";
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

  function onWordInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    draft.word = value;
    draft.syllables = rebuildSyllables(value, draft.syllables);
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    saving = true;
    try {
      const plain = $state.snapshot(draft);
      const liveIds = new Set((await listLiveLists()).map((l) => l.id));
      plain.listIds = plain.listIds.filter((id) => liveIds.has(id));
      const saved = editId === undefined ? await createWord(plain) : await updateWord(editId, plain);
      navigate({ name: 'word', id: saved.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      error = / not found$/.test(message) ? "This word was deleted, so the changes can't be saved." : message;
    } finally {
      saving = false;
    }
  }
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

    <SensesEditor bind:senses={draft.senses} />

    <label class="field">
      <span>Etymology</span>
      <textarea bind:value={draft.etymology}></textarea>
    </label>

    <label class="field">
      <span>Notes</span>
      <textarea bind:value={draft.notes}></textarea>
    </label>

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
  .actions { justify-content: space-between; }
</style>
