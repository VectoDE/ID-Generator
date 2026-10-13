// SPDX-FileCopyrightText: 2024 Vecto <https://github.com/VectoDE>
//
// SPDX-License-Identifier: BSD-3-Clause

import type { PatternGeneratorOptions } from './generator.js';

export type PatternPreset = Required<Pick<PatternGeneratorOptions, 'pattern' | 'tokens'>> & {
  description: string;
  example: Readonly<Record<string, string>>;
};

const upperCaseCode = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    // Runs are already single dashes, so at most one sits at each end.
    .replace(/^-/, '')
    .replace(/-$/, '');

/**
 * Ready-made patterns. Spread one into `createPatternGenerator` and override what you need:
 * `createPatternGenerator({ ...presets.club, store })`.
 */
export const presets = {
  /** Club, role, area and year: `HKNET#1-2/1234-2024`. The year defaults to the current one. */
  club: {
    description: 'Club or organisation, role, area and year, e.g. HKNET#1-2/1234-2024.',
    pattern: '{club}#{role}/{area}-{year}',
    example: { club: 'HKNET', role: '1-2', area: '1234', year: '2024' },
    tokens: {
      club: {
        description: 'Club or organisation code; upper-cased, other characters become "-".',
        normalize: upperCaseCode,
        validate: /[\p{Lu}\p{N}]+(?:-[\p{Lu}\p{N}]+)*/u,
        match: '[^#]+',
      },
      role: {
        description: 'Role code such as 1-2; spaces are removed and "_" becomes "-".',
        normalize: (value) => value.replaceAll(/\s+/g, '').replaceAll('_', '-'),
        validate: /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/u,
        match: '[^/]+',
      },
      area: {
        description: 'Area code; upper-cased without spaces.',
        normalize: (value) => value.replaceAll(/\s+/g, '').toUpperCase(),
        validate: /[\p{Lu}\p{N}]+/u,
        match: '[^-]+',
      },
      year: {
        description: 'Four-digit year; defaults to the current year.',
        required: false,
        default: ({ date, utc }) => String(utc ? date.getUTCFullYear() : date.getFullYear()),
        normalize: (value) => value.trim(),
        validate: /\d{4}/,
        match: String.raw`\d{4}`,
      },
    },
  },
  /** Invoice numbers: `INV-2026-00042`. Add `scope: (values) => String(values.year)` to start at 1 every year. */
  invoice: {
    description:
      'Invoice numbers, e.g. INV-2026-00042. Add scope: (values) => String(values.year) to start at 1 every year.',
    pattern: 'INV-{year}-{seq:5}',
    example: {},
    tokens: {},
  },
  /** Order numbers with date and a short random part: `ORD-20261012-7KQ2XD`. */
  order: {
    description: 'Order numbers with date and random part, e.g. ORD-20261012-7KQ2XD.',
    pattern: 'ORD-{date}-{random}',
    example: {},
    tokens: {},
  },
} satisfies Record<string, PatternPreset>;

export type PresetName = keyof typeof presets;
