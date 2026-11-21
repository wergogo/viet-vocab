<script lang="ts">
  import { deleteList, findOrCreateList, renameList } from '../../db/lists';
  import { exportJson, importJson } from '../../db/snapshot';
  import { FileFormatError, NewerSchemaError } from '../../model/file';
  import { liveLists } from '../stores';

  let newName = $state('');
  let listError = $state('');
  let message = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  let adding = false;

  function sameName(a: string, b: string): boolean {
    return a.toLocaleLowerCase('vi') === b.toLocaleLowerCase('vi');
  }

  function localDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function addList() {
    const name = newName.trim();
    if (!name || adding) return;
    adding = true;
    listError = '';
    newName = '';
    try {
      await findOrCreateList(name);
    } catch (e) {
      console.error(e);
      newName = name;
      listError = `Couldn't create “${name}”.`;
    } finally {
      adding = false;
    }
  }

  async function rename(id: string, current: string) {
    const name = prompt('Rename list', current)?.trim();
    if (!name) return;
    listError = '';
    if (($liveLists ?? []).some((l) => l.id !== id && sameName(l.name, name))) {
      listError = `A list named “${name}” already exists.`;
      return;
    }
    try {
      await renameList(id, name);
    } catch (e) {
      console.error(e);
      listError = `Couldn't rename “${current}”. It may have been deleted.`;
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete the list “${name}”? Its words stay saved; they are only removed from this list.`)) return;
    listError = '';
    try {
      await deleteList(id);
    } catch (e) {
      console.error(e);
      listError = `Couldn't delete “${name}”.`;
    }
  }

  async function doExport() {
    message = '';
    try {
      const json = await exportJson();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `viet-vocab-export-${localDate(new Date())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      message = 'Export failed.';
    }
  }

  async function doImport(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const { applied } = await importJson(await file.text());
      message = applied > 0 ? `Updated ${applied} record${applied === 1 ? '' : 's'}.` : 'Nothing new in that file.';
    } catch (e) {
      console.error(e);
      message =
        e instanceof FileFormatError || e instanceof NewerSchemaError
          ? e.message
          : 'Import failed, so nothing was changed.';
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<div class="stack">
  <h1>Settings</h1>

  <section class="card stack">
    <h2>Lists</h2>
    {#if ($liveLists ?? []).length === 0}
      <p class="muted">No lists yet.</p>
    {:else}
      <ul class="plain-list">
        {#each $liveLists ?? [] as list (list.id)}
          <li class="row">
            <span class="name">{list.name}</span>
            <button type="button" aria-label={`Rename ${list.name}`} onclick={() => rename(list.id, list.name)}>Rename</button>
            <button type="button" class="danger" aria-label={`Delete ${list.name}`} onclick={() => remove(list.id, list.name)}
              >Delete</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <div class="row">
      <input
        bind:value={newName}
        placeholder="New list name"
        aria-label="New list name"
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addList();
          }
        }}
      />
      <button type="button" onclick={addList} disabled={!newName.trim()}>Create</button>
    </div>
    {#if listError}<p class="notice" role="alert">{listError}</p>{/if}
  </section>

  <section class="card stack">
    <h2>Data</h2>
    <p class="muted">
      Export a backup of all words, lists and review progress, or import a file exported from this app. An import merges
      by most recent edit and never deletes anything.
    </p>
    <div class="row">
      <button type="button" onclick={doExport}>Export JSON</button>
      <label class="button">
        Import JSON
        <input class="sr-only" type="file" accept="application/json,.json" bind:this={fileInput} onchange={doImport} />
      </label>
    </div>
    {#if message}<p class="notice" role="status">{message}</p>{/if}
  </section>

  <section class="card stack">
    <h2>About</h2>
    <p class="muted">
      Viet Vocab v{__APP_VERSION__}. Dictionary content from Wiktionary is available under CC BY-SA 4.0.
      Simplified/traditional character data comes from OpenCC (Apache-2.0).
    </p>
  </section>
</div>

<style>
  .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  p { margin: 0; }
  label.button:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
