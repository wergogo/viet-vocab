import type { Equivalent, Region, Sense } from '../model/types';
import type { EntryChars } from './characters';

/** One etymology of a Wiktionary page, ready to fill the add form. */
export interface LookupEntry {
  /** For the etymology picker: "Etymology 3 · Noun", or "Noun, Adjective" on a page with one etymology. */
  label: string;
  chars: EntryChars | null;
  senses: Sense[];
  /** Plain text, one paragraph per line. */
  etymology: string;
  ipaHanoi: string;
  ipaSaigon: string;
  /** Where the word is used, from the regional labels of its meanings; empty when none has one. */
  regions: Region[];
  /** Words with the same meaning in other regions, from its regionally qualified synonyms. */
  equivalents: Equivalent[];
  /** Wikimedia Commons file name of a recording. */
  audioFile?: string;
}

/** A looked-up word page as stored in the lookup cache (spec §4.3). */
export interface PageResult {
  /** The page the entries come from; null when the word isn't on Wiktionary. */
  title: string | null;
  entries: LookupEntry[];
  /** IPA from `{{vi-IPA}}` when the word isn't on Wiktionary; empty otherwise. */
  ipaHanoi: string;
  ipaSaigon: string;
  fetchedAt: string;
}

export interface LookupResult extends PageResult {
  /** The cleaned text that was looked up. */
  query: string;
}

/** A Vietnamese compound listed on a character page, e.g. 入口 nhập khẩu. */
export interface CharCompound {
  /** The Han spelling; empty when Wiktionary lists none. */
  han: string;
  word: string;
}

/** The Vietnamese part of a Wiktionary character page (spec §6.4). */
export interface CharInfo {
  title: string;
  hanViet: string[];
  nom: string[];
  meanings: string[];
  compounds: CharCompound[];
}
