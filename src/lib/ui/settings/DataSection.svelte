<script lang="ts">
  import { exportJson, importJson } from '../../db/snapshot';
  import { localDate } from '../../model/dates';
  import { FileFormatError, NewerSchemaError } from '../../model/file';

  let message = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  async function doExport() {
    message = '';
    try {
      const json = await exportJson();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `viet-vocab-export-${localDate(new Date())}.json`;
      a.click();
      // iOS Safari reads the URL only after its download prompt is answered.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error(e);
      message = 'Export failed.';
    }
  }

  async function doImport(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    message = 'Importing…';
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
  {#if message}<p class="notice" aria-hidden="true">{message}</p>{/if}
  <p class="sr-only" role="status">{message}</p>
</section>

<style>
  p { margin: 0; }
  label.button:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
