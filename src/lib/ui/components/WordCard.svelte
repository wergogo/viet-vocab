<script lang="ts">
  import { regionLinks } from '../../db/equivalents';
  import type { Word } from '../../model/types';
  import { isCjkChar } from '../../text/cjk';
  import { REGION_NAMES } from '../regions';
  import { href } from '../router';
  import { liveLists, liveWords } from '../stores';
  import AudioButton from './AudioButton.svelte';
  import RegionTags from './RegionTags.svelte';

  // The word card (spec §5.3): the word screen shows it with its actions, and review shows it as a card's back
  // (spec §5.5) with an h2, since the review screen has its own h1.
  let { word, level = 1 }: { word: Word; level?: 1 | 2 } = $props();

  const han = $derived(word.syllables.map((s) => s.char ?? '').join(''));
  // Glosses show even when no syllable has a character.
  const showSyllables = $derived(word.syllables.some((s) => s.char || s.gloss));
  const listNames = $derived(($liveLists ?? []).filter((l) => word.listIds.includes(l.id)).map((l) => l.name));
  // Its equivalents, and the saved words that name it among theirs (spec §5.3).
  const links = $derived(regionLinks(word, $liveWords ?? []));
  // Keep in sync with the <dl> rows below, or a row that is the word's only fact won't show.
  const hasFacts = $derived(
    !!(
      word.ipaHanoi ||
      word.ipaSaigon ||
      word.senses.length > 0 ||
      links.length > 0 ||
      word.etymology ||
      word.notes ||
      listNames.length > 0
    ),
  );
</script>

<div class="title">
  <svelte:element this={level === 1 ? 'h1' : 'h2'} class="word" lang="vi">{word.word}</svelte:element>
  <AudioButton text={word.word} audioFile={word.audioFile} />
</div>

<RegionTags regions={word.regions} />

{#if showSyllables}
  <div class="han-line">
    {#if han}<span class="han big">{han}</span>{/if}
    <span class="pairs">
      {#each word.syllables as s, i (i)}
        {#if i > 0}<span class="muted" aria-hidden="true">·</span>{/if}
        <span class="pair">
          {s.text}
          {#if s.char}
            {#each Array.from(s.char) as c, j (j)}
              {#if isCjkChar(c)}
                <a class="han char-link" href={href({ name: 'char', char: c })}>{c}</a>
              {:else}
                <span class="han">{c}</span>
              {/if}
            {/each}
          {/if}
          {#if s.gloss}<span class="gloss muted">{s.gloss}</span>{/if}
        </span>
      {/each}
    </span>
  </div>
{/if}

{#if hasFacts}
  <dl class="facts">
    {#if word.ipaHanoi}<dt>Hà Nội</dt><dd class="ipa">{word.ipaHanoi}</dd>{/if}
    {#if word.ipaSaigon}<dt>Sài Gòn</dt><dd class="ipa">{word.ipaSaigon}</dd>{/if}
    {#each word.senses as s, i (i)}<dt>{s.pos || 'Meaning'}</dt><dd>{s.meaning}</dd>{/each}
    {#if links.length > 0}
      <dt>In other regions</dt>
      <dd>
        {#each links as link, i (i)}{i > 0 ? ', ' : ''}<a
            lang="vi"
            href={link.id ? href({ name: 'word', id: link.id }) : href({ name: 'add', word: link.word, lookup: true })}
            >{link.word}</a
          >{#if link.regions.length > 0}{' '}<span class="muted">({link.regions.map((r) => REGION_NAMES[r]).join(', ')})</span
            >{/if}{/each}
      </dd>
    {/if}
    {#if word.etymology}<dt>Etymology</dt><dd class="pre">{word.etymology}</dd>{/if}
    {#if word.notes}<dt>Notes</dt><dd class="pre">{word.notes}</dd>{/if}
    {#if listNames.length > 0}<dt>Lists</dt><dd>{listNames.join(', ')}</dd>{/if}
  </dl>
{/if}

<style>
  .title { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  .word { font-size: 28px; overflow-wrap: anywhere; }
  .han-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
  .big { font-size: 32px; }
  .pairs { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .pair .han { margin-left: 2px; font-size: 20px; }
  .char-link { display: inline-block; min-width: 24px; padding: 4px 2px; text-align: center; text-decoration: none; }
  .char-link:hover, .char-link:focus-visible { text-decoration: underline; }
  .gloss { margin-left: 2px; font-size: 13px; }
  .facts { display: grid; grid-template-columns: fit-content(40%) minmax(0, 1fr); gap: 6px 14px; margin: 0; }
  .facts dt { font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .pre { white-space: pre-wrap; }
</style>
