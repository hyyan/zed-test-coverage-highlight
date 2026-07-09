// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

// Minimal, self-contained report fixtures — one per supported format. Each
// exercises covered (line 1), uncovered (line 2) and, where the format carries
// branch data, partial (line 3).

export const LCOV = `TN:
SF:src/main.ts
DA:1,3
DA:2,0
DA:3,5
BRDA:3,0,0,1
BRDA:3,0,1,-
end_of_record
`;

// Includes the XML prolog AND the DTD that trips naive XML parsers.
export const JACOCO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">
<report name="app">
  <package name="com/example">
    <class name="com/example/Foo" sourcefilename="Foo.java"/>
    <sourcefile name="Foo.java">
      <line nr="1" mi="0" ci="5" mb="0" cb="0"/>
      <line nr="2" mi="2" ci="0" mb="0" cb="0"/>
      <line nr="3" mi="1" ci="4" mb="1" cb="1"/>
    </sourcefile>
  </package>
</report>
`;

export const COBERTURA = `<?xml version="1.0"?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="0.6">
  <packages>
    <package name="pkg">
      <classes>
        <class name="Foo" filename="src/foo.py">
          <methods/>
          <lines>
            <line number="1" hits="1" branch="false"/>
            <line number="2" hits="0" branch="false"/>
            <line number="3" hits="1" branch="true" condition-coverage="50% (1/2)"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>
`;

export const CLOVER = `<?xml version="1.0"?>
<coverage clover="4.0.0" generated="0">
  <project name="p">
    <package name="pkg">
      <file name="src/bar.js" path="src/bar.js">
        <metrics statements="3" coveredstatements="2"/>
        <line num="1" count="1" type="stmt"/>
        <line num="2" count="0" type="stmt"/>
        <line num="3" count="4" type="cond" truecount="1" falsecount="0"/>
      </file>
    </package>
  </project>
</coverage>
`;
