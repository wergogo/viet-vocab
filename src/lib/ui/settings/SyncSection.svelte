<script lang="ts">
  import {
    cleanConfig,
    configProblems,
    isClassicToken,
    lastSync,
    SYNC_DEFAULTS,
    syncConfig,
    type ConfigField,
    type ConfigProblems,
    type SyncConfig,
  } from '../../sync/config';
  import { checkConnection } from '../../sync/cycle';
  import { stopsAutoSync, SyncError } from '../../sync/errors';
  import { saveSyncConfig, syncNow, syncStatus } from '../../sync/sync';
  import ExternalLink from '../components/ExternalLink.svelte';

  const id = $props.id();

  // GitHub fills these forms in from the address (docs/sync-setup.md). The token's repository can't be preselected.
  const NEW_REPO_URL = 'https://github.com/new?name=viet-vocab-data&visibility=private';
  const NEW_TOKEN_URL =
    'https://github.com/settings/personal-access-tokens/new?name=Viet+Vocab+sync&description=Sync+for+the+Viet+Vocab+app&expires_in=366&contents=write';

  const FIELDS: { name: Exclude<ConfigField, 'token'>; label: string; placeholder?: string }[] = [
    { name: 'owner', label: 'Owner', placeholder: 'your GitHub user name' },
    { name: 'repo', label: 'Repository' },
    { name: 'branch', label: 'Branch' },
    { name: 'path', label: 'File' },
  ];

  const blank = (): SyncConfig => ({ owner: '', ...SYNC_DEFAULTS, token: '' });

  let editing = $state(false);
  let form = $state<SyncConfig>(blank());
  let problems = $state<ConfigProblems>({});
  let checking = $state(false);
  let checkResult = $state('');

  const showForm = $derived($syncConfig === null || editing);
  /** While the saved settings are edited, an empty token field keeps the saved token. */
  const keepsToken = $derived(editing && $syncConfig !== null);

  const dateAndTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const timeOnly = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });

  function syncedText(at: string | undefined): string {
    if (!at) return 'Not synced yet.';
    const date = new Date(at);
    const today = date.toDateString() === new Date().toDateString();
    return `Last synced ${today ? `at ${timeOnly.format(date)}` : dateAndTime.format(date)}.`;
  }

  const statusText = $derived.by(() => {
    const status = $syncStatus;
    switch (status.state) {
      case 'syncing':
        return 'Syncing…';
      case 'waiting':
        return 'Changes are waiting to sync.';
      case 'offline':
        return "Offline. Changes sync when you're back online.";
      case 'error':
        return `${stopsAutoSync(status.kind) ? 'Sync stopped.' : 'Sync failed.'} ${status.message}`;
      default:
        return syncedText($lastSync?.at);
    }
  });

  /** The settings the form describes, or null after showing what to fix. */
  function formConfig(): SyncConfig | null {
    const config = cleanConfig($state.snapshot(form));
    if (keepsToken && config.token === '' && $syncConfig) config.token = $syncConfig.token;
    problems = configProblems(config);
    return Object.keys(problems).length === 0 ? config : null;
  }

  async function testConnection() {
    const config = formConfig();
    if (!config) return;
    checking = true;
    checkResult = 'Checking…';
    try {
      const { words } = await checkConnection(config);
      const where = `${config.owner}/${config.repo}`;
      checkResult =
        words === null
          ? `Connected to ${where}. There's no ${config.path} yet: the first sync creates it.`
          : `Connected to ${where}. ${config.path} holds ${words} ${words === 1 ? 'word' : 'words'}.`;
    } catch (e) {
      if (!(e instanceof SyncError)) console.error(e);
      checkResult = e instanceof SyncError ? e.message : "The check didn't finish. Please try again.";
    } finally {
      checking = false;
    }
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    const config = formConfig();
    if (!config) return;
    saveSyncConfig(config);
    editing = false;
    checkResult = '';
    form = blank();
  }

  function edit() {
    if (!$syncConfig) return;
    form = { ...$syncConfig, token: '' };
    problems = {};
    checkResult = '';
    editing = true;
  }

  function cancel() {
    editing = false;
    problems = {};
    checkResult = '';
    form = blank();
  }

  function stopSyncing() {
    if (!confirm('Stop syncing on this device? The token is removed from this browser; your words stay here.')) return;
    editing = false;
    saveSyncConfig(null);
  }
</script>

<section class="card stack">
  <h2>Sync</h2>
  {#if !showForm && $syncConfig}
    <p>
      Syncing with <strong>{$syncConfig.owner}/{$syncConfig.repo}</strong>: {$syncConfig.path} on {$syncConfig.branch}.
    </p>
    <p class:notice={$syncStatus.state === 'error'} role="status">{statusText}</p>
    {#if $syncStatus.state !== 'idle' && $lastSync}<p class="muted">{syncedText($lastSync.at)}</p>{/if}
    <div class="row wrap">
      <button type="button" class="primary" onclick={syncNow} disabled={$syncStatus.state === 'syncing'}>Sync now</button>
      <button type="button" onclick={edit}>Change settings</button>
      <button type="button" onclick={stopSyncing}>Stop syncing on this device</button>
    </div>
  {:else}
    {#if !editing}
      <p class="muted">
        Sync keeps your words the same on all your devices, through one file in a private GitHub repository. Set it up
        once:
      </p>
      <ol class="muted steps">
        <li><ExternalLink href={NEW_REPO_URL}>Create a private repository</ExternalLink>, adding a README.</li>
        <li>
          <ExternalLink href={NEW_TOKEN_URL}>Create a fine-grained token</ExternalLink> for that repository only, with
          Contents: Read and write.
        </li>
        <li>On each device, fill in the fields below, test the connection, and save.</li>
      </ol>
    {/if}
    <form class="stack" onsubmit={save} novalidate>
      {#each FIELDS as field (field.name)}
        <label class="field">
          <span>{field.label}</span>
          <input
            bind:value={form[field.name]}
            placeholder={field.placeholder}
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            aria-invalid={problems[field.name] ? 'true' : undefined}
            aria-describedby={problems[field.name] ? `${id}-${field.name}` : undefined}
          />
        </label>
        {#if problems[field.name]}<p class="notice" id="{id}-{field.name}">{problems[field.name]}</p>{/if}
      {/each}
      <label class="field">
        <span>Token</span>
        <input
          type="password"
          bind:value={form.token}
          placeholder={keepsToken ? 'Saved on this device; leave empty to keep it' : 'github_pat_…'}
          autocomplete="off"
          spellcheck="false"
          aria-invalid={problems.token ? 'true' : undefined}
          aria-describedby={problems.token ? `${id}-token` : undefined}
        />
      </label>
      {#if problems.token}<p class="notice" id="{id}-token">{problems.token}</p>{/if}
      {#if isClassicToken(form.token.trim())}
        <p class="muted">
          This looks like a classic token, which reaches all your repositories. A fine-grained token for the data
          repository only is safer.
        </p>
      {/if}
      <div class="row wrap">
        <button type="button" onclick={testConnection} disabled={checking}>Test connection</button>
        <button type="submit" class="primary">Save</button>
        {#if editing}<button type="button" onclick={cancel}>Cancel</button>{/if}
      </div>
      {#if checkResult}<p role="status">{checkResult}</p>{/if}
    </form>
  {/if}
</section>

<style>
  p { margin: 0; }
  .steps { margin: 0; padding-left: 1.4em; display: grid; gap: 4px; }
  .wrap { flex-wrap: wrap; }
</style>
