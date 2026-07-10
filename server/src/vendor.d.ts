// Type declarations for the untyped vscode-coverage-gutters parser packages.
// Each yields the same "coverage section" shape; we validate it in parsers/.

type ParseCallback = (err: unknown, data: unknown) => void;

declare module "lcov-parse" {
  const parse: {
    (file: string, cb: ParseCallback): void;
    /** Parse raw lcov text directly, bypassing the file-exists check. */
    source(str: string, cb: ParseCallback): void;
  };
  export default parse;
}

declare module "@7sean68/jacoco-parse" {
  const parse: {
    parseContent(xml: string, cb: ParseCallback): void;
    parseFile(file: string, cb: ParseCallback): void;
  };
  export default parse;
}

declare module "cobertura-parse" {
  const parse: {
    parseContent(xml: string, cb: ParseCallback): void;
    parseFile(file: string, cb: ParseCallback): void;
  };
  export default parse;
}

declare module "@cvrg-report/clover-json" {
  const parse: {
    parseContent(xml: string): Promise<unknown>;
    parseFile(file: string): Promise<unknown>;
  };
  export default parse;
}
