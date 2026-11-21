<script lang="ts">
  import { createList } from '../../db/lists';
  import { liveLists } from '../stores';

  let { selected = $bindable() }: { selected: string[] } = $props();

  let newName = $state('');

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const key = name.toLocaleLowerCase('vi');
    const existing = ($liveLists ?? []).find((l) => l.name.toLocaleLowerCase('vi') === key);
    const id = existing ? existing.id : (await createList(name)).id;
    if (!selected.includes(id)) selected = [...selected, id];
    newName = '';
  }
</script>

<fieldset>
  <legend>Lists</legend>
  {#if ($liveLists ?? []).length > 0}
    <div class="chips">
      {#each $liveLists ?? [] as list (list.id)}
        <button
          type="button"
          class="chip"
          class:on={selected.includes(list.id)}
          aria-pressed={selected.includes(list.id)}
          onclick={() => toggle(list.id)}>{list.name}</button
        >
      {/each}
    </div>
  {/if}
  <div class="row">
    <input
      bind:value={newName}
      placeholder="New list name"
      aria-label="New list name"
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      }}
    />
    <button type="button" onclick={add} disabled={!newName.trim()}>Create</button>
  </div>
</fieldset>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
