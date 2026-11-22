<script lang="ts">
  import { deleteList, findOrCreateList, listNameKey, renameList } from '../../db/lists';
  import type { List } from '../../model/types';
  import { cleanText } from '../../text/normalize';
  import { isSubmitEnter } from '../keys';
  import { liveLists } from '../stores';

  let newName = $state('');
  let listError = $state('');
  let listsHeading: HTMLHeadingElement | undefined = $state();
  let adding = false;

  /** The live list already using this name (same rule as findOrCreateList), other than `exceptId`. */
  function listNamed(name: string, exceptId?: string): List | undefined {
    const key = listNameKey(name);
    return ($liveLists ?? []).find((l) => l.id !== exceptId && listNameKey(l.name) === key);
  }

  async function addList() {
    const name = cleanText(newName);
    if (!name || adding) return;
    listError = '';
    const existing = listNamed(name);
    if (existing) {
      listError = `A list named “${existing.name}” already exists.`;
      return;
    }
    adding = true;
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
    const name = cleanText(prompt('Rename list', current) ?? '');
    if (!name) return;
    listError = '';
    const clash = listNamed(name, id);
    if (clash) {
      listError = `A list named “${clash.name}” already exists.`;
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
      // The focused button's row is gone, so keep focus in this section.
      listsHeading?.focus({ preventScroll: true });
    } catch (e) {
      console.error(e);
      listError = `Couldn't delete “${name}”.`;
    }
  }
</script>

<section class="card stack">
  <h2 tabindex="-1" bind:this={listsHeading}>Lists</h2>
  {#if $liveLists === undefined}
    <p class="muted">Loading…</p>
  {:else if $liveLists.length === 0}
    <p class="muted">No lists yet.</p>
  {:else}
    <ul class="plain-list">
      {#each $liveLists as list (list.id)}
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
        if (isSubmitEnter(e)) {
          e.preventDefault();
          addList();
        }
      }}
    />
    <button type="button" onclick={addList} disabled={!newName.trim()}>Create</button>
  </div>
  {#if listError}<p class="notice" role="alert">{listError}</p>{/if}
</section>

<style>
  .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  p { margin: 0; }
</style>
