// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * Format detection and parsing, delegating to the vscode-coverage-gutters
 * parser packages. Each parser yields the same "coverage section" shape:
 *
 *   { file, lines: { details: [{ line, hit }] },
 *           branches?: { details: [{ line, taken }] } }
 *
 * from which we derive per-line {@link LineState}: `hit>0` is Covered, `hit==0`
 * is Uncovered, and a Covered line that has an untaken branch is Partial.
 */

import lcovParse from "lcov-parse";
import jacocoParse from "@7sean68/jacoco-parse";
import coberturaParse from "cobertura-parse";
import cloverParse from "@cvrg-report/clover-json";

import { Coverage, LineState, type LineMap } from "./model.js";

export type Format = "lcov" | "jacoco" | "cobertura" | "clover";

interface LineDetail {
  line: number;
  hit: number;
}
interface BranchDetail {
  line: number;
  taken: number;
}
interface Section {
  file: string;
  lines?: { details?: LineDetail[] };
  branches?: { details?: BranchDetail[] };
}

/** Does this content look like an XML report? */
export function isXml(content: string): boolean {
  const t = content.trimStart();
  return t.startsWith("<?xml") || t.startsWith("<!DOCTYPE") || t.startsWith("<");
}

/** Detect the coverage format from the report content. */
export function detectFormat(content: string): Format {
  if (!isXml(content)) return "lcov";
  const head = content.slice(0, 4096);
  if (/<!DOCTYPE\s+report|-\/\/JACOCO\/\/|<report[\s>]/.test(head)) return "jacoco";
  if (/clover=|<project[\s>]/.test(head)) return "clover";
  return "cobertura";
}

/**
 * Parse a report, auto-detecting its format, into the shared model. A report
 * that is empty, malformed or misdetected yields an empty {@link Coverage}
 * rather than throwing, so one bad file never breaks the others.
 */
export async function parse(content: string): Promise<Coverage> {
  try {
    const sections = await parseSections(detectFormat(content), content);
    return toCoverage(sections);
  } catch {
    return new Coverage();
  }
}

function parseSections(format: Format, content: string): Promise<Section[]> {
  switch (format) {
    case "lcov":
      return fromCallback((cb) => lcovParse.source(content, cb));
    case "jacoco":
      return fromCallback((cb) => jacocoParse.parseContent(content, cb));
    case "cobertura":
      return fromCallback((cb) => coberturaParse.parseContent(content, cb));
    case "clover":
      return Promise.resolve(cloverParse.parseContent(content)).then(asSections);
  }
}

/** Wrap a node-style callback parser as a promise of coverage sections. */
function fromCallback(
  invoke: (cb: (err: unknown, data: unknown) => void) => void,
): Promise<Section[]> {
  return new Promise((resolve, reject) => {
    try {
      invoke((err, data) => (err ? reject(err) : resolve(asSections(data))));
    } catch (err) {
      // Some parsers throw synchronously on a mismatched document shape.
      reject(err);
    }
  });
}

function asSections(data: unknown): Section[] {
  return Array.isArray(data) ? (data as Section[]) : [];
}

/** Fold parser sections into the shared {@link Coverage} model. */
export function toCoverage(sections: Section[]): Coverage {
  const cov = new Coverage();
  for (const section of sections) {
    if (!section?.file) continue;
    const lines: LineMap = new Map();
    for (const d of section.lines?.details ?? []) {
      if (!Number.isFinite(d.line)) continue;
      lines.set(d.line, d.hit > 0 ? LineState.Covered : LineState.Uncovered);
    }
    // A covered line with any untaken branch is only partially covered.
    for (const b of section.branches?.details ?? []) {
      if ((b.taken ?? 0) <= 0 && lines.get(b.line) === LineState.Covered) {
        lines.set(b.line, LineState.Partial);
      }
    }
    cov.insertFile(section.file, lines);
  }
  return cov;
}
