<script lang="ts">
  import { stopsAutoSync } from '../../sync/errors';
  import { syncStatus } from '../../sync/sync';
  import { href, type Route } from '../router';

  let { current }: { current: Route['name'] } = $props();

  type Tab = 'words' | 'review' | 'settings';

  // Spec §5: Words · Review · Settings, plus Add.
  const tabs: { name: Tab; label: string; icon: string }[] = [
    { name: 'words', label: 'Words', icon: '📚' },
    { name: 'review', label: 'Review', icon: '📇' },
    { name: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  function isActive(name: Tab): boolean {
    if (name === 'words') return current === 'words' || current === 'word' || current === 'char' || current === 'edit';
    return current === name;
  }
</script>

<nav class="nav" aria-label="Main">
  <a class="brand" href={href({ name: 'words' })}>Viet Vocab</a>
  <div class="tabs">
    {#each tabs as tab (tab.name)}
      <a class="tab" class:active={isActive(tab.name)} aria-current={isActive(tab.name) ? 'page' : undefined} href={href({ name: tab.name })}>
        <span aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
        {#if tab.name === 'settings' && $syncStatus.state === 'error' && stopsAutoSync($syncStatus.kind)}
          <span class="dot" aria-hidden="true"></span><span class="sr-only">(sync stopped)</span>
        {/if}
      </a>
    {/each}
    <a class="tab add" class:active={current === 'add'} aria-current={current === 'add' ? 'page' : undefined} href={href({ name: 'add', word: '' })}>
      <span aria-hidden="true">＋</span><span>Add</span>
    </a>
  </div>
</nav>

<style>
  .tab { position: relative; }
  /* M4 decision 18: a sync that stopped until the owner acts shows on the Settings tab, so it isn't missed. */
  .dot { position: absolute; top: 4px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
</style>
