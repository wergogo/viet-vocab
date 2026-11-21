<script lang="ts">
  import { href, type Route } from '../router';

  let { current }: { current: Route['name'] } = $props();

  const tabs: { name: 'words' | 'settings'; label: string; icon: string }[] = [
    { name: 'words', label: 'Words', icon: '📚' },
    { name: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  function isActive(name: 'words' | 'settings'): boolean {
    if (name === 'words') return current === 'words' || current === 'word' || current === 'char' || current === 'edit';
    return current === name;
  }
</script>

<nav class="nav" aria-label="Main">
  <a class="brand" href={href({ name: 'words' })}>Viet Vocab</a>
  <div class="tabs">
    {#each tabs as tab (tab.name)}
      <a class="tab" class:active={isActive(tab.name)} href={href({ name: tab.name })}>
        <span aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
      </a>
    {/each}
    <a class="tab add" class:active={current === 'add'} href={href({ name: 'add', word: '' })}>
      <span aria-hidden="true">＋</span><span>Add</span>
    </a>
  </div>
</nav>
