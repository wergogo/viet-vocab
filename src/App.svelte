<script lang="ts">
  import { route } from './lib/ui/router';
  import Nav from './lib/ui/components/Nav.svelte';
  import WordsScreen from './lib/ui/screens/WordsScreen.svelte';
  import WordFormScreen from './lib/ui/screens/WordFormScreen.svelte';
  import WordScreen from './lib/ui/screens/WordScreen.svelte';
  import CharScreen from './lib/ui/screens/CharScreen.svelte';
  import SettingsScreen from './lib/ui/screens/SettingsScreen.svelte';

  const TITLES = { words: 'Words', add: 'Add word', edit: 'Edit word', word: 'Word', settings: 'Settings' } as const;

  $effect(() => {
    const r = $route;
    const page = r.name === 'char' ? r.char : TITLES[r.name];
    document.title = r.name === 'words' ? 'Viet Vocab' : `${page} · Viet Vocab`;
  });
</script>

<Nav current={$route.name} />
<main class="screen">
  {#if $route.name === 'words'}
    <WordsScreen />
  {:else if $route.name === 'add'}
    {#key $route.word}<WordFormScreen initialWord={$route.word} />{/key}
  {:else if $route.name === 'edit'}
    {#key $route.id}<WordFormScreen editId={$route.id} />{/key}
  {:else if $route.name === 'word'}
    {#key $route.id}<WordScreen id={$route.id} />{/key}
  {:else if $route.name === 'char'}
    {#key $route.char}<CharScreen char={$route.char} />{/key}
  {:else if $route.name === 'settings'}
    <SettingsScreen />
  {/if}
</main>
