<script lang="ts">
  import { findOrCreateList } from '../../db/lists';
  import { liveLists } from '../stores';

  let { selected = $bindable() }: { selected: string[] } = $props();

  let newName = $state('');

  function toggle(id: string) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  let adding = false;

  async function add() {
    const name = newName.trim();
    if (!name || adding) return;
    adding = true;
    newName = '';
    try {
      const list = await findOrCreateList(name);
      if (!selected.includes(list.id)) selected = [...selected, list.id];
    } finally {
      adding = false;
    }
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
